import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { derivePaymentStatus } from './domain/payment-status.js';
import { PaymentRepository } from './payment.repository.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { CancelPaymentDto } from './dto/cancel-payment.dto.js';
import type { PaymentListResponse } from './dto/payment.response.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import { DataScopeService } from '../../common/access/data-scope.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  private async assertJobAccess(jobId: string) {
    const job = await this.txHost.tx.job.findFirst({
      where: { id: jobId, deletedAt: null, ...this.scope.jobViewScope() },
    });
    if (!job) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    return job;
  }

  private async assertPolicyAccess(policyId: string) {
    const policy = await this.txHost.tx.policy.findFirst({ where: { id: policyId } });
    if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    try {
      await this.assertJobAccess(policy.jobId);
    } catch {
      throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    return policy;
  }

  async listAll(query: { policyId?: string; page?: number; perPage?: number; limit?: number }): Promise<{ items: PaymentListResponse[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.perPage ?? query.limit ?? 20;
    const skip = (page - 1) * limit;

    if (query.policyId) {
      await this.assertPolicyAccess(query.policyId);
    }

    const where: Prisma.PaymentWhereInput = {
      ...(query.policyId ? { policyId: query.policyId } : {}),
      policy: { job: { deletedAt: null, ...this.scope.jobViewScope() } },
    };
    const [payments, total] = await Promise.all([
      this.txHost.tx.payment.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.txHost.tx.payment.count({ where }),
    ]);

    return {
      items: payments.map((p) => ({ ...p, amount: p.amount.toString() })) as unknown as PaymentListResponse[],
      total,
    };
  }

  async listByPolicy(policyId: string): Promise<PaymentListResponse> {
    const policy = await this.assertPolicyAccess(policyId);

    const payments = await this.repo.findByPolicy(policyId);
    const totalPaid = await this.repo.sumActive(policyId);

    const paymentStatus = derivePaymentStatus({
      totalPremium: policy.totalPremium.toString(),
      totalPaid,
      paymentDueDate: policy.paymentDueDate,
    });

    return {
      payments: payments.map((p) => ({ ...p, amount: p.amount.toString() })),
      totalPaid,
      paymentStatus,
    };
  }

  @Transactional()
  async create(policyId: string, dto: CreatePaymentDto, idempotencyKey?: string): Promise<PaymentListResponse> {
    const userId = this.cls.get('userId')!;
    const permissions = this.cls.get('permissions') ?? [];

    const policy = await this.assertPolicyAccess(policyId);
    if (policy.status === 'CANCELLED') {
      throw new BusinessException('POLICY_INVALID_STATUS', 'Cannot add payment to a cancelled policy', 409);
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.txHost.tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing) {
        return this.listByPolicy(policyId);
      }
    }

    const amount = parseFloat(dto.amount);
    if (amount <= 0) {
      throw new BusinessException('PAYMENT_INVALID_AMOUNT', 'Amount must be greater than zero', 422);
    }

    // BR-011: check overpay
    const currentPaid = parseFloat(await this.repo.sumActive(policyId));
    const totalPremium = parseFloat(policy.totalPremium.toString());
    const wouldExceed = currentPaid + amount > totalPremium;
    if (wouldExceed && !permissions.includes('payment.overpay')) {
      throw new BusinessException(
        'PAYMENT_EXCEEDS_PREMIUM',
        `Payment would exceed total premium of ${policy.totalPremium}`,
        422,
      );
    }

    const paymentNo = await this.sequence.next('PAYMENT');
    const payment = await this.repo.create({
      paymentNo,
      policy: { connect: { id: policyId } },
      paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      referenceNo: dto.referenceNo,
      remark: dto.remark,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    if (idempotencyKey) {
      await this.txHost.tx.idempotencyKey.create({
        data: { key: idempotencyKey, entityType: 'PAYMENT', entityId: payment.id },
      });
    }

    await this.audit.log({
      action: 'CREATE_PAYMENT',
      entityType: 'PAYMENT',
      entityId: payment.id,
      jobId: policy.jobId,
      after: payment,
      remark: dto.remark,
    });

    return this.listByPolicy(policyId);
  }

  @Transactional()
  async cancel(id: string, dto: CancelPaymentDto): Promise<PaymentListResponse> {
    const payment = await this.repo.findById(id);
    if (!payment) throw new BusinessException('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (payment.status === 'CANCELLED') {
      throw new BusinessException('PAYMENT_ALREADY_CANCELLED', 'Payment is already cancelled', 409);
    }

    const policy = await this.assertPolicyAccess(payment.policyId);

    const updated = await this.repo.update(id, { status: 'CANCELLED', cancelReason: dto.cancelReason });

    await this.audit.log({
      action: 'CANCEL_PAYMENT',
      entityType: 'PAYMENT',
      entityId: id,
      jobId: policy?.jobId,
      before: payment,
      after: updated,
      remark: dto.cancelReason,
    });

    return this.listByPolicy(payment.policyId);
  }
}

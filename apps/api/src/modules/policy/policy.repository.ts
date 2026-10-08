import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class PolicyRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

  private get db() { return this.txHost.tx; }

  private static readonly POLICY_INCLUDE = {
    coverages: { orderBy: { createdAt: 'asc' as const } },
  } as const;

  findPolicies(where: Prisma.PolicyWhereInput, skip?: number, take?: number) {
    return this.db.policy.findMany({
      where,
      skip,
      take,
      include: PolicyRepository.POLICY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findPolicyById(id: string) {
    return this.db.policy.findFirst({
      where: { id },
      include: PolicyRepository.POLICY_INCLUDE,
    });
  }

  findPolicyByJobId(jobId: string) {
    return this.db.policy.findFirst({
      where: { jobId },
      include: PolicyRepository.POLICY_INCLUDE,
    });
  }

  createPolicy(data: Prisma.PolicyCreateInput) {
    return this.db.policy.create({ data, include: PolicyRepository.POLICY_INCLUDE });
  }

  updatePolicy(id: string, data: Prisma.PolicyUpdateInput) {
    return this.db.policy.update({ where: { id }, data, include: PolicyRepository.POLICY_INCLUDE });
  }

  findBindingByJobId(jobId: string) {
    return this.db.binding.findUnique({ where: { jobId } });
  }

  findBindingByIdempotencyKey(key: string) {
    return this.db.binding.findUnique({ where: { idempotencyKey: key } });
  }

  createBinding(data: Prisma.BindingCreateInput) {
    return this.db.binding.create({ data });
  }

  saveIdempotencyKey(key: string, entityType: string, entityId: string) {
    return this.db.idempotencyKey.create({ data: { key, entityType, entityId } });
  }
}

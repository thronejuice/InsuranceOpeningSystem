import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import { Decimal } from 'decimal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';

/** Renewals still being worked (the pipeline); ACCEPTED onwards are decided. */
const OPEN_RENEWAL_STATUSES: ('PENDING' | 'IN_PROGRESS' | 'QUOTATION' | 'CUSTOMER_CONTACTED')[] = [
  'PENDING', 'IN_PROGRESS', 'QUOTATION', 'CUSTOMER_CONTACTED',
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  // ─── Agent Dashboard (spec §25.1) ────────────────────────────────────────

  async agentDashboard() {
    const userId = this.cls.get('userId')!;
    const tx = this.txHost.tx;

    const agentWhere = { agentId: userId, deletedAt: null };
    const now = new Date();

    const [
      myJobs,
      openJobs,
      waitingInfo,
      quotationJobs,
      waitingCustomer,
      bindingJobs,
      policyIssued,
      renewalJobs,
      overdueTasks,
    ] = await Promise.all([
      tx.job.count({ where: agentWhere }),
      tx.job.count({ where: { ...agentWhere, status: 'OPEN' } }),
      tx.job.count({ where: { ...agentWhere, status: 'WAITING_INFORMATION' } }),
      tx.job.count({ where: { ...agentWhere, status: { in: ['QUOTATION_REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED'] } } }),
      tx.job.count({ where: { ...agentWhere, status: { in: ['WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED'] } } }),
      tx.job.count({ where: { ...agentWhere, status: { in: ['WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING'] } } }),
      tx.job.count({ where: { ...agentWhere, status: 'POLICY_ISSUED' } }),
      tx.job.count({ where: { ...agentWhere, status: 'RENEWAL' } }),
      tx.task.count({
        where: {
          assignedTo: userId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      myJobs,
      openJobs,
      waitingInfo,
      quotationJobs,
      waitingCustomer,
      bindingJobs,
      policyIssued,
      renewalJobs,
      overdueTasks,
    };
  }

  // ─── Manager Dashboard (spec §25.2) ──────────────────────────────────────

  async managerDashboard() {
    const tx = this.txHost.tx;
    const now = new Date();
    const jobScope = this.scope.jobViewScope();
    const policyJobScope = { job: { deletedAt: null, ...jobScope } };

    const jobStatuses = [
      'DRAFT', 'OPEN', 'WAITING_INFORMATION', 'QUOTATION_REQUESTED', 'QUOTATION_RECEIVED',
      'QUOTATION_SELECTED', 'PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED',
      'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED',
      'RENEWAL', 'CANCELLED', 'CLOSED', 'EXPIRED',
    ];

    const [
      totalJobs,
      jobsByStatus,
      jobsByAgent,
      premiumResult,
      commissionResult,
      policyCount,
      overdueCount,
      arOutstandingResult,
      renewalCount,
      pendingApprovalCount,
    ] = await Promise.all([
      tx.job.count({ where: { deletedAt: null, ...jobScope } }),
      tx.job.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...jobScope },
        _count: { id: true },
      }),
      tx.job.groupBy({
        by: ['agentId'],
        where: { deletedAt: null, ...jobScope },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      tx.policy.aggregate({
        where: { status: { notIn: ['CANCELLED'] }, ...policyJobScope },
        _sum: { totalPremium: true },
      }),
      tx.commission.aggregate({
        where: { status: { notIn: ['CANCELLED'] }, policy: policyJobScope },
        _sum: { commissionAmount: true },
      }),
      tx.policy.count({ where: { status: 'ACTIVE', ...policyJobScope } }),
      tx.task.count({
        where: {
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: now },
          job: { deletedAt: null, ...jobScope },
        },
      }),
      this.arOutstanding(policyJobScope),
      tx.renewal.count({
        where: { status: { in: OPEN_RENEWAL_STATUSES }, previousPolicy: policyJobScope },
      }),
      tx.approval.count({
        where: { status: 'PENDING', job: { deletedAt: null, ...jobScope } },
      }),
    ]);

    const statusMap = Object.fromEntries(jobStatuses.map((s) => [s, 0]));
    for (const row of jobsByStatus) {
      statusMap[row.status] = row._count.id;
    }

    const conversion = totalJobs > 0 ? ((policyCount / totalJobs) * 100).toFixed(1) : '0.0';

    return {
      totalJobs,
      jobsByStatus: statusMap,
      jobsByAgent: jobsByAgent.map((r: { agentId: string; _count: { id: number } }) => ({ agentId: r.agentId, count: r._count.id })),
      totalPremium: premiumResult._sum.totalPremium?.toFixed(2) ?? '0.00',
      totalCommission: commissionResult._sum.commissionAmount?.toFixed(2) ?? '0.00',
      policyCount,
      conversionRate: conversion,
      overdueCount,
      arOutstanding: arOutstandingResult,
      renewalPipelineCount: renewalCount,
      pendingApprovals: pendingApprovalCount,
    };
  }

  /**
   * What customers still owe the broker: open invoices / debit notes minus the payments already received
   * against them, for the policies the caller may see. Decimal arithmetic, returned as a string.
   */
  private async arOutstanding(policyJobScope: Prisma.PolicyWhereInput): Promise<string> {
    const tx = this.txHost.tx;
    const open: Prisma.InvoiceWhereInput = {
      status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      type: { in: ['INVOICE', 'DEBIT_NOTE'] },
      policy: policyJobScope,
    };
    const [billed, received] = await Promise.all([
      tx.invoice.aggregate({ where: open, _sum: { amount: true } }),
      tx.payment.aggregate({ where: { status: 'ACTIVE', invoice: open }, _sum: { amount: true } }),
    ]);
    return new Decimal(billed._sum.amount ?? 0).minus(received._sum.amount ?? 0).toFixed(2);
  }

  // ─── Sales Funnel (spec §25.3) ────────────────────────────────────────────

  async funnel() {
    const tx = this.txHost.tx;
    const jobScope = { deletedAt: null, ...this.scope.jobViewScope() };
    const policyScope = { status: { not: 'CANCELLED' as const }, job: jobScope };

    const [
      totalJobs,
      quotationJobs,
      proposalJobs,
      acceptedJobs,
      policyJobs,
      premiumResult,
    ] = await Promise.all([
      tx.job.count({ where: jobScope }),
      tx.job.count({
        where: {
          ...jobScope,
          status: { in: ['QUOTATION_REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED', 'PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.job.count({
        where: {
          ...jobScope,
          status: { in: ['PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.job.count({
        where: {
          ...jobScope,
          status: { in: ['CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.policy.count({ where: policyScope }),
      tx.policy.aggregate({
        where: policyScope,
        _sum: { totalPremium: true },
        _avg: { totalPremium: true },
      }),
    ]);

    const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');

    return {
      stages: {
        job: totalJobs,
        quotation: quotationJobs,
        proposal: proposalJobs,
        accepted: acceptedJobs,
        policy: policyJobs,
      },
      metrics: {
        quotationConversion: pct(quotationJobs, totalJobs),
        proposalConversion: pct(proposalJobs, totalJobs),
        policyConversion: pct(policyJobs, totalJobs),
        totalPremium: premiumResult._sum.totalPremium?.toFixed(2) ?? '0.00',
        averagePremium: premiumResult._avg.totalPremium?.toFixed(2) ?? '0.00',
      },
    };
  }
}

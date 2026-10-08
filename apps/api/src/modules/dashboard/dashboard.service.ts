import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';

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
      tx.policy.count({ where: { status: 'ISSUED', ...policyJobScope } }),
      tx.task.count({
        where: {
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: now },
          job: { deletedAt: null, ...jobScope },
        },
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
    };
  }

  // ─── Sales Funnel (spec §25.3) ────────────────────────────────────────────

  async funnel() {
    const tx = this.txHost.tx;

    const [
      totalJobs,
      quotationJobs,
      proposalJobs,
      acceptedJobs,
      policyJobs,
      premiumResult,
    ] = await Promise.all([
      tx.job.count({ where: { deletedAt: null } }),
      tx.job.count({
        where: {
          deletedAt: null,
          status: { in: ['QUOTATION_REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED', 'PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.job.count({
        where: {
          deletedAt: null,
          status: { in: ['PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.job.count({
        where: {
          deletedAt: null,
          status: { in: ['CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED', 'RENEWAL', 'CLOSED'] },
        },
      }),
      tx.policy.count({ where: { status: { not: 'CANCELLED' as const } } }),
      tx.policy.aggregate({
        where: { status: { not: 'CANCELLED' as const } },
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

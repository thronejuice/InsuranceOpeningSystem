import { Injectable, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppClsStore } from '../cls/app-cls-store.js';
import {
  DataScope,
  ROLE_DATA_SCOPE,
  resolveEffectiveScope,
  buildJobScope,
  buildCustomerScope,
  buildPolicyScope,
  canViewJob,
  canViewCustomer,
  type ScopeContext,
  type JobScopeCheckInput,
  type CustomerScopeCheckInput,
} from './domain/data-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DataScopeService {
  constructor(
    private readonly cls: ClsService<AppClsStore>,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  getScopeContext(): ScopeContext {
    const userId = this.cls.get('userId') ?? '';
    const branchId = this.cls.get('branchId') ?? null;
    const teamUserIds = this.cls.get('teamUserIds');
    const roles = (this.cls.get('roles') ?? []) as string[];
    const permissions = this.cls.get('permissions') ?? [];

    let scope = this.cls.get('dataScope') as DataScope | undefined;
    if (!scope) {
      if (roles.length > 0) {
        const mappedScopes = roles.map((r) => ROLE_DATA_SCOPE[r]).filter(Boolean);
        if (mappedScopes.length > 0) {
          scope = resolveEffectiveScope(mappedScopes);
        }
      }
      if (!scope) {
        if (permissions.includes('job.view_all')) {
          scope = DataScope.ALL;
        } else {
          scope = DataScope.OWN;
        }
      }
    }

    return {
      userId,
      branchId,
      teamUserIds,
      scope,
    };
  }

  /** Prisma WHERE clause that restricts the query to jobs the current user may view (BR-014 / D-21). */
  jobViewScope(): Prisma.JobWhereInput {
    const ctx = this.getScopeContext();
    return buildJobScope(ctx);
  }

  /** Prisma WHERE clause that restricts the query to customers the current user may view (D-21 / Q11). */
  customerViewScope(): Prisma.CustomerWhereInput {
    const ctx = this.getScopeContext();
    return buildCustomerScope(ctx);
  }

  /** Prisma WHERE clause that restricts the query to policies the current user may view (D-21). */
  policyViewScope(): Prisma.PolicyWhereInput {
    const ctx = this.getScopeContext();
    return buildPolicyScope(ctx);
  }

  /** In-memory check: can the current user view this job? */
  canViewJob(job: JobScopeCheckInput): boolean {
    const ctx = this.getScopeContext();
    return canViewJob(ctx, job);
  }

  /** In-memory check: can the current user view this customer? */
  canViewCustomer(customer: CustomerScopeCheckInput): boolean {
    const ctx = this.getScopeContext();
    return canViewCustomer(ctx, customer);
  }

  /** True if the current user may update a job owned by agentId (BR-014). */
  canUpdateJob(jobAgentId: string): boolean {
    const ctx = this.getScopeContext();
    const permissions = this.cls.get('permissions') ?? [];
    if (permissions.includes('job.update_all') || jobAgentId === ctx.userId) return true;
    if (ctx.scope === DataScope.ALL) return true;
    if (ctx.scope === DataScope.TEAM) {
      const team = ctx.teamUserIds?.length ? ctx.teamUserIds : [ctx.userId];
      return team.includes(jobAgentId) && permissions.includes('job.update');
    }
    return false;
  }

  /** True if the current user may assign a job (Day 1). */
  canAssignJob(jobAgentId: string): boolean {
    const ctx = this.getScopeContext();
    const permissions = this.cls.get('permissions') ?? [];
    if (!permissions.includes('job.assign')) return false;
    if (permissions.includes('job.view_all') || permissions.includes('job.update_all') || jobAgentId === ctx.userId) return true;
    if (ctx.scope === DataScope.TEAM) {
      const team = ctx.teamUserIds?.length ? ctx.teamUserIds : [ctx.userId];
      return team.includes(jobAgentId);
    }
    return false;
  }
}

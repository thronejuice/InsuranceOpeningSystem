import type { Prisma } from '../../../generated/prisma/client.js';

export enum DataScope {
  OWN = 'OWN',
  ASSIGNED = 'ASSIGNED',
  TEAM = 'TEAM',
  BRANCH = 'BRANCH',
  ALL = 'ALL',
}

export interface ScopeContext {
  userId: string;
  branchId?: string | null;
  teamUserIds?: string[];
  scope: DataScope;
}

export interface UserHierarchyNode {
  id: string;
  managerId?: string | null;
}

const SCOPE_RANK: Record<DataScope, number> = {
  [DataScope.ALL]: 5,
  [DataScope.BRANCH]: 4,
  [DataScope.TEAM]: 3,
  [DataScope.ASSIGNED]: 2,
  [DataScope.OWN]: 1,
};

export const ROLE_DATA_SCOPE: Record<string, DataScope> = {
  ADMIN: DataScope.ALL,
  FINANCE: DataScope.ALL,
  VIEWER: DataScope.ALL,
  MANAGER: DataScope.TEAM,
  SUPERVISOR: DataScope.TEAM,
  BROKER_STAFF: DataScope.BRANCH,
  AGENT: DataScope.OWN,
};

/**
 * Resolves the effective scope from a list of granted scopes (chooses the highest privilege).
 */
export function resolveEffectiveScope(scopes: DataScope[]): DataScope {
  if (!scopes || scopes.length === 0) return DataScope.OWN;
  let highest = DataScope.OWN;
  for (const s of scopes) {
    if ((SCOPE_RANK[s] ?? 0) > (SCOPE_RANK[highest] ?? 0)) {
      highest = s;
    }
  }
  return highest;
}

/**
 * Recursively resolves all subordinate user IDs under a manager (including the manager themselves).
 * Handles arbitrary depths and protects against circular references.
 */
export function resolveTeamUserIds(
  userId: string,
  allUsers: UserHierarchyNode[],
): string[] {
  const result = new Set<string>([userId]);
  const queue = [userId];

  // Map managerId -> direct subordinate ids
  const subordinatesByManager = new Map<string, string[]>();
  for (const u of allUsers) {
    if (u.managerId) {
      const list = subordinatesByManager.get(u.managerId) ?? [];
      list.push(u.id);
      subordinatesByManager.set(u.managerId, list);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const directSubs = subordinatesByManager.get(current) ?? [];
    for (const subId of directSubs) {
      if (!result.has(subId)) {
        result.add(subId);
        queue.push(subId);
      }
    }
  }

  return Array.from(result);
}

/**
 * Builds Prisma WHERE clause for Job based on DataScope (Day 2 / D-21).
 */
export function buildJobScope(ctx: ScopeContext): Prisma.JobWhereInput {
  switch (ctx.scope) {
    case DataScope.ALL:
      return {};

    case DataScope.OWN:
      return {
        OR: [
          { agentId: ctx.userId },
          { createdById: ctx.userId },
        ],
      };

    case DataScope.ASSIGNED:
      return {
        OR: [
          { assignedTo: ctx.userId },
          { brokerStaffId: ctx.userId },
          { agentId: ctx.userId },
          { createdById: ctx.userId },
        ],
      };

    case DataScope.TEAM: {
      const team = ctx.teamUserIds && ctx.teamUserIds.length > 0 ? ctx.teamUserIds : [ctx.userId];
      return {
        OR: [
          { agentId: { in: team } },
          { assignedTo: { in: team } },
          { brokerStaffId: { in: team } },
          { createdById: { in: team } },
        ],
      };
    }

    case DataScope.BRANCH:
      if (ctx.branchId) {
        return {
          OR: [
            { branchId: ctx.branchId },
            { agent: { branchId: ctx.branchId } },
            { brokerStaffId: ctx.userId },
            { assignedTo: ctx.userId },
          ],
        };
      }
      return {
        OR: [
          { assignedTo: ctx.userId },
          { brokerStaffId: ctx.userId },
          { agentId: ctx.userId },
          { createdById: ctx.userId },
        ],
      };
  }
}

/**
 * Builds Prisma WHERE clause for Policy based on DataScope (Day 2 / D-21).
 */
export function buildPolicyScope(ctx: ScopeContext): Prisma.PolicyWhereInput {
  switch (ctx.scope) {
    case DataScope.ALL:
      return {};

    case DataScope.OWN:
      return {
        OR: [
          { createdById: ctx.userId },
          {
            job: {
              OR: [
                { agentId: ctx.userId },
                { createdById: ctx.userId },
              ],
            },
          },
        ],
      };

    case DataScope.ASSIGNED:
      return {
        OR: [
          { createdById: ctx.userId },
          {
            job: {
              OR: [
                { assignedTo: ctx.userId },
                { brokerStaffId: ctx.userId },
                { agentId: ctx.userId },
                { createdById: ctx.userId },
              ],
            },
          },
        ],
      };

    case DataScope.TEAM: {
      const team = ctx.teamUserIds && ctx.teamUserIds.length > 0 ? ctx.teamUserIds : [ctx.userId];
      return {
        OR: [
          { createdById: { in: team } },
          {
            job: {
              OR: [
                { agentId: { in: team } },
                { assignedTo: { in: team } },
                { brokerStaffId: { in: team } },
                { createdById: { in: team } },
              ],
            },
          },
        ],
      };
    }

    case DataScope.BRANCH:
      if (ctx.branchId) {
        return {
          OR: [
            { createdById: ctx.userId },
            {
              job: {
                OR: [
                  { branchId: ctx.branchId },
                  { agent: { branchId: ctx.branchId } },
                  { brokerStaffId: ctx.userId },
                  { assignedTo: ctx.userId },
                ],
              },
            },
          ],
        };
      }
      return {
        OR: [
          { createdById: ctx.userId },
          {
            job: {
              OR: [
                { assignedTo: ctx.userId },
                { brokerStaffId: ctx.userId },
                { agentId: ctx.userId },
                { createdById: ctx.userId },
              ],
            },
          },
        ],
      };
  }
}

/**
 * Builds Prisma WHERE clause for Customer based on DataScope (Day 2 / D-21 / Q11).
 * Shows customers created by the user or customers related to jobs visible within scope.
 */
export function buildCustomerScope(ctx: ScopeContext): Prisma.CustomerWhereInput {
  switch (ctx.scope) {
    case DataScope.ALL:
      return {};

    case DataScope.OWN:
      return {
        OR: [
          { createdById: ctx.userId },
          {
            jobs: {
              some: {
                OR: [
                  { agentId: ctx.userId },
                  { createdById: ctx.userId },
                ],
              },
            },
          },
        ],
      };

    case DataScope.ASSIGNED:
      return {
        OR: [
          { createdById: ctx.userId },
          {
            jobs: {
              some: {
                OR: [
                  { assignedTo: ctx.userId },
                  { brokerStaffId: ctx.userId },
                  { agentId: ctx.userId },
                  { createdById: ctx.userId },
                ],
              },
            },
          },
        ],
      };

    case DataScope.TEAM: {
      const team = ctx.teamUserIds && ctx.teamUserIds.length > 0 ? ctx.teamUserIds : [ctx.userId];
      return {
        OR: [
          { createdById: { in: team } },
          {
            jobs: {
              some: {
                OR: [
                  { agentId: { in: team } },
                  { assignedTo: { in: team } },
                  { brokerStaffId: { in: team } },
                  { createdById: { in: team } },
                ],
              },
            },
          },
        ],
      };
    }

    case DataScope.BRANCH:
      if (ctx.branchId) {
        return {
          OR: [
            { createdById: ctx.userId },
            {
              jobs: {
                some: {
                  OR: [
                    { branchId: ctx.branchId },
                    { agent: { branchId: ctx.branchId } },
                    { brokerStaffId: ctx.userId },
                    { assignedTo: ctx.userId },
                  ],
                },
              },
            },
          ],
        };
      }
      return {
        OR: [
          { createdById: ctx.userId },
          {
            jobs: {
              some: {
                OR: [
                  { assignedTo: ctx.userId },
                  { brokerStaffId: ctx.userId },
                  { agentId: ctx.userId },
                  { createdById: ctx.userId },
                ],
              },
            },
          },
        ],
      };
  }
}

export interface JobScopeCheckInput {
  agentId: string;
  createdById?: string | null;
  assignedTo?: string | null;
  brokerStaffId?: string | null;
  branchId?: string | null;
  agent?: { branchId?: string | null } | null;
}

export interface CustomerScopeCheckInput {
  id: string;
  createdById?: string | null;
  jobs?: JobScopeCheckInput[];
}

/**
 * Pure evaluation whether a Job is visible to the given ScopeContext.
 */
export function canViewJob(ctx: ScopeContext, job: JobScopeCheckInput): boolean {
  switch (ctx.scope) {
    case DataScope.ALL:
      return true;

    case DataScope.OWN:
      return job.agentId === ctx.userId || job.createdById === ctx.userId;

    case DataScope.ASSIGNED:
      return (
        job.assignedTo === ctx.userId ||
        job.brokerStaffId === ctx.userId ||
        job.agentId === ctx.userId ||
        job.createdById === ctx.userId
      );

    case DataScope.TEAM: {
      const team = ctx.teamUserIds && ctx.teamUserIds.length > 0 ? ctx.teamUserIds : [ctx.userId];
      return (
        team.includes(job.agentId) ||
        (!!job.assignedTo && team.includes(job.assignedTo)) ||
        (!!job.brokerStaffId && team.includes(job.brokerStaffId)) ||
        (!!job.createdById && team.includes(job.createdById))
      );
    }

    case DataScope.BRANCH: {
      // Explicitly assigned to the user regardless of branch
      if (job.brokerStaffId === ctx.userId || job.assignedTo === ctx.userId) {
        return true;
      }
      if (ctx.branchId) {
        if (job.branchId && job.branchId === ctx.branchId) return true;
        if (job.agent?.branchId && job.agent.branchId === ctx.branchId) return true;
        if (!job.branchId && !job.agent?.branchId && (job.agentId === ctx.userId || job.createdById === ctx.userId)) {
          return true;
        }
        return false;
      }
      return (
        job.assignedTo === ctx.userId ||
        job.brokerStaffId === ctx.userId ||
        job.agentId === ctx.userId ||
        job.createdById === ctx.userId
      );
    }

    default:
      return false;
  }
}

/**
 * Pure evaluation whether a Customer is visible to the given ScopeContext (D-21).
 * User sees customers they created, or customers linked to any Job they can view.
 */
export function canViewCustomer(ctx: ScopeContext, customer: CustomerScopeCheckInput): boolean {
  if (ctx.scope === DataScope.ALL) return true;
  if (customer.createdById && customer.createdById === ctx.userId) return true;
  if (customer.jobs && customer.jobs.some((j) => canViewJob(ctx, j))) return true;
  return false;
}


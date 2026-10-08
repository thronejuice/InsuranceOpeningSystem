import { describe, expect, it } from 'vitest';
import {
  DataScope,
  buildCustomerScope,
  buildJobScope,
  buildPolicyScope,
  resolveEffectiveScope,
  resolveTeamUserIds,
  type ScopeContext,
} from './data-scope.js';

describe('DataScope Domain (Day 2 / D-21)', () => {
  const baseContext: ScopeContext = {
    userId: 'user-001',
    branchId: 'branch-bkk',
    teamUserIds: ['user-001', 'sub-001', 'sub-002'],
    scope: DataScope.OWN,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Job Scopes (5 Scopes)
  // ───────────────────────────────────────────────────────────────────────────

  describe('buildJobScope', () => {
    it('scope ALL: returns empty where clause (all jobs)', () => {
      const where = buildJobScope({ ...baseContext, scope: DataScope.ALL });
      expect(where).toEqual({});
    });

    it('scope OWN: filters by agentId or createdById', () => {
      const where = buildJobScope({ ...baseContext, scope: DataScope.OWN });
      expect(where).toEqual({
        OR: [
          { agentId: 'user-001' },
          { createdById: 'user-001' },
        ],
      });
    });

    it('scope ASSIGNED: filters by assignedTo, brokerStaffId, agentId, or createdById', () => {
      const where = buildJobScope({ ...baseContext, scope: DataScope.ASSIGNED });
      expect(where).toEqual({
        OR: [
          { assignedTo: 'user-001' },
          { brokerStaffId: 'user-001' },
          { agentId: 'user-001' },
          { createdById: 'user-001' },
        ],
      });
    });

    it('scope TEAM: filters by team user IDs (recursive subordinates)', () => {
      const where = buildJobScope({ ...baseContext, scope: DataScope.TEAM });
      expect(where).toEqual({
        OR: [
          { agentId: { in: ['user-001', 'sub-001', 'sub-002'] } },
          { assignedTo: { in: ['user-001', 'sub-001', 'sub-002'] } },
          { brokerStaffId: { in: ['user-001', 'sub-001', 'sub-002'] } },
          { createdById: { in: ['user-001', 'sub-001', 'sub-002'] } },
        ],
      });
    });

    it('scope TEAM without teamUserIds: falls back to user only', () => {
      const where = buildJobScope({ ...baseContext, teamUserIds: [], scope: DataScope.TEAM });
      expect(where).toEqual({
        OR: [
          { agentId: { in: ['user-001'] } },
          { assignedTo: { in: ['user-001'] } },
          { brokerStaffId: { in: ['user-001'] } },
          { createdById: { in: ['user-001'] } },
        ],
      });
    });

    it('scope BRANCH: filters by branchId, agent branch, or directly assigned', () => {
      const where = buildJobScope({ ...baseContext, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { branchId: 'branch-bkk' },
          { agent: { branchId: 'branch-bkk' } },
          { brokerStaffId: 'user-001' },
          { assignedTo: 'user-001' },
        ],
      });
    });

    it('scope BRANCH without branchId: falls back to ASSIGNED scope', () => {
      const where = buildJobScope({ ...baseContext, branchId: null, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { assignedTo: 'user-001' },
          { brokerStaffId: 'user-001' },
          { agentId: 'user-001' },
          { createdById: 'user-001' },
        ],
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Policy Scopes (5 Scopes)
  // ───────────────────────────────────────────────────────────────────────────

  describe('buildPolicyScope', () => {
    it('scope ALL: returns empty where clause', () => {
      const where = buildPolicyScope({ ...baseContext, scope: DataScope.ALL });
      expect(where).toEqual({});
    });

    it('scope OWN: filters by createdById or job ownership', () => {
      const where = buildPolicyScope({ ...baseContext, scope: DataScope.OWN });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            job: {
              OR: [
                { agentId: 'user-001' },
                { createdById: 'user-001' },
              ],
            },
          },
        ],
      });
    });

    it('scope ASSIGNED: filters by policy creator or assigned job', () => {
      const where = buildPolicyScope({ ...baseContext, scope: DataScope.ASSIGNED });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            job: {
              OR: [
                { assignedTo: 'user-001' },
                { brokerStaffId: 'user-001' },
                { agentId: 'user-001' },
                { createdById: 'user-001' },
              ],
            },
          },
        ],
      });
    });

    it('scope TEAM: filters by team creator or job owned by team', () => {
      const where = buildPolicyScope({ ...baseContext, scope: DataScope.TEAM });
      expect(where).toEqual({
        OR: [
          { createdById: { in: ['user-001', 'sub-001', 'sub-002'] } },
          {
            job: {
              OR: [
                { agentId: { in: ['user-001', 'sub-001', 'sub-002'] } },
                { assignedTo: { in: ['user-001', 'sub-001', 'sub-002'] } },
                { brokerStaffId: { in: ['user-001', 'sub-001', 'sub-002'] } },
                { createdById: { in: ['user-001', 'sub-001', 'sub-002'] } },
              ],
            },
          },
        ],
      });
    });

    it('scope BRANCH: filters by branch jobs or assigned jobs', () => {
      const where = buildPolicyScope({ ...baseContext, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            job: {
              OR: [
                { branchId: 'branch-bkk' },
                { agent: { branchId: 'branch-bkk' } },
                { brokerStaffId: 'user-001' },
                { assignedTo: 'user-001' },
              ],
            },
          },
        ],
      });
    });

    it('scope BRANCH without branchId: falls back to ASSIGNED scope', () => {
      const where = buildPolicyScope({ ...baseContext, branchId: null, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            job: {
              OR: [
                { assignedTo: 'user-001' },
                { brokerStaffId: 'user-001' },
                { agentId: 'user-001' },
                { createdById: 'user-001' },
              ],
            },
          },
        ],
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Customer Scopes (5 Scopes)
  // ───────────────────────────────────────────────────────────────────────────

  describe('buildCustomerScope', () => {
    it('scope ALL: returns empty where clause', () => {
      const where = buildCustomerScope({ ...baseContext, scope: DataScope.ALL });
      expect(where).toEqual({});
    });

    it('scope OWN: customer created by user or linked to user owned jobs', () => {
      const where = buildCustomerScope({ ...baseContext, scope: DataScope.OWN });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            jobs: {
              some: {
                OR: [
                  { agentId: 'user-001' },
                  { createdById: 'user-001' },
                ],
              },
            },
          },
        ],
      });
    });

    it('scope ASSIGNED: customer created by user or linked to assigned jobs', () => {
      const where = buildCustomerScope({ ...baseContext, scope: DataScope.ASSIGNED });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            jobs: {
              some: {
                OR: [
                  { assignedTo: 'user-001' },
                  { brokerStaffId: 'user-001' },
                  { agentId: 'user-001' },
                  { createdById: 'user-001' },
                ],
              },
            },
          },
        ],
      });
    });

    it('scope TEAM: customer created by team or linked to team jobs', () => {
      const where = buildCustomerScope({ ...baseContext, scope: DataScope.TEAM });
      expect(where).toEqual({
        OR: [
          { createdById: { in: ['user-001', 'sub-001', 'sub-002'] } },
          {
            jobs: {
              some: {
                OR: [
                  { agentId: { in: ['user-001', 'sub-001', 'sub-002'] } },
                  { assignedTo: { in: ['user-001', 'sub-001', 'sub-002'] } },
                  { brokerStaffId: { in: ['user-001', 'sub-001', 'sub-002'] } },
                  { createdById: { in: ['user-001', 'sub-001', 'sub-002'] } },
                ],
              },
            },
          },
        ],
      });
    });

    it('scope BRANCH: customer created by user or linked to branch jobs', () => {
      const where = buildCustomerScope({ ...baseContext, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            jobs: {
              some: {
                OR: [
                  { branchId: 'branch-bkk' },
                  { agent: { branchId: 'branch-bkk' } },
                  { brokerStaffId: 'user-001' },
                  { assignedTo: 'user-001' },
                ],
              },
            },
          },
        ],
      });
    });

    it('scope BRANCH without branchId: falls back to ASSIGNED scope', () => {
      const where = buildCustomerScope({ ...baseContext, branchId: null, scope: DataScope.BRANCH });
      expect(where).toEqual({
        OR: [
          { createdById: 'user-001' },
          {
            jobs: {
              some: {
                OR: [
                  { assignedTo: 'user-001' },
                  { brokerStaffId: 'user-001' },
                  { agentId: 'user-001' },
                  { createdById: 'user-001' },
                ],
              },
            },
          },
        ],
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Recursive Team Hierarchy Calculation
  // ───────────────────────────────────────────────────────────────────────────

  describe('resolveTeamUserIds', () => {
    it('returns only userId when user has no subordinates', () => {
      const users = [
        { id: 'mgr-1', managerId: null },
        { id: 'other-1', managerId: null },
      ];
      expect(resolveTeamUserIds('mgr-1', users)).toEqual(['mgr-1']);
    });

    it('returns userId and direct subordinates', () => {
      const users = [
        { id: 'mgr-1', managerId: null },
        { id: 'agent-1', managerId: 'mgr-1' },
        { id: 'agent-2', managerId: 'mgr-1' },
        { id: 'agent-3', managerId: 'other-mgr' },
      ];
      const result = resolveTeamUserIds('mgr-1', users);
      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(['mgr-1', 'agent-1', 'agent-2']));
      expect(result).not.toContain('agent-3');
    });

    it('recursively resolves multi-level hierarchy (Manager → Supervisor → Agents)', () => {
      const users = [
        { id: 'manager', managerId: null },
        { id: 'supervisor-1', managerId: 'manager' },
        { id: 'agent-1', managerId: 'supervisor-1' },
        { id: 'agent-2', managerId: 'supervisor-1' },
        { id: 'sub-agent-1', managerId: 'agent-1' },
        { id: 'supervisor-2', managerId: 'manager' },
        { id: 'agent-3', managerId: 'supervisor-2' },
        { id: 'other-root', managerId: null },
      ];

      // Manager sees both supervisor branches and all downstream agents
      const mgrTeam = resolveTeamUserIds('manager', users);
      expect(mgrTeam).toHaveLength(7);
      expect(mgrTeam).toEqual(
        expect.arrayContaining([
          'manager',
          'supervisor-1',
          'agent-1',
          'agent-2',
          'sub-agent-1',
          'supervisor-2',
          'agent-3',
        ]),
      );
      expect(mgrTeam).not.toContain('other-root');

      // Supervisor 1 only sees their sub-tree
      const sup1Team = resolveTeamUserIds('supervisor-1', users);
      expect(sup1Team).toHaveLength(4);
      expect(sup1Team).toEqual(
        expect.arrayContaining(['supervisor-1', 'agent-1', 'agent-2', 'sub-agent-1']),
      );
      expect(sup1Team).not.toContain('manager');
      expect(sup1Team).not.toContain('supervisor-2');
    });

    it('safely handles circular manager references without infinite loop', () => {
      const users = [
        { id: 'u-1', managerId: 'u-2' },
        { id: 'u-2', managerId: 'u-1' },
      ];
      const result = resolveTeamUserIds('u-1', users);
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining(['u-1', 'u-2']));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Effective Scope Resolution
  // ───────────────────────────────────────────────────────────────────────────

  describe('resolveEffectiveScope', () => {
    it('returns OWN by default if no scopes provided', () => {
      expect(resolveEffectiveScope([])).toBe(DataScope.OWN);
    });

    it('picks highest privilege scope from the list', () => {
      expect(resolveEffectiveScope([DataScope.OWN, DataScope.ASSIGNED])).toBe(DataScope.ASSIGNED);
      expect(resolveEffectiveScope([DataScope.ASSIGNED, DataScope.TEAM])).toBe(DataScope.TEAM);
      expect(resolveEffectiveScope([DataScope.TEAM, DataScope.BRANCH])).toBe(DataScope.BRANCH);
      expect(resolveEffectiveScope([DataScope.OWN, DataScope.BRANCH, DataScope.ALL])).toBe(DataScope.ALL);
    });
  });
});


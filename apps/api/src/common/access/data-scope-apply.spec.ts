import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import type { ClsService } from 'nestjs-cls';
import { DataScopeService } from './data-scope.service.js';
import type { AppClsStore } from '../cls/app-cls-store.js';

describe('Phase 0 Day 3 — Data Scope Application', () => {
  function makeCls(values: Partial<AppClsStore>): ClsService<AppClsStore> {
    return {
      get: vi.fn((key: keyof AppClsStore) => values[key]),
      set: vi.fn(),
    } as unknown as ClsService<AppClsStore>;
  }

  // ─── 1. In-memory & DataScopeService resolution ─────────────────────────

  describe('DataScopeService.canViewJob', () => {
    it('AGENT (OWN): sees only own items (created or agentId)', () => {
      const cls = makeCls({ userId: 'agent-1', roles: ['AGENT'] });
      const scope = new DataScopeService(cls);

      expect(scope.canViewJob({ agentId: 'agent-1' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'agent-2', createdById: 'agent-1' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'agent-2', createdById: 'agent-2' })).toBe(false);
    });

    it('BROKER_STAFF of Branch A: cannot see unassigned jobs of Branch B', () => {
      const cls = makeCls({
        userId: 'staff-a',
        roles: ['BROKER_STAFF'],
        branchId: 'branch-a',
      });
      const scope = new DataScopeService(cls);

      // Job in Branch A
      expect(scope.canViewJob({ agentId: 'agent-a', branchId: 'branch-a' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'agent-a', agent: { branchId: 'branch-a' } })).toBe(true);

      // Unassigned job in Branch B
      expect(scope.canViewJob({
        agentId: 'agent-b',
        branchId: 'branch-b',
        brokerStaffId: null,
        assignedTo: null,
      })).toBe(false);
    });

    it('BROKER_STAFF of Branch A: sees Branch B job if explicitly assigned', () => {
      const cls = makeCls({
        userId: 'staff-a',
        roles: ['BROKER_STAFF'],
        branchId: 'branch-a',
      });
      const scope = new DataScopeService(cls);

      // Branch B job assigned via brokerStaffId
      expect(scope.canViewJob({
        agentId: 'agent-b',
        branchId: 'branch-b',
        brokerStaffId: 'staff-a',
      })).toBe(true);

      // Branch B job assigned via assignedTo
      expect(scope.canViewJob({
        agentId: 'agent-b',
        branchId: 'branch-b',
        assignedTo: 'staff-a',
      })).toBe(true);
    });

    it('MANAGER / SUPERVISOR (TEAM): sees all jobs of their recursive team', () => {
      const cls = makeCls({
        userId: 'mgr-1',
        roles: ['MANAGER'],
        teamUserIds: ['mgr-1', 'sup-1', 'agent-1', 'agent-2'],
      });
      const scope = new DataScopeService(cls);

      expect(scope.canViewJob({ agentId: 'mgr-1' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'agent-1' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'agent-2' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'other-agent', assignedTo: 'sup-1' })).toBe(true);
      expect(scope.canViewJob({ agentId: 'other-agent', brokerStaffId: 'agent-2' })).toBe(true);

      // Outside team
      expect(scope.canViewJob({ agentId: 'other-agent', createdById: 'other-user' })).toBe(false);
    });

    it('FINANCE / ADMIN (ALL): sees all jobs', () => {
      const clsFinance = makeCls({ userId: 'fin-1', roles: ['FINANCE'] });
      const scopeFinance = new DataScopeService(clsFinance);

      expect(scopeFinance.canViewJob({ agentId: 'any-agent', branchId: 'any-branch' })).toBe(true);

      const clsAdmin = makeCls({ userId: 'admin-1', roles: ['ADMIN'] });
      const scopeAdmin = new DataScopeService(clsAdmin);

      expect(scopeAdmin.canViewJob({ agentId: 'any-agent', branchId: 'any-branch' })).toBe(true);
    });
  });

  // ─── 2. Customer Scope (D-21 / Q11) ──────────────────────────────────────

  describe('DataScopeService.canViewCustomer (D-21 / Q11)', () => {
    it('User sees customer created by themselves', () => {
      const cls = makeCls({ userId: 'agent-1', roles: ['AGENT'] });
      const scope = new DataScopeService(cls);

      expect(scope.canViewCustomer({ id: 'c1', createdById: 'agent-1', jobs: [] })).toBe(true);
    });

    it('User sees customer of accessible job even if created by another user', () => {
      const cls = makeCls({ userId: 'agent-1', roles: ['AGENT'] });
      const scope = new DataScopeService(cls);

      // Customer created by admin, but has job belonging to agent-1
      expect(scope.canViewCustomer({
        id: 'c2',
        createdById: 'admin-1',
        jobs: [{ agentId: 'agent-1' }],
      })).toBe(true);
    });

    it('User cannot see customer created by another user with only unaccessible jobs', () => {
      const cls = makeCls({ userId: 'agent-1', roles: ['AGENT'] });
      const scope = new DataScopeService(cls);

      expect(scope.canViewCustomer({
        id: 'c3',
        createdById: 'agent-2',
        jobs: [{ agentId: 'agent-2' }],
      })).toBe(false);
    });
  });

  // ─── 3. Out-of-scope GET by ID returns 404 (JobService.getOne) ───────────

  describe('JobService.getOne out-of-scope behavior', () => {
    it('throws JOB_NOT_FOUND (404) when job is outside user scope', async () => {
      const cls = makeCls({ userId: 'agent-b', roles: ['AGENT'], permissions: ['job.view'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findById: vi.fn().mockResolvedValue({
          id: 'job-a-1',
          jobNo: 'JOB-2026-000001',
          status: 'OPEN',
          priority: 'NORMAL',
          effectiveDate: new Date(),
          expiryDate: null,
          version: 1,
          customerId: 'c1',
          insuranceTypeId: 'it1',
          productId: 'p1',
          agentId: 'agent-a', // Belongs to Agent A
          assignedTo: null,
          brokerStaffId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      // Import JobService dynamically or instantiate
      const { JobService } = await import('../../modules/job/job.service.js');
      const jobService = new JobService(
        repo as never,
        {} as never,
        {} as never,
        scope,
        cls,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(jobService.getOne('job-a-1')).rejects.toThrow(
        expect.objectContaining({
          code: 'JOB_NOT_FOUND',
          status: 404,
        }),
      );
    });

    it('returns JobResponse when job is within scope', async () => {
      const cls = makeCls({ userId: 'agent-a', roles: ['AGENT'], permissions: ['job.view', 'job.update'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findById: vi.fn().mockResolvedValue({
          id: 'job-a-1',
          jobNo: 'JOB-2026-000001',
          status: 'OPEN',
          priority: 'NORMAL',
          source: null,
          remark: null,
          effectiveDate: new Date('2026-11-01'),
          expiryDate: null,
          version: 1,
          customerId: 'c1',
          insuranceTypeId: 'it1',
          productId: 'p1',
          agentId: 'agent-a',
          assignedTo: null,
          brokerStaffId: null,
          selectedQuotationId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };

      const { JobService } = await import('../../modules/job/job.service.js');
      const jobService = new JobService(
        repo as never,
        {} as never,
        {} as never,
        scope,
        cls,
        {} as never,
        {} as never,
        {} as never,
      );

      const res = await jobService.getOne('job-a-1');
      expect(res.id).toBe('job-a-1');
      expect(res.agentId).toBe('agent-a');
    });
  });

  // ─── 4. CustomerService out-of-scope behavior ────────────────────────────

  describe('CustomerService data scope enforcement', () => {
    it('CustomerService.findOne throws CUSTOMER_NOT_FOUND (404) when outside scope', async () => {
      const cls = makeCls({ userId: 'agent-b', roles: ['AGENT'], permissions: ['customer.view'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findById: vi.fn((_id: string, _scopeWhere: unknown) => {
          // If query with scopeWhere returns null
          return Promise.resolve(null);
        }),
      };

      const { CustomerService } = await import('../../modules/customer/customer.service.js');
      const customerService = new CustomerService(
        repo as never,
        {} as never,
        {} as never,
        cls,
        scope,
      );

      await expect(customerService.findOne('cust-a', false)).rejects.toThrow(
        expect.objectContaining({
          code: 'CUSTOMER_NOT_FOUND',
          status: 404,
        }),
      );
    });

    it('CustomerService.update throws CUSTOMER_NOT_FOUND (404) when outside scope', async () => {
      const cls = makeCls({ userId: 'agent-b', roles: ['AGENT'], permissions: ['customer.update'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findById: vi.fn().mockResolvedValue(null),
      };

      const { CustomerService } = await import('../../modules/customer/customer.service.js');
      const customerService = new CustomerService(
        repo as never,
        {} as never,
        {} as never,
        cls,
        scope,
      );

      await expect(customerService.update('cust-a', { customerType: 'INDIVIDUAL' as never }, false)).rejects.toThrow(
        expect.objectContaining({
          code: 'CUSTOMER_NOT_FOUND',
          status: 404,
        }),
      );
    });

    it('CustomerService.list applies customerViewScope in where clause', async () => {
      const cls = makeCls({ userId: 'agent-a', roles: ['AGENT'], permissions: ['customer.view'] });
      const scope = new DataScopeService(cls);

      let capturedWhere: Record<string, unknown> | undefined;
      const repo = {
        findAll: vi.fn((where: Record<string, unknown>) => {
          capturedWhere = where;
          return Promise.resolve([[], 0]);
        }),
      };

      const { CustomerService } = await import('../../modules/customer/customer.service.js');
      const customerService = new CustomerService(
        repo as never,
        {} as never,
        {} as never,
        cls,
        scope,
      );

      await customerService.list({} as never, false);

      expect(capturedWhere).toBeDefined();
      expect(capturedWhere).toHaveProperty('AND');
      const andArray = capturedWhere!.AND as unknown[];
      // First element in AND is customerViewScope()
      expect(andArray[0]).toEqual(scope.customerViewScope());
    });
  });

  // ─── 5. Dependent entities inherit Job scope ─────────────────────────────

  describe('Dependent entities access outside scope returns 404', () => {
    it('PolicyService.getPolicyById throws POLICY_NOT_FOUND (404) if job is outside scope', async () => {
      const cls = makeCls({ userId: 'agent-b', roles: ['AGENT'], permissions: ['policy.view'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findPolicyById: vi.fn().mockResolvedValue({
          id: 'pol-1',
          jobId: 'job-a-1',
        }),
      };

      const txHost = {
        tx: {
          job: {
            findFirst: vi.fn().mockResolvedValue(null), // Null because outside scopeWhere
          },
        },
      };

      const { PolicyService } = await import('../../modules/policy/policy.service.js');
      const policyService = new PolicyService(
        repo as never,
        {} as never,
        {} as never,
        txHost as never,
        cls,
        scope,
        {} as never,
      );

      await expect(policyService.getPolicyById('pol-1')).rejects.toThrow(
        expect.objectContaining({
          code: 'POLICY_NOT_FOUND',
          status: 404,
        }),
      );
    });

    it('TaskService.complete throws TASK_NOT_FOUND (404) if task job is outside scope', async () => {
      const cls = makeCls({ userId: 'agent-b', roles: ['AGENT'], permissions: ['task.update'] });
      const scope = new DataScopeService(cls);

      const repo = {
        findById: vi.fn().mockResolvedValue({
          id: 'task-1',
          jobId: 'job-a-1',
          status: 'TODO',
        }),
        findJob: vi.fn().mockResolvedValue(null), // Outside scope
      };

      const { TaskService } = await import('../../modules/task/task.service.js');
      const taskService = new TaskService(
        repo as never,
        {} as never,
        cls,
        scope,
      );

      await expect(taskService.complete('task-1')).rejects.toThrow(
        expect.objectContaining({
          code: 'TASK_NOT_FOUND',
          status: 404,
        }),
      );
    });
  });

  // ─── 6. Dashboard metrics respect data scope ─────────────────────────────

  describe('DashboardService.managerDashboard respects scope', () => {
    it('applies jobViewScope to all aggregation queries in managerDashboard', async () => {
      const cls = makeCls({
        userId: 'staff-a',
        roles: ['BROKER_STAFF'],
        branchId: 'branch-a',
      });
      const scope = new DataScopeService(cls);

      const jobCountMock = vi.fn().mockResolvedValue(10);
      const jobGroupByMock = vi.fn().mockResolvedValue([]);
      const policyAggregateMock = vi.fn().mockResolvedValue({ _sum: { totalPremium: 0 } });
      const commissionAggregateMock = vi.fn().mockResolvedValue({ _sum: { commissionAmount: 0 } });
      const policyCountMock = vi.fn().mockResolvedValue(5);
      const taskCountMock = vi.fn().mockResolvedValue(2);

      const txHost = {
        tx: {
          job: {
            count: jobCountMock,
            groupBy: jobGroupByMock,
          },
          policy: {
            aggregate: policyAggregateMock,
            count: policyCountMock,
          },
          commission: {
            aggregate: commissionAggregateMock,
          },
          task: {
            count: taskCountMock,
          },
        },
      };

      const { DashboardService } = await import('../../modules/dashboard/dashboard.service.js');
      const dashboardService = new DashboardService(
        txHost as never,
        cls,
        scope,
      );

      await dashboardService.managerDashboard();

      const expectedJobScope = scope.jobViewScope();

      // Verify job.count received jobScope
      expect(jobCountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(expectedJobScope),
        }),
      );

      // Verify job.groupBy received jobScope
      expect(jobGroupByMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(expectedJobScope),
        }),
      );

      // Verify policy.aggregate received policyScope linked to jobScope
      expect(policyAggregateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            job: expect.objectContaining(expectedJobScope),
          }),
        }),
      );

      // Verify task.count received jobScope
      expect(taskCountMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            job: expect.objectContaining(expectedJobScope),
          }),
        }),
      );
    });
  });
});

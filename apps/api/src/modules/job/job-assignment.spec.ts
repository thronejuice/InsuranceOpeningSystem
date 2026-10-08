import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { AssignmentRole } from '../../generated/prisma/enums.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { JobService } from './job.service.js';

describe('Job Assignment & Data Scope (Day 1)', () => {
  describe('DataScopeService.canAssignJob', () => {
    it('returns false when user does not have job.assign permission', () => {
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'agent-1';
          if (key === 'permissions') return ['job.view', 'job.update'];
          return undefined;
        },
      };
      const scope = new DataScopeService(cls as never);
      expect(scope.canAssignJob('agent-1')).toBe(false);
      expect(scope.canAssignJob('agent-2')).toBe(false);
    });

    it('returns true when user has job.assign and job.view_all (e.g. MANAGER)', () => {
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'manager-1';
          if (key === 'permissions') return ['job.view', 'job.assign', 'job.view_all'];
          return undefined;
        },
      };
      const scope = new DataScopeService(cls as never);
      expect(scope.canAssignJob('agent-1')).toBe(true);
      expect(scope.canAssignJob('agent-2')).toBe(true);
    });

    it('returns true when user has job.assign and job.update_all (e.g. ADMIN)', () => {
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'admin-1';
          if (key === 'permissions') return ['job.assign', 'job.update_all'];
          return undefined;
        },
      };
      const scope = new DataScopeService(cls as never);
      expect(scope.canAssignJob('agent-1')).toBe(true);
    });

    it('returns true when user has job.assign and is the owner of the job', () => {
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'agent-1';
          if (key === 'permissions') return ['job.assign'];
          return undefined;
        },
      };
      const scope = new DataScopeService(cls as never);
      expect(scope.canAssignJob('agent-1')).toBe(true);
    });

    it('returns false when user has job.assign but attempts to assign someone else job without view_all/update_all', () => {
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'agent-1';
          if (key === 'permissions') return ['job.assign'];
          return undefined;
        },
      };
      const scope = new DataScopeService(cls as never);
      expect(scope.canAssignJob('agent-2')).toBe(false);
    });
  });

  describe('JobService.assign & assignment histories', () => {
    const createMockJob = (overrides = {}) => ({
      id: 'job-1',
      jobNo: 'JOB-202610-0001',
      agentId: 'agent-1',
      assignedTo: null,
      brokerStaffId: null,
      status: 'OPEN',
      effectiveDate: new Date('2026-10-01'),
      expiryDate: new Date('2027-10-01'),
      deletedAt: null,
      createdAt: new Date('2026-10-01'),
      updatedAt: new Date('2026-10-01'),
      ...overrides,
    });

    it('throws 403 FORBIDDEN when user cannot assign the job (e.g. AGENT assigning another person job)', async () => {
      const repo = {
        findById: vi.fn().mockResolvedValue(createMockJob({ agentId: 'agent-2' })),
      };
      const scope = {
        canAssignJob: vi.fn().mockReturnValue(false),
      };
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'agent-1';
          if (key === 'permissions') return ['job.view'];
          return undefined;
        },
      };

      const service = new JobService(
        repo as never,
        {} as never,
        {} as never,
        scope as never,
        cls as never,
        {} as never,
        {} as never,
        { tx: {} } as never,
      );

      await expect(
        service.assign('job-1', { assigneeId: 'staff-1', role: AssignmentRole.BROKER_STAFF }),
      ).rejects.toThrowError(BusinessException);

      expect(repo.findById).toHaveBeenCalledWith('job-1');
      expect(scope.canAssignJob).toHaveBeenCalledWith('agent-2');
    });

    it('allows MANAGER to assign job and records assignment history', async () => {
      const job = createMockJob({ agentId: 'agent-1', assignedTo: null, brokerStaffId: null });
      const updatedJob = {
        ...job,
        assignedTo: 'staff-1',
        brokerStaffId: 'staff-1',
        agent: { id: 'agent-1', fullName: 'Agent One' },
        brokerStaff: { id: 'staff-1', fullName: 'Staff One' },
        customer: { id: 'c-1', name: 'Customer One' },
        insuranceType: { id: 'it-1', name: 'Car' },
        product: { id: 'p-1', name: 'Class 1' },
      };

      const historyStore: Array<Record<string, unknown>> = [];
      const repo = {
        findById: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue(updatedJob),
      };
      const scope = {
        canAssignJob: vi.fn().mockReturnValue(true),
        canUpdateJob: vi.fn().mockReturnValue(true),
      };
      const cls = {
        get: (key: string) => {
          if (key === 'userId') return 'mgr-1';
          if (key === 'permissions') return ['job.assign', 'job.view_all'];
          return undefined;
        },
      };
      const audit = { log: vi.fn().mockResolvedValue(undefined) };
      const taskSvc = { createAutoTask: vi.fn().mockResolvedValue(undefined) };
      const notifSvc = { notify: vi.fn().mockResolvedValue(undefined) };
      const tx = {
        jobAssignmentHistory: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            historyStore.push(data);
            return data;
          }),
        },
      };

      const service = new JobService(
        repo as never,
        {} as never,
        audit as never,
        scope as never,
        cls as never,
        taskSvc as never,
        notifSvc as never,
        { tx } as never,
      );

      // 1st Assignment: Assign to staff-1
      const res1 = await service.assign('job-1', {
        assigneeId: 'staff-1',
        role: AssignmentRole.BROKER_STAFF,
        reason: 'Initial assignment',
      });

      expect(res1).toBeDefined();
      expect(historyStore).toHaveLength(1);
      expect(historyStore[0]).toEqual({
        jobId: 'job-1',
        role: AssignmentRole.BROKER_STAFF,
        fromUserId: null,
        toUserId: 'staff-1',
        reason: 'Initial assignment',
        changedById: 'mgr-1',
      });
      expect(taskSvc.createAutoTask).toHaveBeenCalledWith('job-1', 'CALL_CUSTOMER', 'โทรติดต่อลูกค้า', 'staff-1');
      expect(notifSvc.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'staff-1',
          type: 'JOB_ASSIGNED',
        }),
      );

      // 2nd Assignment (Reassign): Reassign from staff-1 to staff-2
      const jobAssignedToStaff1 = {
        ...job,
        assignedTo: 'staff-1',
        brokerStaffId: 'staff-1',
      };
      repo.findById.mockResolvedValue(jobAssignedToStaff1);

      await service.assign('job-1', {
        assigneeId: 'staff-2',
        role: AssignmentRole.BROKER_STAFF,
        reason: 'Workload balancing',
      });

      // Verification: History now has 2 rows
      expect(historyStore).toHaveLength(2);
      expect(historyStore[1]).toEqual({
        jobId: 'job-1',
        role: AssignmentRole.BROKER_STAFF,
        fromUserId: 'staff-1',
        toUserId: 'staff-2',
        reason: 'Workload balancing',
        changedById: 'mgr-1',
      });
    });

    it('getAssignmentHistories returns histories for manager and rejects unauthorized user', async () => {
      const job = createMockJob({ agentId: 'agent-1', assignedTo: 'staff-1', brokerStaffId: 'staff-1' });
      const mockHistories = [
        { id: 'h-1', jobId: 'job-1', fromUserId: null, toUserId: 'staff-1' },
        { id: 'h-2', jobId: 'job-1', fromUserId: 'staff-1', toUserId: 'staff-2' },
      ];

      const repo = { findById: vi.fn().mockResolvedValue(job) };
      const tx = {
        jobAssignmentHistory: {
          findMany: vi.fn().mockResolvedValue(mockHistories),
        },
      };

      // Case 1: Unauthorized agent (agent-99)
      const unauthCls = {
        get: (key: string) => {
          if (key === 'userId') return 'agent-99';
          if (key === 'permissions') return ['job.view'];
          return undefined;
        },
      };
      const serviceUnauth = new JobService(
        repo as never,
        {} as never,
        {} as never,
        {} as never,
        unauthCls as never,
        {} as never,
        {} as never,
        { tx } as never,
      );

      await expect(serviceUnauth.getAssignmentHistories('job-1')).rejects.toThrowError(BusinessException);

      // Case 2: Manager with job.view_all
      const mgrCls = {
        get: (key: string) => {
          if (key === 'userId') return 'mgr-1';
          if (key === 'permissions') return ['job.view', 'job.view_all'];
          return undefined;
        },
      };
      const serviceMgr = new JobService(
        repo as never,
        {} as never,
        {} as never,
        {} as never,
        mgrCls as never,
        {} as never,
        {} as never,
        { tx } as never,
      );

      const res = await serviceMgr.getAssignmentHistories('job-1');
      expect(res).toHaveLength(2);
      expect(res).toEqual(mockHistories);
    });
  });
});

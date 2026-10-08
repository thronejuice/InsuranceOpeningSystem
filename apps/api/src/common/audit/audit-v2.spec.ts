import { describe, expect, it, vi } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { PERMISSIONS, ROLE_PERMISSIONS } from '../../../prisma/seed-data.js';
import { ActivitySource, NotificationType } from '../../generated/prisma/enums.js';
import { AuditController } from './audit.controller.js';
import { QuotationService } from '../../modules/quotation/quotation.service.js';
import { ProposalService } from '../../modules/proposal/proposal.service.js';

describe('Audit Log V2 & Notification Infrastructure (Day 4)', () => {
  describe('Permissions matrix for audit.view', () => {
    it('defines audit.view in PERMISSIONS dictionary', () => {
      expect(PERMISSIONS).toHaveProperty('audit.view');
      expect(PERMISSIONS['audit.view']).toBe('View audit logs');
    });

    it('assigns audit.view to ADMIN and MANAGER only', () => {
      expect(ROLE_PERMISSIONS.ADMIN).toContain('audit.view');
      expect(ROLE_PERMISSIONS.MANAGER).toContain('audit.view');

      expect(ROLE_PERMISSIONS.AGENT).not.toContain('audit.view');
      expect(ROLE_PERMISSIONS.BROKER_STAFF).not.toContain('audit.view');
      expect(ROLE_PERMISSIONS.SUPERVISOR).not.toContain('audit.view');
      expect(ROLE_PERMISSIONS.FINANCE).not.toContain('audit.view');
      expect(ROLE_PERMISSIONS.VIEWER).not.toContain('audit.view');
    });
  });

  describe('GET /audit-logs Controller', () => {
    it('delegates to AuditService.findLogs with query parameters', async () => {
      const mockResult = {
        items: [
          {
            id: 'log-1',
            action: 'UPDATE_QUOTATION',
            entityType: 'QUOTATION',
            entityId: 'q-1',
            jobId: 'j-1',
            oldValue: { grossPremium: '100000' },
            newValue: { grossPremium: '95000' },
            source: ActivitySource.WEB,
            remark: null,
            description: null,
            ipAddress: null,
            userAgent: null,
            createdAt: new Date(),
            user: { id: 'u-1', username: 'admin', fullName: 'Admin' },
          },
        ],
        meta: { page: 1, perPage: 20, total: 1, lastPage: 1 },
      };

      const auditService = {
        findLogs: vi.fn().mockResolvedValue(mockResult),
      };

      const controller = new AuditController(auditService as never);
      const query = {
        entityType: 'QUOTATION',
        action: 'UPDATE_QUOTATION',
        page: 1,
        perPage: 20,
        skip: 0,
        take: 20,
      };

      const res = await controller.list(query as never);
      expect(auditService.findLogs).toHaveBeenCalledWith(query);
      expect(res).toBe(mockResult);
    });
  });

  describe('Quotation premium update audit diff', () => {
    it('records before/after diff when updating quotation premium', async () => {
      const mockQuotation = {
        id: 'q-1',
        jobId: 'job-1',
        quotationNo: 'Q-2026-0001',
        status: 'RECEIVED',
        grossPremium: { toString: () => '100000.00', toFixed: () => '100000.00' },
        discount: { toString: () => '0.00', toFixed: () => '0.00' },
        netPremium: { toString: () => '100000.00', toFixed: () => '100000.00' },
        tax: { toString: () => '7000.00', toFixed: () => '7000.00' },
        stampDuty: { toString: () => '0.00', toFixed: () => '0.00' },
        totalAmount: { toString: () => '107000.00', toFixed: () => '107000.00' },
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        version: 1,
      };

      const mockUpdatedQuotation = {
        ...mockQuotation,
        grossPremium: { toString: () => '95000.00', toFixed: () => '95000.00' },
        discount: { toString: () => '0.00', toFixed: () => '0.00' },
        netPremium: { toString: () => '95000.00', toFixed: () => '95000.00' },
        tax: { toString: () => '6650.00', toFixed: () => '6650.00' },
        stampDuty: { toString: () => '0.00', toFixed: () => '0.00' },
        totalAmount: { toString: () => '101650.00', toFixed: () => '101650.00' },
        version: 2,
      };

      const mockJob = {
        id: 'job-1',
        jobNo: 'JOB-2026-0001',
        status: 'QUOTATION_RECEIVED',
        agentId: 'agent-1',
        brokerStaffId: 'staff-1',
      };

      const repo = {
        findById: vi.fn().mockResolvedValue(mockQuotation),
        update: vi.fn().mockResolvedValue(mockUpdatedQuotation),
        countReceivedForJob: vi.fn().mockResolvedValue(1),
      };

      const audit = { log: vi.fn().mockResolvedValue(undefined) };
      const notifications = { emit: vi.fn().mockResolvedValue(undefined) };
      const txHost = {
        tx: {
          quotationItem: { deleteMany: vi.fn() },
          job: { findFirst: vi.fn().mockResolvedValue(mockJob) },
        },
      };
      const cls = { get: vi.fn().mockReturnValue('staff-1') };
      const scope = { jobViewScope: vi.fn().mockReturnValue({}) };
      const workflow = { transitionInTx: vi.fn() };

      const service = new QuotationService(
        repo as never,
        {} as never,
        audit as never,
        txHost as never,
        cls as never,
        scope as never,
        workflow as never,
        notifications as never,
      );

      await service.update('q-1', {
        grossPremium: '95000',
        remark: 'Negotiated lower premium',
      });

      // Verify audit was logged with before and after containing quotation records
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_QUOTATION',
          entityType: 'QUOTATION',
          entityId: 'q-1',
          jobId: 'job-1',
          before: mockQuotation,
          after: mockUpdatedQuotation,
          remark: 'Negotiated lower premium',
        }),
      );

      // Verify notification was emitted to agent and broker staff
      expect(notifications.emit).toHaveBeenCalledWith(
        NotificationType.QUOTATION_RECEIVED,
        ['agent-1', 'staff-1'],
        expect.objectContaining({
          title: expect.stringContaining('JOB-2026-0001'),
          entityType: 'QUOTATION',
          entityId: 'q-1',
        }),
      );
    });
  });

  describe('Approval requested flow emits notification to approvers', () => {
    it('notifies approvers and transitions job when proposal discount requires approval', async () => {
      const mockQuotation = {
        id: 'q-1',
        grossPremium: '100000',
        discount: '15000', // 15% discount triggers MANAGER approval rule
        netPremium: '85000',
      };

      const mockJob = {
        id: 'job-1',
        jobNo: 'JOB-2026-0001',
        status: 'SENT',
        agentId: 'agent-1',
      };

      const mockProposal = {
        id: 'prop-1',
        proposalNo: 'PR-2026-0001',
        jobId: 'job-1',
        quotationId: 'q-1',
        status: 'SENT',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        approvals: [],
      };

      const mockApproverUsers = [
        { id: 'mgr-1', email: 'manager@example.com', fullName: 'Manager One' },
      ];

      const repo = {
        findById: vi.fn().mockResolvedValue(mockProposal),
        update: vi.fn().mockResolvedValue({ ...mockProposal, status: 'ACCEPTED' }),
      };

      const audit = { log: vi.fn().mockResolvedValue(undefined) };
      const notifications = { emit: vi.fn().mockResolvedValue(undefined) };

      const txHost = {
        tx: {
          quotation: { findFirst: vi.fn().mockResolvedValue(mockQuotation) },
          approvalRule: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 'rule-1',
                active: true,
                sortOrder: 1,
                approverRole: 'MANAGER',
                thresholdValue: '10', // > 10% discount requires MANAGER
                conditionField: 'DISCOUNT',
                conditionOperator: 'GT',
              },
            ]),
          },
          approval: {
            create: vi.fn().mockResolvedValue({ id: 'appr-1' }),
          },
          user: {
            findMany: vi.fn().mockResolvedValue(mockApproverUsers),
          },
          job: {
            findFirst: vi.fn().mockResolvedValue(mockJob),
          },
        },
      };

      const cls = { get: vi.fn().mockReturnValue('agent-1') };
      const workflow = { transitionInTx: vi.fn() };
      const document = {} as never;
      const scope = { jobViewScope: vi.fn().mockReturnValue({}) };

      const proposalService = new ProposalService(
        repo as never,
        {} as never,
        audit as never,
        txHost as never,
        cls as never,
        workflow as never,
        document as never,
        scope as never,
        notifications as never,
        {} as never,
      );

      await proposalService.accept('prop-1', {
        method: 'MANUAL' as never,
        remark: 'Customer approved proposal',
      });

      // Verify job transitioned to WAITING_APPROVAL
      expect(workflow.transitionInTx).toHaveBeenCalledWith(
        mockJob,
        'WAITING_APPROVAL',
        'agent-1',
      );

      // Verify notification was emitted to manager
      expect(notifications.emit).toHaveBeenCalledWith(
        NotificationType.APPROVAL_REQUESTED,
        ['mgr-1'],
        expect.objectContaining({
          title: expect.stringContaining('JOB-2026-0001'),
          entityType: 'APPROVAL',
          entityId: 'appr-1',
        }),
      );

      // Verify audit was logged
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCEPT_PROPOSAL',
          entityType: 'PROPOSAL',
          entityId: 'prop-1',
        }),
      );
    });
  });
});

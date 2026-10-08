import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@nestjs-cls/transactional', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs-cls/transactional')>();
  return {
    ...actual,
    Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
  };
});

import { NotificationType } from '../../generated/prisma/enums.js';
import { NotificationService } from './notification.service.js';
import { renderEmail } from './domain/email-templates.js';

describe('NotificationService (Day 4)', () => {
  let mockRepo: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findPreferences: ReturnType<typeof vi.fn>;
    findPreference: ReturnType<typeof vi.fn>;
    upsertPreference: ReturnType<typeof vi.fn>;
    findUsers: ReturnType<typeof vi.fn>;
  };
  let mockCls: { get: ReturnType<typeof vi.fn> };
  let mockEmailService: {
    send: ReturnType<typeof vi.fn>;
    getSentEmails: ReturnType<typeof vi.fn>;
    clearSentEmails: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRepo = {
      findMany: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      updateMany: vi.fn(),
      findPreferences: vi.fn().mockResolvedValue([]),
      findPreference: vi.fn().mockResolvedValue(null),
      upsertPreference: vi.fn().mockResolvedValue({}),
      findUsers: vi.fn().mockResolvedValue([
        { id: 'user-1', email: 'user1@example.com', fullName: 'User One' },
      ]),
    };
    mockCls = { get: vi.fn().mockReturnValue('user-1') };
    mockEmailService = {
      send: vi.fn().mockResolvedValue(true),
      getSentEmails: vi.fn().mockReturnValue([]),
      clearSentEmails: vi.fn(),
    };
  });

  it('emit creates in-app notification and sends email by default (opt-out model)', async () => {
    const service = new NotificationService(
      mockRepo as never,
      mockCls as never,
      mockEmailService as never,
    );

    await service.emit(NotificationType.QUOTATION_RECEIVED, ['user-1'], {
      title: 'Quotation Received',
      message: 'Quotation Q-2026-0001 has been received',
      entityType: 'QUOTATION',
      entityId: 'q-1',
    });

    expect(mockRepo.create).toHaveBeenCalledWith({
      user: { connect: { id: 'user-1' } },
      type: NotificationType.QUOTATION_RECEIVED,
      title: 'Quotation Received',
      message: 'Quotation Q-2026-0001 has been received',
      entityType: 'QUOTATION',
      entityId: 'q-1',
    });

    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user1@example.com',
        subject: expect.stringContaining('Quotation Received'),
        text: expect.stringContaining('Quotation Q-2026-0001 has been received'),
      }),
    );
  });

  it('emit respects preference when email is disabled', async () => {
    mockRepo.findPreference.mockResolvedValue({
      userId: 'user-1',
      type: NotificationType.APPROVAL_REQUESTED,
      email: false,
      inApp: true,
    });

    const service = new NotificationService(
      mockRepo as never,
      mockCls as never,
      mockEmailService as never,
    );

    await service.emit(NotificationType.APPROVAL_REQUESTED, ['user-1'], {
      title: 'Approval Required',
      message: 'Special discount requires your review',
      entityType: 'APPROVAL',
      entityId: 'appr-1',
    });

    // In-app was created
    expect(mockRepo.create).toHaveBeenCalled();
    // Email was NOT sent
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('emit respects preference when inApp is disabled', async () => {
    mockRepo.findPreference.mockResolvedValue({
      userId: 'user-1',
      type: NotificationType.POLICY_ISSUED,
      email: true,
      inApp: false,
    });

    const service = new NotificationService(
      mockRepo as never,
      mockCls as never,
      mockEmailService as never,
    );

    await service.emit(NotificationType.POLICY_ISSUED, ['user-1'], {
      title: 'Policy Issued',
      message: 'Policy POL-2026-0001 is now active',
      entityType: 'POLICY',
      entityId: 'pol-1',
    });

    // In-app was NOT created
    expect(mockRepo.create).not.toHaveBeenCalled();
    // Email WAS sent
    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user1@example.com',
        subject: expect.stringContaining('Policy Issued'),
      }),
    );
  });

  it('getPreferences returns default true for unconfigured event types', async () => {
    mockRepo.findPreferences.mockResolvedValue([
      { userId: 'user-1', type: NotificationType.QUOTATION_RECEIVED, email: false, inApp: true },
    ]);

    const service = new NotificationService(
      mockRepo as never,
      mockCls as never,
      mockEmailService as never,
    );

    const prefs = await service.getPreferences('user-1');
    const quotePref = prefs.find((p) => p.type === NotificationType.QUOTATION_RECEIVED);
    const policyPref = prefs.find((p) => p.type === NotificationType.POLICY_ISSUED);

    expect(quotePref).toEqual({
      type: NotificationType.QUOTATION_RECEIVED,
      email: false,
      inApp: true,
    });
    // Unconfigured type defaults to true
    expect(policyPref).toEqual({
      type: NotificationType.POLICY_ISSUED,
      email: true,
      inApp: true,
    });
  });

  it('updatePreferences upserts user preferences', async () => {
    const service = new NotificationService(
      mockRepo as never,
      mockCls as never,
      mockEmailService as never,
    );

    await service.updatePreferences(
      {
        preferences: [
          { type: NotificationType.APPROVAL_REQUESTED, email: false, inApp: true },
        ],
      },
      'user-1',
    );

    expect(mockRepo.upsertPreference).toHaveBeenCalledWith(
      'user-1',
      NotificationType.APPROVAL_REQUESTED,
      { email: false, inApp: true },
    );
  });

  it('renderEmail produces correct templates for key events', () => {
    const events = [
      NotificationType.QUOTATION_RECEIVED,
      NotificationType.APPROVAL_REQUESTED,
      NotificationType.POLICY_ISSUED,
    ];

    for (const evt of events) {
      const rendered = renderEmail(
        evt,
        {
          title: `Test ${evt}`,
          message: `Body for ${evt}`,
          entityType: 'JOB',
          entityId: 'job-123',
        },
        'Somchai',
      );

      expect(rendered.subject).toContain(`Test ${evt}`);
      expect(rendered.html).toContain('Somchai');
      expect(rendered.html).toContain(`Body for ${evt}`);
      expect(rendered.html).toContain('job-123');
      expect(rendered.text).toContain(`Body for ${evt}`);
    }
  });
});

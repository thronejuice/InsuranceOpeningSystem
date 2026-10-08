import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Transactional } from '@nestjs-cls/transactional';
import type { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { NotificationType } from '../../generated/prisma/enums.js';
import { NotificationRepository } from './notification.repository.js';
import { EmailService } from './email.service.js';
import { NOTIFICATION_QUEUE, SEND_EMAIL_JOB } from './notification.processor.js';
import { renderEmail } from './domain/email-templates.js';
import type {
  NotificationPreferenceResponse,
  UpdateNotificationPreferencesDto,
} from './dto/preference.dto.js';
import {
  toNotificationResponse,
  type NotificationListResponse,
  type NotificationResponse,
} from './dto/notification.response.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface NotificationPayload {
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  jobId?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly repo: NotificationRepository,
    private readonly cls: ClsService<AppClsStore>,
    private readonly emailService: EmailService,
    @Optional() @InjectQueue(NOTIFICATION_QUEUE) private readonly queue?: Queue,
  ) {}

  async list(page = 1, perPage = 20): Promise<NotificationListResponse> {
    const userId = this.cls.get('userId')!;
    const skip = (page - 1) * perPage;
    const where = { userId };
    const [items, total, unreadCount] = await Promise.all([
      this.repo.findMany(where, skip, perPage),
      this.repo.count(where),
      this.repo.count({ userId, isRead: false }),
    ]);
    return { items: items.map(toNotificationResponse), total, unreadCount };
  }

  async unreadCount(): Promise<{ count: number }> {
    const userId = this.cls.get('userId')!;
    const count = await this.repo.count({ userId, isRead: false });
    return { count };
  }

  @Transactional()
  async markRead(id: string): Promise<NotificationResponse> {
    const userId = this.cls.get('userId')!;
    const notif = await this.repo.findById(id);
    if (!notif) throw new BusinessException('NOTIFICATION_NOT_FOUND', 'Notification not found', 404);
    if (notif.userId !== userId) throw new BusinessException('FORBIDDEN', 'Access denied', 403);
    if (notif.isRead) return toNotificationResponse(notif);

    await this.repo.updateMany({ id }, { isRead: true, readAt: new Date() });
    return toNotificationResponse({ ...notif, isRead: true, readAt: new Date() });
  }

  @Transactional()
  async markAllRead(): Promise<{ updated: number }> {
    const userId = this.cls.get('userId')!;
    const result = await this.repo.updateMany({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    return { updated: result.count };
  }

  /** Backward compatibility helper */
  @Transactional()
  async notify(input: NotifyInput): Promise<void> {
    await this.emit(input.type, [input.userId], {
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  // ─── Preferences ───────────────────────────────────────────────────────────

  async getPreferences(userIdOverride?: string): Promise<NotificationPreferenceResponse[]> {
    const userId = userIdOverride ?? this.cls.get('userId')!;
    const rows = await this.repo.findPreferences(userId);
    const prefMap = new Map(rows.map((r) => [r.type, r]));

    const allTypes = Object.values(NotificationType);
    return allTypes.map((type) => {
      const pref = prefMap.get(type);
      return {
        type,
        email: pref ? pref.email : true,
        inApp: pref ? pref.inApp : true,
      };
    });
  }

  @Transactional()
  async updatePreferences(
    dto: UpdateNotificationPreferencesDto,
    userIdOverride?: string,
  ): Promise<NotificationPreferenceResponse[]> {
    const userId = userIdOverride ?? this.cls.get('userId')!;
    for (const item of dto.preferences) {
      await this.repo.upsertPreference(userId, item.type, {
        email: item.email,
        inApp: item.inApp,
      });
    }
    return this.getPreferences(userId);
  }

  // ─── Event Emission ────────────────────────────────────────────────────────

  /**
   * Emits a notification event to recipient users, respecting their notification preferences
   * (in-app notifications and/or email dispatch via BullMQ/Mailpit).
   */
  @Transactional()
  async emit(
    event: NotificationType,
    recipients: string[],
    payload: NotificationPayload,
  ): Promise<void> {
    const uniqueRecipientIds = [...new Set(recipients)].filter(Boolean);
    if (uniqueRecipientIds.length === 0) return;

    const users = await this.repo.findUsers(uniqueRecipientIds);
    if (users.length === 0) return;

    for (const user of users) {
      const pref = await this.repo.findPreference(user.id, event);
      const allowInApp = pref ? pref.inApp : true;
      const allowEmail = pref ? pref.email : true;

      if (allowInApp) {
        await this.repo.create({
          user: { connect: { id: user.id } },
          type: event,
          title: payload.title,
          message: payload.message,
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
      }

      if (allowEmail && user.email) {
        const { subject, text, html } = renderEmail(event, payload, user.fullName);
        const mailOptions = {
          to: user.email,
          subject,
          text,
          html,
        };

        if (this.queue) {
          try {
            await this.queue.add(SEND_EMAIL_JOB, mailOptions, {
              removeOnComplete: true,
              removeOnFail: 5,
            });
          } catch (err) {
            this.logger.warn(`Could not enqueue email job (falling back to direct send): ${(err as Error).message}`);
            await this.emailService.send(mailOptions);
          }
        } else {
          await this.emailService.send(mailOptions);
        }
      }
    }
  }
}

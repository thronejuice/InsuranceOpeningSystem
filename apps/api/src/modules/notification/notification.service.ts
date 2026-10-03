import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import type { NotificationType } from '../../generated/prisma/enums.js';
import { NotificationRepository } from './notification.repository.js';
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

@Injectable()
export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly cls: ClsService<AppClsStore>,
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

  /** Called by other services (within their own transaction) to create a notification */
  @Transactional()
  async notify(input: NotifyInput): Promise<void> {
    await this.repo.create({
      user: { connect: { id: input.userId } },
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}

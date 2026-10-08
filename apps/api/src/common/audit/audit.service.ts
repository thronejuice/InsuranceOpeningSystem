import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivitySource } from '../../generated/prisma/enums.js';
import type { AppClsStore } from '../cls/app-cls-store.js';
import { Paginated } from '../http/pagination.dto.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { diffChanges } from './domain/audit-diff.js';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto.js';
import { redact } from './redact.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  jobId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  before?: unknown;
  after?: unknown;
  source?: ActivitySource | 'WEB' | 'API' | 'JOB' | 'IMPORT';
  remark?: string;
  description?: string;
  /** Override for flows without an authenticated user in CLS yet (e.g. LOGIN) */
  userId?: string;
}

export interface AuditLogUserSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface AuditLogItemResponse {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  jobId: string | null;
  oldValue: unknown;
  newValue: unknown;
  source: ActivitySource;
  remark: string | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: AuditLogUserSummary | null;
}

/** spec §22 & V2 §25 — writes on caller transaction so the log rolls back with the change it describes. */
@Injectable()
export class AuditService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get db() {
    return this.txHost.tx;
  }

  async log(entry: AuditEntry): Promise<void> {
    let oldValue = entry.oldValue;
    let newValue = entry.newValue;

    if (entry.before !== undefined || entry.after !== undefined) {
      if (oldValue === undefined && newValue === undefined) {
        const diff = diffChanges(entry.before, entry.after);
        oldValue = diff?.oldValue ?? null;
        newValue = diff?.newValue ?? null;
      }
    }

    const source = (entry.source as ActivitySource) ?? ActivitySource.WEB;

    await this.db.activityLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        jobId: entry.jobId,
        oldValue: redact(oldValue) as Prisma.InputJsonValue | undefined,
        newValue: redact(newValue) as Prisma.InputJsonValue | undefined,
        source,
        remark: entry.remark,
        description: entry.description,
        userId: entry.userId ?? this.cls.get('userId'),
        ipAddress: this.cls.get('ip'),
        userAgent: this.cls.get('userAgent'),
      },
    });
  }

  async findLogs(query: AuditLogQueryDto): Promise<Paginated<AuditLogItemResponse>> {
    const where: Prisma.ActivityLogWhereInput = {};

    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.entityType) {
      where.entityType = { equals: query.entityType, mode: 'insensitive' };
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.action) {
      where.action = { equals: query.action, mode: 'insensitive' };
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.db.activityLog.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
            },
          },
        },
      }),
      this.db.activityLog.count({ where }),
    ]);

    const mapped: AuditLogItemResponse[] = items.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      jobId: item.jobId,
      oldValue: item.oldValue,
      newValue: item.newValue,
      source: item.source,
      remark: item.remark,
      description: item.description,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
      user: item.user
        ? {
            id: item.user.id,
            username: item.user.username,
            fullName: item.user.fullName,
          }
        : null,
    }));

    return Paginated.of(mapped, total, query);
  }
}

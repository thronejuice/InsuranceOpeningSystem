import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppClsStore } from '../cls/app-cls-store.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { redact } from './redact.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  jobId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description?: string;
  /** Override for flows without an authenticated user in CLS yet (e.g. LOGIN) */
  userId?: string;
}

/** spec §22 — writes on the caller's transaction so the log rolls back with the change it describes. */
@Injectable()
export class AuditService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.txHost.tx.activityLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        jobId: entry.jobId,
        oldValue: redact(entry.oldValue) as Prisma.InputJsonValue | undefined,
        newValue: redact(entry.newValue) as Prisma.InputJsonValue | undefined,
        description: entry.description,
        userId: entry.userId ?? this.cls.get('userId'),
        ipAddress: this.cls.get('ip'),
        userAgent: this.cls.get('userAgent'),
      },
    });
  }
}

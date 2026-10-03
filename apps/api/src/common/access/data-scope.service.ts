import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppClsStore } from '../cls/app-cls-store.js';

@Injectable()
export class DataScopeService {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  /** Prisma WHERE clause that restricts the query to jobs the current user may view (BR-014). */
  jobViewScope(): Prisma.JobWhereInput {
    const userId = this.cls.get('userId');
    const permissions = this.cls.get('permissions') ?? [];
    if (permissions.includes('job.view_all')) return {};
    return { OR: [{ agentId: userId }, { assignedTo: userId }] };
  }

  /** True if the current user may update a job owned by agentId (BR-014). */
  canUpdateJob(jobAgentId: string): boolean {
    const userId = this.cls.get('userId');
    const permissions = this.cls.get('permissions') ?? [];
    return permissions.includes('job.update_all') || jobAgentId === userId;
  }
}

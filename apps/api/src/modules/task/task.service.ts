import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { TaskRepository } from './task.repository.js';
import { isOverdue } from './domain/task-overdue.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { TaskQueryDto } from './dto/task-query.dto.js';
import type { TaskListResponse, TaskResponse } from './dto/task.response.js';
import type { Task, Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class TaskService {
  constructor(
    private readonly repo: TaskRepository,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
  ) {}

  /** Task inherits the access rule of its Job (BR-014). */
  private async assertJobAccess(jobId: string): Promise<void> {
    const exists = await this.repo.findJob({ id: jobId });
    if (!exists) throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    const visible = await this.repo.findJob({ AND: [{ id: jobId }, this.scope.jobViewScope()] });
    if (!visible) throw new BusinessException('FORBIDDEN', 'Access denied', 403);
  }

  private toResponse(task: Task): TaskResponse {
    return { ...task, overdue: isOverdue(task.status as string, task.dueDate) };
  }

  async listByJob(jobId: string): Promise<TaskListResponse> {
    await this.assertJobAccess(jobId);
    const items = await this.repo.findByJob(jobId);
    return { items: items.map((t) => this.toResponse(t)), total: items.length };
  }

  async list(query: TaskQueryDto): Promise<TaskListResponse> {
    const userId = this.cls.get('userId')!;
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const skip = (page - 1) * perPage;

    const now = new Date();
    const where: Prisma.TaskWhereInput = { job: { deletedAt: null, ...this.scope.jobViewScope() } };

    if (query.mine) where.assignedTo = userId;
    if (query.status) where.status = query.status;
    if (query.overdue) {
      where.dueDate = { lt: now };
      where.status = { notIn: ['DONE', 'CANCELLED'] };
    }

    const [items, total] = await Promise.all([
      this.repo.findMany(where, skip, perPage),
      this.repo.count(where),
    ]);

    return { items: items.map((t) => this.toResponse(t)), total };
  }

  @Transactional()
  async create(jobId: string, dto: CreateTaskDto): Promise<TaskResponse> {
    await this.assertJobAccess(jobId);
    const userId = this.cls.get('userId')!;
    const task = await this.repo.create({
      job: { connect: { id: jobId } },
      taskType: dto.taskType,
      subject: dto.subject,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      priority: dto.priority ?? 'MEDIUM',
      assignee: dto.assignedTo ? { connect: { id: dto.assignedTo } } : undefined,
      createdBy: { connect: { id: userId } },
    });

    await this.audit.log({
      action: 'CREATE_TASK',
      entityType: 'TASK',
      entityId: task.id,
      jobId,
      newValue: { taskType: task.taskType, subject: task.subject },
    });

    return this.toResponse(task);
  }

  @Transactional()
  async complete(id: string): Promise<TaskResponse> {
    const task = await this.repo.findById(id);
    if (!task) throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
    await this.assertJobAccess(task.jobId);
    if (task.status === 'DONE') throw new BusinessException('TASK_ALREADY_DONE', 'Task already completed', 409);
    if (task.status === 'CANCELLED') throw new BusinessException('TASK_CANCELLED', 'Task is cancelled', 409);

    const userId = this.cls.get('userId')!;
    const now = new Date();
    const updated = await this.repo.update(id, {
      status: 'DONE',
      completedAt: now,
      completedBy: { connect: { id: userId } },
    });

    await this.audit.log({
      action: 'COMPLETE_TASK',
      entityType: 'TASK',
      entityId: id,
      jobId: task.jobId,
      newValue: { completedAt: now.toISOString() },
    });

    return this.toResponse(updated);
  }

  @Transactional()
  async cancel(id: string): Promise<TaskResponse> {
    const task = await this.repo.findById(id);
    if (!task) throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
    await this.assertJobAccess(task.jobId);
    if (task.status === 'CANCELLED') throw new BusinessException('TASK_ALREADY_CANCELLED', 'Task already cancelled', 409);
    if (task.status === 'DONE') throw new BusinessException('TASK_DONE', 'Cannot cancel a completed task', 409);

    const userId = this.cls.get('userId')!;
    const updated = await this.repo.update(id, {
      status: 'CANCELLED',
    });

    await this.audit.log({
      action: 'CANCEL_TASK',
      entityType: 'TASK',
      entityId: id,
      jobId: task.jobId,
      oldValue: { status: task.status },
      newValue: { status: 'CANCELLED' },
    });

    void userId;
    return this.toResponse(updated);
  }

  @Transactional()
  async createAutoTask(jobId: string, taskType: string, subject: string, assignedTo?: string): Promise<void> {
    const userId = this.cls.get('userId');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    await this.repo.create({
      job: { connect: { id: jobId } },
      taskType: taskType as any,
      subject,
      dueDate,
      priority: 'MEDIUM',
      assignee: assignedTo ? { connect: { id: assignedTo } } : undefined,
      createdBy: userId ? { connect: { id: userId } } : undefined,
    });

    await this.audit.log({
      action: 'CREATE_TASK',
      entityType: 'TASK',
      entityId: jobId,
      jobId,
      newValue: { taskType, subject, auto: true },
    });
  }
}

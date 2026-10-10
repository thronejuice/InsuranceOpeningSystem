import { Injectable, Optional } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/cls/app-cls-store.js';
import { DataScopeService } from '../../common/access/data-scope.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { NotificationService } from '../notification/notification.service.js';
import { NotificationType } from '../../generated/prisma/enums.js';
import { TaskRepository } from './task.repository.js';
import { isOverdue } from './domain/task-overdue.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { TaskQueryDto } from './dto/task-query.dto.js';
import type { TaskListResponse, TaskResponse } from './dto/task.response.js';
import type { Task, Prisma } from '../../generated/prisma/client.js';
import type { TaskType } from '../../generated/prisma/enums.js';

@Injectable()
export class TaskService {
  constructor(
    private readonly repo: TaskRepository,
    private readonly audit: AuditService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly scope: DataScopeService,
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  /** Task inherits the access rule of its Job (BR-014) if jobId is present. */
  private async assertJobAccess(jobId: string, asTaskNotFound = false): Promise<void> {
    const visible = await this.repo.findJob({ AND: [{ id: jobId }, this.scope.jobViewScope()] });
    if (!visible) {
      if (asTaskNotFound) {
        throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
      }
      throw new BusinessException('JOB_NOT_FOUND', 'Job not found', 404);
    }
  }

  private seesEverything(): boolean {
    return this.scope.getScopeContext().scope === 'ALL';
  }

  /** Tasks the caller may see: those on jobs/policies they can see, plus ones assigned to or created by them. */
  private visibleWhere(): Prisma.TaskWhereInput {
    if (this.seesEverything()) return {};
    const me = this.cls.get('userId') ?? '';
    const jobs = { deletedAt: null, ...this.scope.jobViewScope() };
    return { OR: [{ job: jobs }, { policy: { job: jobs } }, { assignedTo: me }, { createdById: me }] };
  }

  /** A task can be touched only by someone who may see it (job-less tasks are not open to everybody). */
  private async assertTaskAccess(task: Task): Promise<void> {
    if (task.jobId) {
      await this.assertJobAccess(task.jobId, true);
      return;
    }
    const visible = await this.repo.count({ AND: [{ id: task.id }, this.visibleWhere()] });
    if (visible === 0) throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
  }

  /** A task may be attached only to a policy / customer the caller can see. */
  private async assertTargetsVisible(dto: { policyId?: string; customerId?: string }): Promise<void> {
    if (dto.policyId) {
      const policy = await this.repo.findPolicy({ id: dto.policyId, job: { deletedAt: null, ...this.scope.jobViewScope() } });
      if (!policy) throw new BusinessException('POLICY_NOT_FOUND', 'Policy not found', 404);
    }
    if (dto.customerId) {
      const customer = await this.repo.findCustomer({ id: dto.customerId, deletedAt: null, ...this.scope.customerViewScope() });
      if (!customer) throw new BusinessException('CUSTOMER_NOT_FOUND', 'Customer not found', 404);
    }
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
    const where: Prisma.TaskWhereInput = this.visibleWhere();

    if (query.mine) where.assignedTo = userId;
    if (query.status) where.status = query.status;
    if (query.jobId) where.jobId = query.jobId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.policyId) where.policyId = query.policyId;

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
  async create(jobIdOrNull: string | undefined, dto: CreateTaskDto): Promise<TaskResponse> {
    const targetJobId = dto.jobId ?? jobIdOrNull;
    if (targetJobId) {
      await this.assertJobAccess(targetJobId);
    } else if (!dto.customerId && !dto.policyId) {
      throw new BusinessException('TASK_TARGET_REQUIRED', 'Task must relate to at least one of job, customer, or policy', 422);
    }
    await this.assertTargetsVisible(dto);

    const userId = this.cls.get('userId')!;
    const task = await this.repo.create({
      ...(targetJobId ? { job: { connect: { id: targetJobId } } } : {}),
      ...(dto.customerId ? { customer: { connect: { id: dto.customerId } } } : {}),
      ...(dto.policyId ? { policy: { connect: { id: dto.policyId } } } : {}),
      taskType: dto.taskType,
      subject: dto.subject,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      priority: dto.priority ?? 'MEDIUM',
      // an unassigned task belongs to whoever created it, so it shows up under "my tasks"
      assignee: { connect: { id: dto.assignedTo ?? userId } },
      createdBy: { connect: { id: userId } },
    });

    await this.audit.log({
      action: 'CREATE_TASK',
      entityType: 'TASK',
      entityId: task.id,
      jobId: targetJobId,
      newValue: { taskType: task.taskType, subject: task.subject },
    });

    return this.toResponse(task);
  }

  @Transactional()
  async complete(id: string): Promise<TaskResponse> {
    const task = await this.repo.findById(id);
    if (!task) throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
    await this.assertTaskAccess(task);

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
      jobId: task.jobId ?? undefined,
      newValue: { completedAt: now.toISOString() },
    });

    return this.toResponse(updated);
  }

  @Transactional()
  async cancel(id: string): Promise<TaskResponse> {
    const task = await this.repo.findById(id);
    if (!task) throw new BusinessException('TASK_NOT_FOUND', 'Task not found', 404);
    await this.assertTaskAccess(task);

    if (task.status === 'CANCELLED') throw new BusinessException('TASK_ALREADY_CANCELLED', 'Task already cancelled', 409);
    if (task.status === 'DONE') throw new BusinessException('TASK_DONE', 'Cannot cancel a completed task', 409);

    const updated = await this.repo.update(id, {
      status: 'CANCELLED',
    });

    await this.audit.log({
      action: 'CANCEL_TASK',
      entityType: 'TASK',
      entityId: id,
      jobId: task.jobId ?? undefined,
      oldValue: { status: task.status },
      newValue: { status: 'CANCELLED' },
    });

    return this.toResponse(updated);
  }

  @Transactional()
  async createAutoTask(jobId: string, taskType: TaskType, subject: string, assignedTo?: string): Promise<void> {
    const userId = this.cls.get('userId');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    await this.repo.create({
      job: { connect: { id: jobId } },
      taskType,
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

  /**
   * Daily check for overdue tasks (D-20 / OQ-8).
   * Emits TASK_OVERDUE notifications (and emails) to assignees.
   */
  @Transactional()
  async runDailyOverdueCheck(): Promise<{ notifiedCount: number }> {
    const now = new Date();
    const overdueTasks = await this.repo.findMany(
      {
        dueDate: { lt: now },
        status: { in: ['TODO', 'IN_PROGRESS'] },
        assignedTo: { not: null },
      },
      0,
      500,
    );

    let notifiedCount = 0;
    if (this.notifications) {
      for (const t of overdueTasks) {
        if (t.assignedTo) {
          await this.notifications.emit(
            NotificationType.TASK_OVERDUE,
            [t.assignedTo],
            {
              title: `งานเกินกำหนด: ${t.subject}`,
              message: `งาน "${t.subject}" ครบกำหนดตั้งแต่วันที่ ${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '-'}`,
              entityType: 'TASK',
              entityId: t.id,
              jobId: t.jobId ?? undefined,
            },
          );
          notifiedCount++;
        }
      }
    }

    return { notifiedCount };
  }
}

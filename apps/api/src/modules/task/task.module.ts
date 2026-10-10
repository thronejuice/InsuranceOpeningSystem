import { Module } from '@nestjs/common';
import { TaskController } from './task.controller.js';
import { TaskService } from './task.service.js';
import { TaskRepository } from './task.repository.js';
import { AuditModule } from '../../common/audit/audit.module.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [TaskController],
  providers: [TaskService, TaskRepository],
  exports: [TaskService],
})
export class TaskModule {}

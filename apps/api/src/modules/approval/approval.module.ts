import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller.js';
import { ApprovalService } from './approval.service.js';
import { ApprovalRepository } from './approval.repository.js';

import { JobModule } from '../job/job.module.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [JobModule, NotificationModule],
  controllers: [ApprovalController],
  providers: [ApprovalService, ApprovalRepository],
  exports: [ApprovalService],
})
export class ApprovalModule {}

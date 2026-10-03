import { Module, forwardRef } from '@nestjs/common';
import { JobController } from './job.controller.js';
import { JobService } from './job.service.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { JobRepository } from './job.repository.js';
import { JobRiskService } from './job-risk.service.js';
import { JobCoverageService } from './job-coverage.service.js';
import { DocumentModule } from '../document/document.module.js';
import { TaskModule } from '../task/task.module.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [forwardRef(() => DocumentModule), TaskModule, NotificationModule],
  controllers: [JobController],
  providers: [JobService, JobWorkflowService, JobRepository, JobRiskService, JobCoverageService],
  exports: [JobService, JobWorkflowService, JobRiskService],
})
export class JobModule {}

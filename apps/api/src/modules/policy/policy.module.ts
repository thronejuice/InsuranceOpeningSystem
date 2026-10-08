import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller.js';
import { PolicyService } from './policy.service.js';
import { PolicyRepository } from './policy.repository.js';

import { JobModule } from '../job/job.module.js';

@Module({
  imports: [JobModule],
  controllers: [PolicyController],
  providers: [PolicyService, PolicyRepository],
  exports: [PolicyService],
})
export class PolicyModule {}

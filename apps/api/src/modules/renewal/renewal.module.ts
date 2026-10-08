import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RenewalController } from './renewal.controller.js';
import { RenewalService } from './renewal.service.js';
import { RenewalRepository } from './renewal.repository.js';
import { RenewalProcessor } from './renewal.processor.js';
import { RENEWAL_DAILY_JOB, RENEWAL_QUEUE } from './renewal.processor.js';

import { JobModule } from '../job/job.module.js';

@Module({
  imports: [
    JobModule,
    BullModule.registerQueue({ name: RENEWAL_QUEUE }),
  ],
  controllers: [RenewalController],
  providers: [RenewalService, RenewalRepository, RenewalProcessor],
  exports: [RenewalService],
})
export class RenewalModule implements OnModuleInit {
  private readonly logger = new Logger(RenewalModule.name);

  constructor(@InjectQueue(RENEWAL_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      // BullMQ v6: upsertJobScheduler replaces add() with repeat option
      await this.queue.upsertJobScheduler(
        RENEWAL_DAILY_JOB,
        { pattern: '0 1 * * *' },
        { name: RENEWAL_DAILY_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 10 } },
      );
    } catch (err) {
      this.logger.warn(`Could not schedule renewal job (Redis unavailable?): ${(err as Error).message}`);
    }
  }
}

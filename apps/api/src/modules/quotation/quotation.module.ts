import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QuotationController } from './quotation.controller.js';
import { QuotationService } from './quotation.service.js';
import { QuotationRepository } from './quotation.repository.js';
import { QuotationProcessor, QUOTATION_DAILY_EXPIRY_JOB, QUOTATION_QUEUE } from './quotation.processor.js';

import { JobModule } from '../job/job.module.js';

@Module({
  imports: [
    JobModule,
    BullModule.registerQueue({ name: QUOTATION_QUEUE }),
  ],
  controllers: [QuotationController],
  providers: [QuotationService, QuotationRepository, QuotationProcessor],
  exports: [QuotationService],
})
export class QuotationModule implements OnModuleInit {
  private readonly logger = new Logger(QuotationModule.name);

  constructor(@InjectQueue(QUOTATION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        QUOTATION_DAILY_EXPIRY_JOB,
        { pattern: '0 2 * * *' },
        { name: QUOTATION_DAILY_EXPIRY_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 10 } },
      );
    } catch (err) {
      this.logger.warn(`Could not schedule quotation expiry job (Redis unavailable?): ${(err as Error).message}`);
    }
  }
}


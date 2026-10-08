import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QuotationService } from './quotation.service.js';

export const QUOTATION_QUEUE = 'quotation';
export const QUOTATION_DAILY_EXPIRY_JOB = 'daily-quotation-expiry-check';

@Processor(QUOTATION_QUEUE)
export class QuotationProcessor extends WorkerHost {
  private readonly logger = new Logger(QuotationProcessor.name);

  constructor(private readonly quotationService: QuotationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === QUOTATION_DAILY_EXPIRY_JOB) {
      this.logger.log('Running daily quotation expiry and expiring notifications check');
      const result = await this.quotationService.processDaily();
      this.logger.log(
        `Daily quotation check complete: expired ${result.expiredCount} quotations, notified ${result.expiringCount} expiring quotations`,
      );
    }
  }
}


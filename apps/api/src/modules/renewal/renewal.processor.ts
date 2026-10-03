import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { RenewalService } from './renewal.service.js';

export const RENEWAL_QUEUE = 'renewal';
export const RENEWAL_DAILY_JOB = 'daily-renewal-check';

@Processor(RENEWAL_QUEUE)
export class RenewalProcessor extends WorkerHost {
  private readonly logger = new Logger(RenewalProcessor.name);

  constructor(private readonly renewalService: RenewalService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === RENEWAL_DAILY_JOB) {
      this.logger.log('Running daily renewal check');
      await this.renewalService.runDailyRenewalCheck();
      this.logger.log('Daily renewal check complete');
    }
  }
}

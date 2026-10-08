import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailService, type SendMailOptions } from './email.service.js';

export const NOTIFICATION_QUEUE = 'notification';
export const SEND_EMAIL_JOB = 'send-email';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<SendMailOptions>): Promise<void> {
    if (job.name === SEND_EMAIL_JOB) {
      this.logger.debug(`Processing email job for ${job.data.to}`);
      await this.emailService.send(job.data);
    }
  }
}


import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { InvoiceService } from './invoice.service.js';

export const INVOICE_QUEUE = 'invoice';
export const INVOICE_DAILY_JOB = 'daily-invoice-overdue-check';

@Processor(INVOICE_QUEUE)
export class InvoiceProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceProcessor.name);

  constructor(private readonly invoiceService: InvoiceService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === INVOICE_DAILY_JOB) {
      const result = await this.invoiceService.processDaily();
      this.logger.log(
        `Daily invoice check: ${result.overdueCount} became overdue, ` +
          `${result.overdueNotifiedCount} overdue notices, ${result.dueSoonNotifiedCount} due reminders`,
      );
    }
  }
}

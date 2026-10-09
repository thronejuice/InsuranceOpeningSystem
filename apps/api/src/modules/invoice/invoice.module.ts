import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InvoiceRepository } from './invoice.repository.js';
import { InvoiceService } from './invoice.service.js';
import { ReceivableService } from './receivable.service.js';
import { BillingDocumentService } from './billing-document.service.js';
import { CompanyProfileModule } from '../company-profile/company-profile.module.js';
import { CommissionModule } from '../commission/commission.module.js';
import { InvoicesListController, PolicyInvoiceController } from './invoice.controller.js';
import { ReceivableController } from './receivable.controller.js';
import { INVOICE_DAILY_JOB, INVOICE_QUEUE, InvoiceProcessor } from './invoice.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: INVOICE_QUEUE }), CompanyProfileModule, CommissionModule],
  controllers: [InvoicesListController, PolicyInvoiceController, ReceivableController],
  providers: [InvoiceService, ReceivableService, BillingDocumentService, InvoiceRepository, InvoiceProcessor],
  exports: [InvoiceService, InvoiceRepository, BillingDocumentService],
})
export class InvoiceModule implements OnModuleInit {
  private readonly logger = new Logger(InvoiceModule.name);

  constructor(@InjectQueue(INVOICE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        INVOICE_DAILY_JOB,
        { pattern: '30 2 * * *' },
        { name: INVOICE_DAILY_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 10 } },
      );
    } catch (err) {
      this.logger.warn(`Could not schedule invoice daily job (Redis unavailable?): ${(err as Error).message}`);
    }
  }
}

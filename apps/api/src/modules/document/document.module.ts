import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';
import { DocumentRepository } from './document.repository.js';
import { DocumentProcessor, DOCUMENT_DAILY_EXPIRY_JOB, DOCUMENT_QUEUE } from './document.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: DOCUMENT_QUEUE }),
  ],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentRepository, DocumentProcessor],
  exports: [DocumentService],
})
export class DocumentModule implements OnModuleInit {
  private readonly logger = new Logger(DocumentModule.name);

  constructor(@InjectQueue(DOCUMENT_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        DOCUMENT_DAILY_EXPIRY_JOB,
        { pattern: '0 2 * * *' },
        { name: DOCUMENT_DAILY_EXPIRY_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 10 } },
      );
    } catch (err) {
      this.logger.warn(`Could not schedule document expiry job (Redis unavailable?): ${(err as Error).message}`);
    }
  }
}

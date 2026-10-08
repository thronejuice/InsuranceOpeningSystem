import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DocumentService } from './document.service.js';

export const DOCUMENT_QUEUE = 'document';
export const DOCUMENT_DAILY_EXPIRY_JOB = 'daily-document-expiry-check';

@Processor(DOCUMENT_QUEUE)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly documentService: DocumentService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === DOCUMENT_DAILY_EXPIRY_JOB) {
      this.logger.log('Running daily document expiry check');
      const result = await this.documentService.expireOutdatedDocuments();
      this.logger.log(`Daily document expiry check complete: expired ${result.count} documents`);
    }
  }
}


import { Module } from '@nestjs/common';
import { QuotationController } from './quotation.controller.js';
import { QuotationService } from './quotation.service.js';
import { QuotationRepository } from './quotation.repository.js';

@Module({
  controllers: [QuotationController],
  providers: [QuotationService, QuotationRepository],
  exports: [QuotationService],
})
export class QuotationModule {}

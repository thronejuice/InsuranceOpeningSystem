import { Module } from '@nestjs/common';
import {
  InvoicePaymentController,
  PaymentController,
  PaymentsListController,
  ReceiptController,
} from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { ReceiptService } from './receipt.service.js';
import { PaymentRepository } from './payment.repository.js';
import { InvoiceModule } from '../invoice/invoice.module.js';

@Module({
  imports: [InvoiceModule],
  controllers: [PaymentsListController, PaymentController, InvoicePaymentController, ReceiptController],
  providers: [PaymentService, ReceiptService, PaymentRepository],
  exports: [PaymentService],
})
export class PaymentModule {}

import { Module } from '@nestjs/common';
import { PaymentController, PaymentsListController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PaymentRepository } from './payment.repository.js';

@Module({
  controllers: [PaymentsListController, PaymentController],
  providers: [PaymentService, PaymentRepository],
  exports: [PaymentService],
})
export class PaymentModule {}

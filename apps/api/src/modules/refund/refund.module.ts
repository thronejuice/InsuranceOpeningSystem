import { Module } from '@nestjs/common';
import { RefundController } from './refund.controller.js';
import { RefundRepository } from './refund.repository.js';
import { RefundService } from './refund.service.js';

@Module({
  controllers: [RefundController],
  providers: [RefundService, RefundRepository],
  exports: [RefundService, RefundRepository],
})
export class RefundModule {}


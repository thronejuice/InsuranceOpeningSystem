import { Module } from '@nestjs/common';
import { CommissionController } from './commission.controller.js';
import { CommissionService } from './commission.service.js';
import { CommissionRepository } from './commission.repository.js';

@Module({
  controllers: [CommissionController],
  providers: [CommissionService, CommissionRepository],
  exports: [CommissionService],
})
export class CommissionModule {}

import { Module } from '@nestjs/common';
import { CommissionController, CommissionStatementController } from './commission.controller.js';
import { CommissionAdjustmentService } from './commission-adjustment.service.js';
import { CommissionStatementService } from './commission-statement.service.js';
import { CommissionSummaryService } from './commission-summary.service.js';
import { CommissionService } from './commission.service.js';
import { CommissionRepository } from './commission.repository.js';
import { SystemSettingModule } from '../system-setting/system-setting.module.js';

@Module({
  imports: [SystemSettingModule],
  controllers: [CommissionController, CommissionStatementController],
  providers: [
    CommissionService,
    CommissionRepository,
    CommissionAdjustmentService,
    CommissionStatementService,
    CommissionSummaryService,
  ],
  exports: [CommissionService],
})
export class CommissionModule {}

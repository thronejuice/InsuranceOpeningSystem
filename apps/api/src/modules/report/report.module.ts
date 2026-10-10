import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module.js';
import { ReportController } from './report.controller.js';
import { ReportService } from './report.service.js';

@Module({
  imports: [CommissionModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}

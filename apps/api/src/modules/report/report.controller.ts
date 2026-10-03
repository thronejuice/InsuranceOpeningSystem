import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ReportService } from './report.service.js';
import { JobQueryDto } from '../job/dto/job-query.dto.js';
import { ListQuotationDto } from '../quotation/dto/list-quotation.dto.js';
import { ListPolicyDto } from '../policy/dto/list-policy.dto.js';
import { CommissionQueryDto } from '../commission/dto/commission-query.dto.js';
import { RenewalQueryDto } from '../renewal/dto/renewal-query.dto.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  @Get('jobs/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export jobs to Excel' })
  exportJobs(@Query() query: JobQueryDto, @Res() res: Response): Promise<void> {
    return this.service.exportJobs(query, res);
  }

  @Get('quotations/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export quotations to Excel' })
  exportQuotations(@Query() query: ListQuotationDto, @Res() res: Response): Promise<void> {
    return this.service.exportQuotations(query, res);
  }

  @Get('policies/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export policies to Excel' })
  exportPolicies(@Query() query: ListPolicyDto, @Res() res: Response): Promise<void> {
    return this.service.exportPolicies(query, res);
  }

  @Get('payments/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export payments to Excel' })
  exportPayments(@Res() res: Response): Promise<void> {
    return this.service.exportPayments(res);
  }

  @Get('commissions/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export commissions to Excel' })
  exportCommissions(@Query() query: CommissionQueryDto, @Res() res: Response): Promise<void> {
    return this.service.exportCommissions(query, res);
  }

  @Get('renewals/export')
  @RequirePermissions('report.view')
  @ApiOperation({ summary: 'Export renewals to Excel' })
  exportRenewals(@Query() query: RenewalQueryDto, @Res() res: Response): Promise<void> {
    return this.service.exportRenewals(query, res);
  }
}

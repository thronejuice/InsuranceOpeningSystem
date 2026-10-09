import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { CommissionService } from './commission.service.js';
import { CommissionQueryDto } from './dto/commission-query.dto.js';
import { CommissionAdjustmentService } from './commission-adjustment.service.js';
import { CommissionStatementService } from './commission-statement.service.js';
import { CommissionSummaryService } from './commission-summary.service.js';
import { CreateAdjustmentDto, ListAdjustmentDto } from './dto/adjustment.dto.js';
import { CancelStatementDto, CreateStatementDto, ListStatementDto, MarkStatementPaidDto } from './dto/statement.dto.js';
import { CommissionSummaryQueryDto } from './dto/summary-query.dto.js';

@ApiTags('commissions')
@ApiBearerAuth()
@Controller()
export class CommissionController {
  constructor(
    private readonly service: CommissionService,
    private readonly adjustments: CommissionAdjustmentService,
    private readonly summary: CommissionSummaryService,
  ) {}

  @Get('commissions')
  @RequirePermissions('commission.view')
  list(@Query() query: CommissionQueryDto) {
    return this.service.list(query);
  }

  /** Declared before any `commissions/:id` route so "summary" is never read as an id. */
  @Get('commissions/summary')
  @RequirePermissions('commission.view')
  summarize(@Query() query: CommissionSummaryQueryDto) {
    return this.summary.summarize(query);
  }

  @Get('commission-adjustments')
  @RequirePermissions('commission.view')
  listAdjustments(@Query() query: ListAdjustmentDto) {
    return this.adjustments.list(query);
  }

  @Get('policies/:policyId/commissions')
  @RequirePermissions('commission.view')
  listByPolicy(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.listByPolicy(policyId);
  }

  /** Commission is calculated automatically when a policy is issued; this recalculates (e.g. after a rate was added). */
  @Post('policies/:policyId/commissions/calculate')
  @RequirePermissions('commission.create')
  calculate(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.recalculate(policyId);
  }

  @Post('commissions/:id/approve')
  @RequirePermissions('commission.approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id);
  }

  @Post('commissions/:id/adjustments')
  @RequirePermissions('commission.adjust')
  createAdjustment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAdjustmentDto) {
    return this.adjustments.create(id, dto);
  }

  @Get('commissions/:id/adjustments')
  @RequirePermissions('commission.view')
  adjustmentsOf(@Param('id', ParseUUIDPipe) id: string) {
    return this.adjustments.listByCommission(id);
  }
}

@ApiTags('commission-statements')
@ApiBearerAuth()
@Controller('commission-statements')
export class CommissionStatementController {
  constructor(private readonly service: CommissionStatementService) {}

  @Post()
  @RequirePermissions('commission.statement')
  create(@Body() dto: CreateStatementDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('commission.view')
  list(@Query() query: ListStatementDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('commission.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post(':id/confirm')
  @RequirePermissions('commission.statement')
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.confirm(id);
  }

  @Post(':id/mark-paid')
  @RequirePermissions('commission.statement')
  markPaid(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkStatementPaidDto) {
    return this.service.markPaid(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('commission.statement')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelStatementDto) {
    return this.service.cancel(id, dto);
  }
}

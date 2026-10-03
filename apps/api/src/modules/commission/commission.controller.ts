import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { CommissionService } from './commission.service.js';
import { CreateCommissionDto } from './dto/create-commission.dto.js';
import { CommissionQueryDto } from './dto/commission-query.dto.js';

@ApiTags('commissions')
@ApiBearerAuth()
@Controller()
export class CommissionController {
  constructor(private readonly service: CommissionService) {}

  @Get('commissions')
  @RequirePermissions('commission.view')
  list(@Query() query: CommissionQueryDto) {
    return this.service.list(query);
  }

  @Get('policies/:policyId/commissions')
  @RequirePermissions('commission.view')
  listByPolicy(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.listByPolicy(policyId);
  }

  @Post('policies/:policyId/commission')
  @RequirePermissions('commission.create')
  create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreateCommissionDto,
  ) {
    return this.service.create(policyId, dto);
  }
}

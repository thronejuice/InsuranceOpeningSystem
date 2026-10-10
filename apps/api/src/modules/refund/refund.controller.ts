import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { RefundService } from './refund.service.js';
import {
  CreateRefundDto,
  ListRefundQueryDto,
  ProcessRefundDto,
  RejectRefundDto,
} from './dto/refund.dto.js';

@ApiTags('refunds')
@ApiBearerAuth()
@Controller('refunds')
export class RefundController {
  constructor(private readonly service: RefundService) {}

  @Get()
  @RequirePermissions('invoice.view')
  list(@Query() dto: ListRefundQueryDto) {
    return this.service.list(dto);
  }

  @Get(':id')
  @RequirePermissions('invoice.view')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermissions('invoice.update')
  requestRefund(@Body() dto: CreateRefundDto) {
    return this.service.requestRefund(dto);
  }

  @Post(':id/approve')
  @RequirePermissions('invoice.update')
  approveRefund(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveRefund(id);
  }

  @Post(':id/reject')
  @RequirePermissions('invoice.update')
  rejectRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRefundDto,
  ) {
    return this.service.rejectRefund(id, dto);
  }

  @Post(':id/process')
  @RequirePermissions('payment.create')
  processRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProcessRefundDto,
  ) {
    return this.service.processRefund(id, dto);
  }
}


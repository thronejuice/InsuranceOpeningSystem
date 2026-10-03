import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { PaginationQueryDto } from '../../common/http/pagination.dto.js';
import { PaymentService } from './payment.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { CancelPaymentDto } from './dto/cancel-payment.dto.js';

class PaymentQueryDto extends PaginationQueryDto {
  @IsString() @IsOptional() policyId?: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsListController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @RequirePermissions('payment.view')
  listAll(@Query() query: PaymentQueryDto) {
    return this.service.listAll(query);
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('policies/:policyId')
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get('payments')
  @RequirePermissions('payment.view')
  list(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.listByPolicy(policyId);
  }

  @Post('payments')
  @RequirePermissions('payment.create')
  create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(policyId, dto, idempotencyKey);
  }

  @Post('payments/:id/cancel')
  @RequirePermissions('payment.create')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('policyId', ParseUUIDPipe) _policyId: string,
    @Body() dto: CancelPaymentDto,
  ) {
    return this.service.cancel(id, dto);
  }
}

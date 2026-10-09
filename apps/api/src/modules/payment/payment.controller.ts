import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsOptional, IsUUID } from 'class-validator';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { PaginationQueryDto } from '../../common/http/pagination.dto.js';
import { sendPdf } from '../../common/pdf/send-pdf.js';
import { BillingDocumentService } from '../invoice/billing-document.service.js';
import { PaymentService } from './payment.service.js';
import { ReceiptService } from './receipt.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { CancelPaymentDto } from './dto/cancel-payment.dto.js';
import { ListReceiptDto } from './dto/list-receipt.dto.js';

class PaymentQueryDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() policyId?: string;
  @IsUUID() @IsOptional() invoiceId?: string;
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

  @Post(':id/cancel')
  @RequirePermissions('payment.create')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelPaymentDto) {
    return this.service.cancel(id, dto);
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
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('invoices/:invoiceId')
export class InvoicePaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get('payments')
  @RequirePermissions('payment.view')
  list(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Query() query: PaginationQueryDto) {
    return this.service.listAll({ ...query, invoiceId });
  }

  @Post('payments')
  @RequirePermissions('payment.create')
  create(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createForInvoice(invoiceId, dto, idempotencyKey);
  }
}

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptController {
  constructor(
    private readonly service: ReceiptService,
    private readonly documents: BillingDocumentService,
  ) {}

  @Get()
  @RequirePermissions('payment.view')
  list(@Query() query: ListReceiptDto) {
    return this.service.list(query);
  }

  @Get(':id/pdf')
  @RequirePermissions('payment.view')
  @ApiProduces('application/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendPdf(res, await this.documents.receiptPdf(id));
  }

  @Get(':id')
  @RequirePermissions('payment.view')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }
}

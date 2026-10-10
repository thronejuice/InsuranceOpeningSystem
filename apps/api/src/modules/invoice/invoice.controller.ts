import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { sendPdf } from '../../common/pdf/send-pdf.js';
import { BillingDocumentService } from './billing-document.service.js';
import { InvoiceService } from './invoice.service.js';
import { ListInvoiceDto } from './dto/list-invoice.dto.js';

class CancelInvoiceBodyDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesListController {
  constructor(
    private readonly service: InvoiceService,
    private readonly documents: BillingDocumentService,
  ) {}

  @Get()
  @RequirePermissions('invoice.view')
  list(@Query() query: ListInvoiceDto) {
    return this.service.listInvoices(query);
  }

  @Post('process-daily')
  @RequirePermissions('maintenance.run')
  processDaily() {
    return this.service.processDaily();
  }

  @Get(':id')
  @RequirePermissions('invoice.view')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getInvoiceById(id);
  }

  @Get(':id/pdf')
  @RequirePermissions('invoice.view')
  @ApiProduces('application/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendPdf(res, await this.documents.invoicePdf(id));
  }

  @Post(':id/cancel')
  @RequirePermissions('invoice.update')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelInvoiceBodyDto) {
    return this.service.cancelInvoice(id, body.reason);
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('policies/:policyId')
export class PolicyInvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get('invoices')
  @RequirePermissions('invoice.view')
  listByPolicy(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.getInvoicesByPolicy(policyId);
  }
}


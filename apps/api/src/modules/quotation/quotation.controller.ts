import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { QuotationService } from './quotation.service.js';
import { CreateQuotationDto } from './dto/create-quotation.dto.js';
import { UpdateQuotationDto } from './dto/update-quotation.dto.js';
import { SelectQuotationDto } from './dto/select-quotation.dto.js';
import { ListQuotationDto } from './dto/list-quotation.dto.js';

@ApiTags('quotations')
@ApiBearerAuth()
@Controller()
export class QuotationController {
  constructor(private readonly service: QuotationService) {}

  @Get('quotations')
  @RequirePermissions('job.view')
  listAll(@Query() dto: ListQuotationDto) {
    return this.service.listAll(dto);
  }

  @Get('jobs/:jobId/quotations')
  @RequirePermissions('job.view')
  listByJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.listByJob(jobId);
  }

  @Get('jobs/:jobId/quotation-comparison')
  @RequirePermissions('job.view')
  comparison(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.comparison(jobId);
  }

  @Post('jobs/:jobId/quotations')
  @RequirePermissions('quotation.create')
  create(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.service.create(jobId, dto);
  }

  @Put('quotations/:id')
  @RequirePermissions('quotation.update')
  recordReceived(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.service.recordReceived(id, dto);
  }

  @Post('quotations/:id/select')
  @RequirePermissions('quotation.select')
  select(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SelectQuotationDto,
  ) {
    return this.service.select(id, dto);
  }
}

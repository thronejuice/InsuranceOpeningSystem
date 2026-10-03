import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ImportService } from './import.service.js';

type TemplateType = 'customers' | 'customer-addresses' | 'jobs';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportController {
  constructor(private readonly service: ImportService) {}

  // ─── Template downloads ────────────────────────────────────────────────────

  @Get('templates/:type')
  @RequirePermissions('import.create')
  @ApiOperation({ summary: 'Download import template Excel file' })
  async downloadTemplate(
    @Param('type') type: string,
    @Res() res: Response,
  ): Promise<void> {
    const validTypes: TemplateType[] = ['customers', 'customer-addresses', 'jobs'];
    if (!validTypes.includes(type as TemplateType)) {
      res.status(400).json({ message: `Invalid template type. Valid: ${validTypes.join(', ')}` });
      return;
    }
    const buf = await this.service.buildTemplate(type as TemplateType);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="template-${type}.xlsx"`);
    res.end(buf);
  }

  // ─── Import endpoints ──────────────────────────────────────────────────────

  @Post('customers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Import customers from Excel (dryRun=true validates only)' })
  importCustomers(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.importCustomers(file.buffer, dryRun === 'true');
  }

  @Post('customer-addresses')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Import customer addresses from Excel' })
  importCustomerAddresses(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.importCustomerAddresses(file.buffer, dryRun === 'true');
  }

  @Post('jobs')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Import jobs (+ Motor Risk) from Excel' })
  importJobs(
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.importJobs(file.buffer, dryRun === 'true');
  }
}

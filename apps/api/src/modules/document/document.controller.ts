import {
  Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe,
  Post, Res, UploadedFile, UseInterceptors, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { DocumentService } from './document.service.js';
import { UploadDocumentDto } from './dto/document.dto.js';

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
export class DocumentController {
  constructor(private readonly svc: DocumentService) {}

  // ─── Job-scoped endpoints ─────────────────────────────────────────────────

  @Get('jobs/:jobId/documents')
  @RequirePermissions('job.view')
  list(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.svc.list(jobId);
  }

  @Post('jobs/:jobId/documents')
  @RequirePermissions('job.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: undefined, limits: { fileSize: 11 * 1024 * 1024 } }))
  upload(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new Error('No file uploaded');
    return this.svc.upload(jobId, dto, file);
  }

  @Get('jobs/:jobId/documents/checklist')
  @RequirePermissions('job.view')
  checklist(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.svc.getChecklist(jobId);
  }

  // ─── Document-level endpoints ─────────────────────────────────────────────

  @Get('documents/:id/download')
  @RequirePermissions('job.view')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalName } = await this.svc.download(id);
    const safeName = encodeURIComponent(originalName);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Delete('documents/:id')
  @RequirePermissions('job.update')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(id);
  }
}

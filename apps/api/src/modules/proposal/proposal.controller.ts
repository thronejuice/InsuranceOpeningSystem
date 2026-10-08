import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiProduces, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ProposalService } from './proposal.service.js';
import { ProposalDocumentService } from './proposal-document.service.js';
import { CreateProposalDto } from './dto/create-proposal.dto.js';
import { RejectProposalDto } from './dto/reject-proposal.dto.js';
import { AcceptProposalDto } from './dto/accept-proposal.dto.js';
import { WorkflowActionDto } from '../job/dto/workflow-action.dto.js';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller()
export class ProposalController {
  constructor(
    private readonly service: ProposalService,
    private readonly document: ProposalDocumentService,
  ) {}

  @Get('jobs/:jobId/proposals')
  @RequirePermissions('job.view')
  listByJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.listByJob(jobId);
  }

  @Post('jobs/:jobId/proposal')
  @RequirePermissions('proposal.create')
  create(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.service.create(jobId, dto);
  }

  @Get('proposals/:id/pdf')
  @RequirePermissions('proposal.view')
  @ApiProduces('application/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.document.download(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  @Post('proposals/:id/send')
  @RequirePermissions('proposal.send')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.send(id);
  }

  @Get('proposals/:id/acceptance')
  @RequirePermissions('proposal.view')
  getAcceptance(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAcceptance(id);
  }

  @Post('proposals/:id/accept')
  @RequirePermissions('proposal.accept')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file', { storage: undefined, limits: { fileSize: 10 * 1024 * 1024 } }))
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptProposalDto,
    @UploadedFile() file?: Express.Multer.File,
    @Ip() ip?: string,
  ) {
    return this.service.accept(id, dto, file, ip);
  }

  @Post('proposals/:id/reject')
  @RequirePermissions('proposal.reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProposalDto,
  ) {
    return this.service.reject(id, dto);
  }

  @Post('proposals/:id/revise')
  @RequirePermissions('proposal.create')
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkflowActionDto,
  ) {
    return this.service.revise(id, dto);
  }

  @Post('proposals/daily-check')
  @RequirePermissions('proposal.create')
  processDaily() {
    return this.service.processDaily();
  }
}

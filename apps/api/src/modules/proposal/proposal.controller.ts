import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ProposalService } from './proposal.service.js';
import { CreateProposalDto } from './dto/create-proposal.dto.js';
import { RejectProposalDto } from './dto/reject-proposal.dto.js';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller()
export class ProposalController {
  constructor(private readonly service: ProposalService) {}

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

  @Post('proposals/:id/send')
  @RequirePermissions('proposal.send')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.send(id);
  }

  @Post('proposals/:id/accept')
  @RequirePermissions('proposal.accept')
  accept(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.accept(id);
  }

  @Post('proposals/:id/reject')
  @RequirePermissions('proposal.reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProposalDto,
  ) {
    return this.service.reject(id, dto);
  }
}

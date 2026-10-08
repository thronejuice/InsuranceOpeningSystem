import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { UnderwritingStatus } from '../../generated/prisma/enums.js';
import { UnderwritingService } from './underwriting.service.js';
import {
  RequestUnderwritingDto,
  ReviewUnderwritingDto,
} from './dto/underwriting.dto.js';

@ApiTags('underwriting')
@ApiBearerAuth()
@Controller()
export class UnderwritingController {
  constructor(private readonly service: UnderwritingService) {}

  @Get('jobs/:jobId/underwriting')
  @RequirePermissions('job.view')
  async getByJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    const [latest, history] = await Promise.all([
      this.service.getLatest(jobId),
      this.service.listHistory(jobId),
    ]);
    return { latest, history };
  }

  @Get('underwriting/inbox')
  @RequirePermissions('underwriting.review')
  async getInbox() {
    return this.service.getInbox();
  }

  @Post('jobs/:jobId/underwriting/request-review')
  @RequirePermissions('job.update')
  async requestReview(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: RequestUnderwritingDto,
  ) {
    return this.service.requestReview(jobId, dto);
  }

  @Post('jobs/:jobId/underwriting/review')
  @RequirePermissions('underwriting.review')
  async review(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: ReviewUnderwritingDto,
  ) {
    return this.service.review(jobId, dto);
  }

  @Post('jobs/:jobId/underwriting/approve')
  @RequirePermissions('underwriting.review')
  async approve(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: Partial<ReviewUnderwritingDto>,
  ) {
    return this.service.review(jobId, {
      ...dto,
      status: UnderwritingStatus.APPROVED,
    });
  }

  @Post('jobs/:jobId/underwriting/require-info')
  @RequirePermissions('underwriting.review')
  async requireInfo(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: Partial<ReviewUnderwritingDto>,
  ) {
    return this.service.review(jobId, {
      ...dto,
      status: UnderwritingStatus.INFO_REQUIRED,
    });
  }

  @Post('jobs/:jobId/underwriting/reject')
  @RequirePermissions('underwriting.review')
  async reject(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: Partial<ReviewUnderwritingDto>,
  ) {
    return this.service.review(jobId, {
      ...dto,
      status: UnderwritingStatus.REJECTED,
    });
  }

  @Post('jobs/:jobId/underwriting/resume')
  @RequirePermissions('job.update')
  async resume(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: { reason?: string },
  ) {
    return this.service.resume(jobId, dto.reason);
  }
}


import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { ApprovalService } from './approval.service.js';
import { ApproveApprovalDto } from './dto/approve-approval.dto.js';
import { RejectApprovalDto } from './dto/reject-approval.dto.js';
import { ListApprovalDto } from './dto/list-approval.dto.js';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Get()
  @RequirePermissions('approval.approve')
  list(@Query() dto: ListApprovalDto) {
    return this.service.getInbox(dto);
  }

  @Post(':id/approve')
  @RequirePermissions('approval.approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveApprovalDto,
  ) {
    return this.service.approve(id, dto);
  }

  @Post(':id/reject')
  @RequirePermissions('approval.approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.service.reject(id, dto);
  }
}

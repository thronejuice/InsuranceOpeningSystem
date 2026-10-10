import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { EndorsementService } from './endorsement.service.js';
import { CalculateProRataDto, CreateEndorsementDto } from './dto/create-endorsement.dto.js';
import { ListEndorsementDto } from './dto/list-endorsement.dto.js';

class CancelEndorsementBodyDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

@ApiTags('endorsements')
@ApiBearerAuth()
@Controller('endorsements')
export class EndorsementsListController {
  constructor(private readonly service: EndorsementService) {}

  @Get()
  @RequirePermissions('policy.view')
  list(@Query() query: ListEndorsementDto) {
    return this.service.listEndorsements(query);
  }

  @Get(':id')
  @RequirePermissions('policy.view')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEndorsementById(id);
  }

  @Post(':id/submit')
  @RequirePermissions('policy.update')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.submitEndorsement(id);
  }

  @Post(':id/start-review')
  @RequirePermissions('policy.update')
  startReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.startReview(id);
  }

  @Post(':id/approve')
  @RequirePermissions('approval.approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveEndorsement(id);
  }

  @Post(':id/reject')
  @RequirePermissions('approval.approve')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelEndorsementBodyDto) {
    return this.service.rejectEndorsement(id, body.reason);
  }

  @Post(':id/issue')
  @RequirePermissions('policy.update')
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.issueEndorsement(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('policy.update')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelEndorsementBodyDto) {
    return this.service.cancelEndorsement(id, body.reason);
  }
}

@ApiTags('endorsements')
@ApiBearerAuth()
@Controller('policies/:policyId/endorsements')
export class PolicyEndorsementController {
  constructor(private readonly service: EndorsementService) {}

  @Get()
  @RequirePermissions('policy.view')
  listByPolicy(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.getEndorsementsByPolicy(policyId);
  }

  @Post()
  @RequirePermissions('policy.update')
  create(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CreateEndorsementDto,
  ) {
    return this.service.createEndorsement(policyId, dto);
  }

  @Post('calculate-pro-rata')
  @RequirePermissions('policy.view')
  calculateProRata(
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() dto: CalculateProRataDto,
  ) {
    return this.service.calculateProRata(policyId, dto);
  }
}

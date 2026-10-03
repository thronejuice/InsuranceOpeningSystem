import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { RenewalService } from './renewal.service.js';
import { RenewalQueryDto } from './dto/renewal-query.dto.js';

@ApiTags('renewals')
@ApiBearerAuth()
@Controller()
export class RenewalController {
  constructor(private readonly service: RenewalService) {}

  @Get('renewals')
  @RequirePermissions('renewal.view')
  @ApiOperation({ summary: 'List all renewals' })
  list(@Query() query: RenewalQueryDto) {
    return this.service.list(query);
  }

  @Post('policies/:policyId/renew')
  @RequirePermissions('renewal.create')
  @ApiOperation({ summary: 'Initiate renewal for a policy (BR-013)' })
  renew(@Param('policyId', ParseUUIDPipe) policyId: string) {
    return this.service.renewPolicy(policyId);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { RenewalService } from './renewal.service.js';
import { RenewalQueryDto } from './dto/renewal-query.dto.js';
import { RenewPolicyDto } from './dto/renew-policy.dto.js';

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
  renew(@Param('policyId', ParseUUIDPipe) policyId: string, @Body() dto: RenewPolicyDto) {
    return this.service.renewPolicy(policyId, dto);
  }

  @Post('renewals/:id/contact-customer')
  @RequirePermissions('renewal.update')
  @ApiOperation({ summary: 'Mark renewal status as customer contacted' })
  contactCustomer(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.contactCustomer(id);
  }

  @Post('renewals/process-daily')
  @RequirePermissions('maintenance.run')
  @ApiOperation({ summary: 'Run daily renewal timeline checks' })
  processDaily() {
    return this.service.runDailyRenewalCheck();
  }

  @Get('jobs/:jobId/renewal-reference')
  @RequirePermissions('renewal.view')
  @ApiOperation({ summary: 'Previous policy summary for a renewal job (null when not a renewal)' })
  reference(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.getReference(jobId);
  }
}

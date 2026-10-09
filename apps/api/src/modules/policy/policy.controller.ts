import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { PolicyService } from './policy.service.js';
import { BindDto } from './dto/bind.dto.js';
import { ConfirmBindingDto } from './dto/confirm-binding.dto.js';
import { RejectBindingDto } from './dto/reject-binding.dto.js';
import { CreatePolicyDto } from './dto/create-policy.dto.js';
import { UpdatePolicyDto } from './dto/update-policy.dto.js';
import { ListPolicyDto } from './dto/list-policy.dto.js';

@ApiTags('policies')
@ApiBearerAuth()
@Controller()
export class PolicyController {
  constructor(private readonly service: PolicyService) {}

  @Get('jobs/:jobId/bind/preconditions')
  @RequirePermissions('job.view')
  getPreconditions(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.getPreconditions(jobId);
  }

  @Get('jobs/:jobId/bind')
  @RequirePermissions('job.view')
  getBinding(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.getBindingByJobId(jobId);
  }

  @Post('jobs/:jobId/bind')
  @RequirePermissions('policy.create')
  bind(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: BindDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.bind(jobId, dto, idempotencyKey);
  }

  @Post('jobs/:jobId/bind/confirm')
  @RequirePermissions('policy.create')
  confirmBinding(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: ConfirmBindingDto,
  ) {
    return this.service.confirmBinding(jobId, dto);
  }

  @Post('jobs/:jobId/bind/reject')
  @RequirePermissions('policy.create')
  insurerRejectBinding(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: RejectBindingDto,
  ) {
    return this.service.insurerRejectBinding(jobId, dto);
  }

  @Get('policies')
  @RequirePermissions('policy.view')
  list(@Query() dto: ListPolicyDto) {
    return this.service.listPolicies(dto);
  }

  @Get('policies/:id')
  @RequirePermissions('policy.view')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPolicyById(id);
  }

  @Post('jobs/:jobId/policy')
  @RequirePermissions('policy.create')
  createPolicy(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.service.createPolicy(jobId, dto);
  }

  @Put('policies/:id')
  @RequirePermissions('policy.update')
  updatePolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.service.updatePolicy(id, dto);
  }

  @Post('policies/process-daily')
  @RequirePermissions('policy.update')
  processDaily() {
    return this.service.maintainPolicyStatuses();
  }
}

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
import {
  CalculateCancellationRefundDto,
  RequestCancellationDto,
  ApproveCancellationDto,
  RejectCancellationDto,
} from './dto/cancel-policy.dto.js';

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

  @Get('policies/:id/versions')
  @RequirePermissions('policy.view')
  getVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPolicyVersions(id);
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
  @RequirePermissions('maintenance.run')
  processDaily() {
    return this.service.maintainPolicyStatuses();
  }

  // ─── Policy Cancellation (Day 33) ──────────────────────────────────────────

  @Post('policies/:id/cancel-calculate')
  @RequirePermissions('policy.view')
  calculateCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalculateCancellationRefundDto,
  ) {
    return this.service.calculateCancellation(id, dto);
  }

  @Post('policies/:id/cancel-request')
  @RequirePermissions('policy.update')
  requestCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestCancellationDto,
  ) {
    return this.service.requestCancellation(id, dto);
  }

  @Post('policies/:id/cancel-approve')
  @RequirePermissions('policy.update')
  approveCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCancellationDto,
  ) {
    return this.service.approveCancellation(id, dto);
  }

  @Post('policies/:id/cancel-reject')
  @RequirePermissions('policy.update')
  rejectCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectCancellationDto,
  ) {
    return this.service.rejectCancellation(id, dto);
  }
}


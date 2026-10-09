import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { JobService } from './job.service.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { JobRiskService } from './job-risk.service.js';
import { JobCoverageService } from './job-coverage.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { JobQueryDto } from './dto/job-query.dto.js';
import { AssignJobDto } from './dto/assign-job.dto.js';
import { WorkflowActionDto } from './dto/workflow-action.dto.js';
import { CancelJobDto } from './dto/cancel-job.dto.js';
import { SaveRiskDto } from './dto/risk.dto.js';
import { CreateJobCoverageDto, UpdateJobCoverageDto } from './dto/coverage.dto.js';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobController {
  constructor(
    private readonly service: JobService,
    private readonly workflow: JobWorkflowService,
    private readonly riskSvc: JobRiskService,
    private readonly coverageSvc: JobCoverageService,
  ) {}

  @Get()
  @RequirePermissions('job.view')
  list(@Query() query: JobQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions('job.create')
  create(@Body() dto: CreateJobDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermissions('job.view')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(id);
  }

  @Put(':id')
  @RequirePermissions('job.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/assign')
  @RequirePermissions('job.assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignJobDto) {
    return this.service.assign(id, dto);
  }

  @Get(':id/assignment-histories')
  @RequirePermissions('job.view')
  getAssignmentHistories(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAssignmentHistories(id);
  }

  @Post(':id/submit')
  @RequirePermissions('job.submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.transition(id, 'OPEN', { reason: dto.reason });
  }

  @Post(':id/request-info')
  @RequirePermissions('job.update')
  requestInfo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.transition(id, 'WAITING_INFORMATION', { reason: dto.reason });
  }

  @Post(':id/resume')
  @RequirePermissions('job.update')
  resume(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.transition(id, 'OPEN', { reason: dto.reason });
  }

  @Post(':id/revise')
  @RequirePermissions('job.update')
  revise(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.revise(id, { reason: dto.reason });
  }

  @Post(':id/cancel')
  @RequirePermissions('job.cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelJobDto) {
    return this.workflow.transition(id, 'CANCELLED', { reason: dto.reason });
  }

  @Post(':id/cancel-request')
  @RequirePermissions('job.cancel')
  requestCancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelJobDto) {
    return this.workflow.requestCancel(id, { reason: dto.reason });
  }

  @Post(':id/cancel-approve')
  @RequirePermissions('job.cancel')
  approveCancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.approveCancel(id, { reason: dto.reason });
  }

  @Post(':id/cancel-reject')
  @RequirePermissions('job.cancel')
  rejectCancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelJobDto) {
    return this.workflow.rejectCancel(id, { reason: dto.reason });
  }

  @Post(':id/close')
  @RequirePermissions('job.update')
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkflowActionDto) {
    return this.workflow.transition(id, 'CLOSED', { reason: dto.reason });
  }

  @Get(':id/activities')
  @RequirePermissions('job.view')
  activities(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflow.getActivities(id);
  }

  // ─── Risk ────────────────────────────────────────────────────────────────────

  @Get(':id/risk')
  @RequirePermissions('job.view')
  getRisk(@Param('id', ParseUUIDPipe) id: string) {
    return this.riskSvc.getRisk(id);
  }

  @Put(':id/risk')
  @RequirePermissions('job.update')
  saveRisk(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRiskDto) {
    return this.riskSvc.saveRisk(id, dto);
  }

  // ─── Coverage ────────────────────────────────────────────────────────────────

  @Get(':id/coverages')
  @RequirePermissions('job.view')
  listCoverages(@Param('id', ParseUUIDPipe) id: string) {
    return this.coverageSvc.listCoverages(id);
  }

  @Post(':id/coverages')
  @RequirePermissions('job.update')
  addCoverage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateJobCoverageDto) {
    return this.coverageSvc.addCoverage(id, dto);
  }

  @Put(':id/coverages/:coverageId')
  @RequirePermissions('job.update')
  updateCoverage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('coverageId', ParseUUIDPipe) coverageId: string,
    @Body() dto: UpdateJobCoverageDto,
  ) {
    return this.coverageSvc.updateCoverage(id, coverageId, dto);
  }

  @Delete(':id/coverages/:coverageId')
  @RequirePermissions('job.update')
  @HttpCode(204)
  removeCoverage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('coverageId', ParseUUIDPipe) coverageId: string,
  ) {
    return this.coverageSvc.removeCoverage(id, coverageId);
  }
}

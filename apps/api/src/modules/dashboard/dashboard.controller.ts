import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('agent')
  @RequirePermissions('job.view')
  agent() {
    return this.service.agentDashboard();
  }

  @Get('manager')
  @RequirePermissions('report.view')
  manager() {
    return this.service.managerDashboard();
  }

  @Get('funnel')
  @RequirePermissions('report.view')
  funnel() {
    return this.service.funnel();
  }
}

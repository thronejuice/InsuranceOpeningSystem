import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { AuditService } from './audit.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'List audit logs with filters (requires audit.view)' })
  list(@Query() query: AuditLogQueryDto) {
    return this.auditService.findLogs(query);
  }
}


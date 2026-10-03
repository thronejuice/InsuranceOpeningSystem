import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { TaskService } from './task.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TaskQueryDto } from './dto/task-query.dto.js';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TaskController {
  constructor(private readonly service: TaskService) {}

  @Get('tasks')
  @RequirePermissions('task.view')
  list(@Query() query: TaskQueryDto) {
    return this.service.list(query);
  }

  @Get('jobs/:jobId/tasks')
  @RequirePermissions('task.view')
  listByJob(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.service.listByJob(jobId);
  }

  @Post('jobs/:jobId/tasks')
  @RequirePermissions('task.create')
  create(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.service.create(jobId, dto);
  }

  @Post('tasks/:id/complete')
  @RequirePermissions('task.update')
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.complete(id);
  }

  @Post('tasks/:id/cancel')
  @RequirePermissions('task.update')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(id);
  }
}

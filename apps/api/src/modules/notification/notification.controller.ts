import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { NotificationService } from './notification.service.js';
import { PaginationQueryDto } from '../../common/http/pagination.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/preference.dto.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get('notifications')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'List notifications for current user' })
  list(@Query() query: PaginationQueryDto) {
    return this.service.list(query.page, query.perPage);
  }

  @Get('notifications/unread-count')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount() {
    return this.service.unreadCount();
  }

  @Post('notifications/:id/read')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(id);
  }

  @Post('notifications/read-all')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead() {
    return this.service.markAllRead();
  }

  @Get('notifications/preferences')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  getPreferences() {
    return this.service.getPreferences();
  }

  @Put('notifications/preferences')
  @RequirePermissions('notification.view')
  @ApiOperation({ summary: 'Update notification preferences for current user' })
  updatePreferences(@Body() dto: UpdateNotificationPreferencesDto) {
    return this.service.updatePreferences(dto);
  }
}

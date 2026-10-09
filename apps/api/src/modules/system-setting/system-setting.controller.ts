import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { SystemSettingService } from './system-setting.service.js';
import { UpdateSettingDto } from './dto/update-setting.dto.js';

@ApiTags('system-settings')
@ApiBearerAuth()
@Controller('system-settings')
export class SystemSettingController {
  constructor(private readonly service: SystemSettingService) {}

  @Get()
  @RequirePermissions('master.manage')
  list() {
    return this.service.list();
  }

  @Put(':key')
  @RequirePermissions('master.manage')
  update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.service.update(key, dto.value);
  }
}

import { Module } from '@nestjs/common';
import { SystemSettingController } from './system-setting.controller.js';
import { SystemSettingService } from './system-setting.service.js';

@Module({
  controllers: [SystemSettingController],
  providers: [SystemSettingService],
  exports: [SystemSettingService],
})
export class SystemSettingModule {}

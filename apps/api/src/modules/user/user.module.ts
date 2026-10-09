import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';
import { SystemSettingModule } from '../system-setting/system-setting.module.js';

@Module({
  imports: [SystemSettingModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
})
export class UserModule {}

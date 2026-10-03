import { Module } from '@nestjs/common';
import { MasterController } from './master.controller.js';
import { MasterRepository } from './master.repository.js';
import { MasterService } from './master.service.js';

@Module({
  controllers: [MasterController],
  providers: [MasterService, MasterRepository],
  exports: [MasterService],
})
export class MasterModule {}

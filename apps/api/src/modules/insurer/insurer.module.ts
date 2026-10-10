import { Module } from '@nestjs/common';
import { InsurerController } from './insurer.controller.js';
import { InsurerService } from './insurer.service.js';

@Module({
  controllers: [InsurerController],
  providers: [InsurerService],
})
export class InsurerModule {}

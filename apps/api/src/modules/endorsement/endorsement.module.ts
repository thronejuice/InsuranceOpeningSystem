import { Module } from '@nestjs/common';
import { EndorsementRepository } from './endorsement.repository.js';
import { EndorsementService } from './endorsement.service.js';
import { EndorsementsListController, PolicyEndorsementController } from './endorsement.controller.js';

@Module({
  controllers: [EndorsementsListController, PolicyEndorsementController],
  providers: [EndorsementService, EndorsementRepository],
  exports: [EndorsementService, EndorsementRepository],
})
export class EndorsementModule {}


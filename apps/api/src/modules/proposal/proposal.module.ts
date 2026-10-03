import { Module } from '@nestjs/common';
import { ProposalController } from './proposal.controller.js';
import { ProposalService } from './proposal.service.js';
import { ProposalRepository } from './proposal.repository.js';

@Module({
  controllers: [ProposalController],
  providers: [ProposalService, ProposalRepository],
  exports: [ProposalService],
})
export class ProposalModule {}

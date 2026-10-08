import { Module } from '@nestjs/common';
import { ProposalController } from './proposal.controller.js';
import { ProposalService } from './proposal.service.js';
import { ProposalRepository } from './proposal.repository.js';
import { ProposalDocumentService } from './proposal-document.service.js';
import { CompanyProfileModule } from '../company-profile/company-profile.module.js';

import { JobModule } from '../job/job.module.js';

@Module({
  imports: [JobModule, CompanyProfileModule],
  controllers: [ProposalController],
  providers: [ProposalService, ProposalRepository, ProposalDocumentService],
  exports: [ProposalService],
})
export class ProposalModule {}

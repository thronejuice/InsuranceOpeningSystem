import { Module, forwardRef } from '@nestjs/common';
import { UnderwritingController } from './underwriting.controller.js';
import { UnderwritingService } from './underwriting.service.js';
import { UnderwritingRepository } from './underwriting.repository.js';
import { JobModule } from '../job/job.module.js';
import { DocumentModule } from '../document/document.module.js';
import { NotificationModule } from '../notification/notification.module.js';

@Module({
  imports: [
    forwardRef(() => JobModule),
    forwardRef(() => DocumentModule),
    NotificationModule,
  ],
  controllers: [UnderwritingController],
  providers: [UnderwritingService, UnderwritingRepository],
  exports: [UnderwritingService],
})
export class UnderwritingModule {}


import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { NotificationRepository } from './notification.repository.js';
import { EmailService } from './email.service.js';
import { NotificationProcessor, NOTIFICATION_QUEUE } from './notification.processor.js';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    EmailService,
    NotificationProcessor,
  ],
  exports: [NotificationService, EmailService],
})
export class NotificationModule {}

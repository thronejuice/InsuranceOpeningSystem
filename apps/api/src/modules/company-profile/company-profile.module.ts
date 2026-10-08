import { Module } from '@nestjs/common';
import { CompanyProfileController } from './company-profile.controller.js';
import { CompanyProfileService } from './company-profile.service.js';

@Module({
  controllers: [CompanyProfileController],
  providers: [CompanyProfileService],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}

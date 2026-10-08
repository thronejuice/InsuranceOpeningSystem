import {
  Body, Controller, Delete, Get, Post, Put, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/auth/auth.decorators.js';
import { BusinessException } from '../../common/errors/business.exception.js';
import { CompanyProfileService } from './company-profile.service.js';
import { CompanyProfileResponse, UpdateCompanyProfileDto } from './dto/company-profile.dto.js';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings/company')
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Get()
  @RequirePermissions()
  get(): Promise<CompanyProfileResponse> {
    return this.service.get();
  }

  @Put()
  @RequirePermissions('master.manage')
  update(@Body() dto: UpdateCompanyProfileDto): Promise<CompanyProfileResponse> {
    return this.service.update(dto);
  }

  @Get('logo')
  @RequirePermissions()
  async logo(@Res() res: Response) {
    const logo = await this.service.readLogo();
    if (!logo) throw new BusinessException('LOGO_NOT_FOUND', 'No logo uploaded', 404);
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Content-Length', logo.buffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(logo.buffer);
  }

  @Post('logo')
  @RequirePermissions('master.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadLogo(@UploadedFile() file: Express.Multer.File): Promise<CompanyProfileResponse> {
    if (!file) throw new BusinessException('INVALID_FILE', 'No file uploaded', 422);
    return this.service.uploadLogo(file);
  }

  @Delete('logo')
  @RequirePermissions('master.manage')
  removeLogo(): Promise<CompanyProfileResponse> {
    return this.service.removeLogo();
  }
}

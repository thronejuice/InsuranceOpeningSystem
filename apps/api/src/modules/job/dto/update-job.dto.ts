import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { JobPriority } from '../../../generated/prisma/enums.js';

export class UpdateJobDto {
  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { JobPriority } from '../../../generated/prisma/enums.js';

export class CreateJobDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  insuranceTypeId!: string;

  @IsUUID()
  productId!: string;

  @IsUUID()
  agentId!: string;

  @IsUUID()
  @IsOptional()
  brokerStaffId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  effectiveDate!: string;

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

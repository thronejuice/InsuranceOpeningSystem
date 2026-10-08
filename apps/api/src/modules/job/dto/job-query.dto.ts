import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { JobPriority, JobStatus } from '../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

export class JobQueryDto extends PaginationQueryDto {
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @IsUUID()
  @IsOptional()
  agentId?: string;

  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  insuranceTypeId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;

  @IsDateString()
  @IsOptional()
  effectiveDateFrom?: string;

  @IsDateString()
  @IsOptional()
  effectiveDateTo?: string;
}

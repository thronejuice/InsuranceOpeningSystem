import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

export enum PolicyStatusFilter {
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  RENEWED = 'RENEWED',
}

export class ListPolicyDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  insuranceCompanyId?: string;

  @IsEnum(PolicyStatusFilter)
  @IsOptional()
  status?: PolicyStatusFilter;

  @IsUUID()
  @IsOptional()
  jobId?: string;
}

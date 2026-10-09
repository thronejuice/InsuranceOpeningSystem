import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

export enum PolicyStatusFilter {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  ACTIVE = 'ACTIVE',
  EXPIRING = 'EXPIRING',
  EXPIRED = 'EXPIRED',
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
  CANCELLED = 'CANCELLED',
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

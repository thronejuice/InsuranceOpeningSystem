import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

enum CommissionStatusFilter {
  PENDING = 'PENDING',
  CALCULATED = 'CALCULATED',
  APPROVED = 'APPROVED',
  PAYABLE = 'PAYABLE',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export class CommissionQueryDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  agentId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsEnum(CommissionStatusFilter)
  @IsOptional()
  status?: CommissionStatusFilter;

  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @IsDateString()
  @IsOptional()
  toDate?: string;
}

import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

enum CommissionStatusFilter {
  PENDING = 'PENDING',
  CALCULATED = 'CALCULATED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export class CommissionQueryDto extends PaginationQueryDto {
  @IsString()
  @IsOptional()
  agentId?: string;

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

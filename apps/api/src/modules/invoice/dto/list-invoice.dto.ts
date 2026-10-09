import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { InvoiceStatus, InvoiceType } from '../../../generated/prisma/enums.js';

export class ListInvoiceDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType;

  @IsDateString()
  @IsOptional()
  dueBefore?: string;

  @IsDateString()
  @IsOptional()
  dueAfter?: string;
}


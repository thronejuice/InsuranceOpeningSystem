import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { ReceiptStatus } from '../../../generated/prisma/enums.js';

export class ListReceiptDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  invoiceId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsEnum(ReceiptStatus)
  @IsOptional()
  status?: ReceiptStatus;
}

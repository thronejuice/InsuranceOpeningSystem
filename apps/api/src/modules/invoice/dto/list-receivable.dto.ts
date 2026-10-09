import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';

export class ListReceivableDto extends PaginationQueryDto {
  @IsIn(['customer', 'policy'])
  @IsOptional()
  groupBy?: 'customer' | 'policy';

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;
}

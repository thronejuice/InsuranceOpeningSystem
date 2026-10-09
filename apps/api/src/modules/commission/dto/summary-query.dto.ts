import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { CommissionStatus } from '../../../generated/prisma/enums.js';

export class CommissionSummaryQueryDto extends PaginationQueryDto {
  @IsIn(['agent', 'policy', 'insurer', 'period', 'product'])
  @IsOptional()
  groupBy?: 'agent' | 'policy' | 'insurer' | 'period' | 'product';

  @IsUUID() @IsOptional() agentId?: string;
  @IsUUID() @IsOptional() insurerId?: string;
  @IsUUID() @IsOptional() productId?: string;
  @IsEnum(CommissionStatus) @IsOptional() status?: CommissionStatus;

  /** Policy issue month, inclusive ('YYYY-MM'). */
  @IsString() @IsOptional() @Matches(/^\d{4}-\d{2}$/) from?: string;
  @IsString() @IsOptional() @Matches(/^\d{4}-\d{2}$/) to?: string;
}

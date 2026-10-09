import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { CommissionAdjustmentStatus } from '../../../generated/prisma/enums.js';

export const ADJUSTMENT_REF_TYPES = ['ENDORSEMENT', 'CANCELLATION'] as const;

export class CreateAdjustmentDto {
  @ApiProperty({ example: '-500.00', description: 'Signed amount before WHT; negative reduces the payout' })
  @IsString()
  @MaxLength(20)
  amount!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ enum: ADJUSTMENT_REF_TYPES })
  @IsOptional()
  @IsIn(ADJUSTMENT_REF_TYPES)
  refType?: (typeof ADJUSTMENT_REF_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  refId?: string;
}

export class ListAdjustmentDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() agentId?: string;
  @IsUUID() @IsOptional() policyId?: string;
  @IsUUID() @IsOptional() commissionId?: string;
  @IsEnum(CommissionAdjustmentStatus) @IsOptional() status?: CommissionAdjustmentStatus;
}

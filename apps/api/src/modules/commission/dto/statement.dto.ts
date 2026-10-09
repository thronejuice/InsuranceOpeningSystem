import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { CommissionStatementStatus } from '../../../generated/prisma/enums.js';

export class CreateStatementDto {
  @ApiProperty({ description: 'The payee (agent or manager) the statement is for' })
  @IsUUID()
  agentId!: string;

  @ApiProperty({ example: '2026-10', description: 'Month (Asia/Bangkok) — everything payable by its end is included' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' })
  period!: string;
}

export class MarkStatementPaidDto {
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Defaults to today; cannot be in the future' })
  @IsOptional()
  @IsDateString()
  paidDate?: string;

  @ApiPropertyOptional({ description: 'Bank transfer reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;
}

export class CancelStatementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ListStatementDto extends PaginationQueryDto {
  @IsUUID() @IsOptional() agentId?: string;
  @IsEnum(CommissionStatementStatus) @IsOptional() status?: CommissionStatementStatus;
  @IsString() @IsOptional() @Matches(/^\d{4}-\d{2}$/) period?: string;
}

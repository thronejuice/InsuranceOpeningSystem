import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CalculateCancellationRefundDto {
  @ApiProperty({ description: 'Effective cancellation date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  cancelEffectiveDate!: string;

  @ApiPropertyOptional({ enum: ['PRO_RATA', 'SHORT_RATE'], default: 'SHORT_RATE' })
  @IsOptional()
  @IsEnum(['PRO_RATA', 'SHORT_RATE'])
  method?: 'PRO_RATA' | 'SHORT_RATE';
}

export class RequestCancellationDto {
  @ApiProperty({ description: 'Reason for cancellation' })
  @IsNotEmpty()
  @IsString()
  cancelReason!: string;

  @ApiProperty({ description: 'Cancellation request date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  cancelRequestDate!: string;

  @ApiProperty({ description: 'Effective cancellation date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  cancelEffectiveDate!: string;

  @ApiPropertyOptional({ description: 'Calculated or agreed refund amount (gross/total)' })
  @IsOptional()
  @IsNumberString()
  cancelRefundAmount?: string;

  @ApiPropertyOptional({ description: 'Outstanding amount currently unpaid' })
  @IsOptional()
  @IsNumberString()
  cancelOutstandingAmount?: string;
}

export class ApproveCancellationDto {
  @ApiProperty({ description: 'Insurer cancellation confirmation document UUID' })
  @IsNotEmpty()
  @IsUUID()
  cancelInsurerDocumentId!: string;

  @ApiPropertyOptional({ description: 'Optional approval remark' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class RejectCancellationDto {
  @ApiProperty({ description: 'Reason for rejecting cancellation request' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}


import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaymentMethod, RefundStatus } from '../../../generated/prisma/enums.js';

export class CreateRefundDto {
  @ApiProperty({ description: 'Credit Note Invoice UUID' })
  @IsNotEmpty()
  @IsUUID()
  creditNoteId!: string;

  @ApiProperty({ description: 'Refund amount' })
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @ApiPropertyOptional({ description: 'Reason for refund' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectRefundDto {
  @ApiProperty({ description: 'Reason for rejecting refund' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

export class ProcessRefundDto {
  @ApiProperty({ enum: PaymentMethod, description: 'Payment method used for refund' })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Bank name' })
  @IsOptional()
  @IsString()
  bank?: string;

  @ApiPropertyOptional({ description: 'Reference number / transfer slip no.' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ description: 'Attachment Document UUID (payment slip/receipt)' })
  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}

export class ListRefundQueryDto {
  @ApiPropertyOptional({ enum: RefundStatus })
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  policyId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  perPage?: number;
}

import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client.js';

export class CreatePaymentDto {
  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amount must be a positive decimal string' })
  amount!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  bank?: string;

  /** Bank transaction / cheque / slip reference. */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  referenceNo?: string;

  /** An already-uploaded Document (e.g. the transfer slip) belonging to the policy's job. */
  @IsUUID()
  @IsOptional()
  attachmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

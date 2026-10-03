import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
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
  referenceNo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

import { IsDateString, IsDecimal, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateQuotationDto {
  @IsUUID()
  insuranceCompanyId!: string;

  @IsDateString()
  @IsOptional()
  quotationDate?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  /** Gross premium before discount */
  @IsDecimal({ decimal_digits: '0,2' })
  grossPremium!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  discount?: string;

  /** Override auto-calc stamp duty */
  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  stampDuty?: string;

  /** Override auto-calc VAT */
  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  tax?: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

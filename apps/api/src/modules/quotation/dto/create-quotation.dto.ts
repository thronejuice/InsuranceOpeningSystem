import {
  IsArray,
  IsDateString,
  IsDecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuotationItemDto } from './update-quotation.dto.js';

export class CreateQuotationDto {
  @IsUUID()
  @IsNotEmpty()
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

  /** Commission rate percentage e.g. 12.0000 (defaults from Master CommissionRate if omitted) */
  @IsDecimal({ decimal_digits: '0,4' })
  @IsOptional()
  commissionRate?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  commissionAmount?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  deductible?: string;

  @IsString()
  @IsOptional()
  exclusion?: string;

  @IsString()
  @IsOptional()
  specialCondition?: string;

  @IsString()
  @IsOptional()
  insurerReference?: string;

  @IsString()
  @IsOptional()
  underwriter?: string;

  @IsString()
  @IsOptional()
  attachment?: string;

  @IsString()
  @IsOptional()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  @IsOptional()
  items?: QuotationItemDto[];
}

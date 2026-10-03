import { IsArray, IsDateString, IsDecimal, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuotationItemDto {
  @IsUUID()
  @IsOptional()
  coverageId?: string;

  @IsString()
  coverageName!: string;

  @IsDecimal({ decimal_digits: '0,2' })
  sumInsured!: string;

  @IsDecimal({ decimal_digits: '0,6' })
  @IsOptional()
  rate?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  deductible?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  premium!: string;

  @IsString()
  @IsOptional()
  remark?: string;
}

export class UpdateQuotationDto {
  @IsDateString()
  @IsOptional()
  quotationDate?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  grossPremium?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  discount?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  stampDuty?: string;

  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  tax?: string;

  @IsString()
  @IsOptional()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  @IsOptional()
  items?: QuotationItemDto[];
}

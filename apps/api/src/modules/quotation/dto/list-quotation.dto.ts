import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListQuotationDto {
  @IsOptional() @IsUUID() insuranceCompanyId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() validUntilFrom?: string;
  @IsOptional() @IsString() validUntilTo?: string;
}

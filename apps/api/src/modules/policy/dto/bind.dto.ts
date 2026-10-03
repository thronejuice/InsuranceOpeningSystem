import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BindDto {
  @IsDateString()
  @IsOptional()
  bindingDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

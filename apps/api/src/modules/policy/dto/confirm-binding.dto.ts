import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ConfirmBindingDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  binderNumber?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  binderDate?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  insurerId?: string;

  @ApiPropertyOptional()
  @IsNumberString()
  @IsOptional()
  premium?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  paymentCondition?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  underwriter?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  binderDocumentId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}


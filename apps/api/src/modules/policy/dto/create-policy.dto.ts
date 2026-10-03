import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePolicyDto {
  @IsDateString()
  @IsOptional()
  paymentDueDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePolicyDto {
  @IsDateString()
  @IsOptional()
  paymentDueDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

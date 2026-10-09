import { IsDateString, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePolicyDto {
  @IsDateString()
  @IsOptional()
  paymentDueDate?: string;

  @IsNumberString()
  @IsOptional()
  sumInsured?: string;

  @IsNumberString()
  @IsOptional()
  deductible?: string;

  @IsUUID()
  @IsOptional()
  policyDocumentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}


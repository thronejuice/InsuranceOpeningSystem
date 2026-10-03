import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export enum CommissionType {
  COMPANY = 'COMPANY',
  AGENT = 'AGENT',
  TEAM = 'TEAM',
  REFERRAL = 'REFERRAL',
  OTHER = 'OTHER',
}

export class CreateCommissionDto {
  @IsEnum(CommissionType)
  commissionType!: CommissionType;

  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'commissionRate must be a positive decimal (up to 4 decimal places)' })
  commissionRate!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'commissionBase must be a positive decimal' })
  commissionBase!: string;

  @IsDateString()
  @IsOptional()
  paidDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  remark?: string;
}

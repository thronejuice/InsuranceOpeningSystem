import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum PolicyStatusFilter {
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  RENEWED = 'RENEWED',
}

export class ListPolicyDto {
  @IsUUID()
  @IsOptional()
  insuranceCompanyId?: string;

  @IsEnum(PolicyStatusFilter)
  @IsOptional()
  status?: PolicyStatusFilter;

  @IsUUID()
  @IsOptional()
  jobId?: string;
}

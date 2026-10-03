import { IsEnum, IsOptional } from 'class-validator';

export enum ApprovalStatusFilter {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ListApprovalDto {
  @IsEnum(ApprovalStatusFilter)
  @IsOptional()
  status?: ApprovalStatusFilter;
}

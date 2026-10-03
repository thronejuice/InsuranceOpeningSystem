import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ProposalRejectReasonDto {
  PRICE = 'PRICE',
  COVERAGE = 'COVERAGE',
  COMPETITOR = 'COMPETITOR',
  CUSTOMER_CANCELLED = 'CUSTOMER_CANCELLED',
  NO_RESPONSE = 'NO_RESPONSE',
  OTHER = 'OTHER',
}

export class RejectProposalDto {
  @IsEnum(ProposalRejectReasonDto) rejectReason!: ProposalRejectReasonDto;
  @IsOptional() @IsString() remark?: string;
}

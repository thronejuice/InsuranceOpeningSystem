import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateProposalDto {
  @IsOptional() @IsDateString() proposalDate?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() remark?: string;
}

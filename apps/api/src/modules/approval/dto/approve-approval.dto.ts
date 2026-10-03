import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveApprovalDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProposalDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() proposalDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() quotationVersionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() paymentTermId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverageSummary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() conditions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
}


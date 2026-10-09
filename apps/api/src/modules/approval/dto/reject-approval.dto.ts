import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectApprovalDto {
  @ApiPropertyOptional({ description: 'Legacy reason field' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Reject reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;

  @ApiPropertyOptional({ description: 'Additional comment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

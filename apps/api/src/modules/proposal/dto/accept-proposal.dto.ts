import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum AcceptanceMethodDto {
  EMAIL = 'EMAIL',
  SIGNED_DOCUMENT = 'SIGNED_DOCUMENT',
  LINE = 'LINE',
  MANUAL = 'MANUAL',
}

export class AcceptProposalDto {
  @ApiPropertyOptional({
    enum: AcceptanceMethodDto,
    description: 'Acceptance channel/method',
    default: AcceptanceMethodDto.EMAIL,
  })
  @IsOptional()
  @IsEnum(AcceptanceMethodDto)
  method?: AcceptanceMethodDto;

  @ApiPropertyOptional({
    description: 'Name of the customer or representative who accepted',
  })
  @IsOptional()
  @IsString()
  acceptedByName?: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp when customer gave acceptance',
  })
  @IsOptional()
  @IsString()
  acceptedAt?: string;

  @ApiPropertyOptional({
    description: 'Remark or reason (required for MANUAL method)',
  })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    description: 'Optional ID of pre-uploaded document to use as evidence',
  })
  @IsOptional()
  @IsUUID()
  evidenceFileId?: string;
}


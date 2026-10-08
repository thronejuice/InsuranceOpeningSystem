import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { UnderwritingStatus } from '../../../generated/prisma/enums.js';

/** D-3: Underwriter picks a risk level manually; no rule engine. */
export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export class RequestUnderwritingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewUnderwritingDto {
  @ApiProperty({ enum: UnderwritingStatus })
  @IsEnum(UnderwritingStatus)
  status!: UnderwritingStatus;

  @ApiPropertyOptional({ enum: RISK_LEVELS })
  @IsOptional()
  @IsIn(RISK_LEVELS)
  riskLevel?: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  riskScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  exclusion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deductible?: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiredSurvey?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  requiredDocuments?: string[];
}

export interface UnderwritingUserSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface UnderwritingResponse {
  id: string;
  jobId: string;
  version: number;
  status: UnderwritingStatus | string;
  riskLevel: string | null;
  riskScore: number | null;
  requestedById: string | null;
  requestedBy: UnderwritingUserSummary | null;
  requestedAt: string;
  underwriterId: string | null;
  underwriter: UnderwritingUserSummary | null;
  reviewedAt: string | null;
  reason: string | null;
  condition: string | null;
  exclusion: string | null;
  deductible: string | null;
  requiredSurvey: boolean;
  requiredDocuments: string[] | null;
  createdAt: string;
  updatedAt: string;
}


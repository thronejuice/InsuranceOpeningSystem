import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateJobCoverageDto {
  @ApiProperty() @IsUUID() coverageId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
}

export class UpdateJobCoverageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() sumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deductible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remark?: string;
}

export interface JobCoverageResponse {
  id: string;
  jobId: string;
  coverageId: string;
  coverageCode: string;
  coverageName: string;
  sumInsured: string | null;
  deductible: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

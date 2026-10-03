import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { RenewalStatus } from '../../../generated/prisma/enums.js';

export class RenewalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RenewalStatus })
  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

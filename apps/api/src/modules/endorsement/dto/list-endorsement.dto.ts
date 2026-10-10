import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto.js';
import { EndorsementStatus, EndorsementType } from '../../../generated/prisma/enums.js';

export class ListEndorsementDto extends PaginationQueryDto {
  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsEnum(EndorsementStatus)
  @IsOptional()
  status?: EndorsementStatus;

  @IsEnum(EndorsementType)
  @IsOptional()
  type?: EndorsementType;
}


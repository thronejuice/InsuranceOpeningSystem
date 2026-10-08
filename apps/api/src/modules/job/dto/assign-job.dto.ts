import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AssignmentRole } from '../../../generated/prisma/enums.js';

export class AssignJobDto {
  @IsUUID()
  @IsOptional()
  assigneeId?: string | null;

  @IsEnum(AssignmentRole)
  @IsOptional()
  role?: AssignmentRole;

  @IsString()
  @IsOptional()
  reason?: string;
}

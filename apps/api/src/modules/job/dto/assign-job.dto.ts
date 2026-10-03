import { IsOptional, IsUUID } from 'class-validator';

export class AssignJobDto {
  @IsUUID()
  @IsOptional()
  assigneeId?: string | null;
}

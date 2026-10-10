import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TaskType, TaskPriority } from '../../../generated/prisma/enums.js';

export { TaskType, TaskPriority };

export class CreateTaskDto {
  @IsUUID()
  @IsOptional()
  jobId?: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsEnum(TaskType)
  taskType!: TaskType;

  @IsString()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;
}

import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum TaskType {
  CALL_CUSTOMER = 'CALL_CUSTOMER',
  REQUEST_DOCUMENT = 'REQUEST_DOCUMENT',
  REQUEST_QUOTATION = 'REQUEST_QUOTATION',
  FOLLOW_UP_QUOTATION = 'FOLLOW_UP_QUOTATION',
  SEND_PROPOSAL = 'SEND_PROPOSAL',
  FOLLOW_UP_CUSTOMER = 'FOLLOW_UP_CUSTOMER',
  FOLLOW_UP_PAYMENT = 'FOLLOW_UP_PAYMENT',
  FOLLOW_UP_POLICY = 'FOLLOW_UP_POLICY',
  RENEWAL = 'RENEWAL',
  OTHER = 'OTHER',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class CreateTaskDto {
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

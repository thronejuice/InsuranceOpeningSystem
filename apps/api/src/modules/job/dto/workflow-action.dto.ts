import { IsOptional, IsString } from 'class-validator';

export class WorkflowActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

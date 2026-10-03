import { IsNotEmpty, IsString } from 'class-validator';

export class CancelJobDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

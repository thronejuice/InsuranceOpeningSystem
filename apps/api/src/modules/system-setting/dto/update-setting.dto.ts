import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateSettingDto {
  @ApiProperty({ example: '3', description: 'Percent, 0–100, up to 2 decimal places' })
  @IsString()
  @MaxLength(10)
  value!: string;
}

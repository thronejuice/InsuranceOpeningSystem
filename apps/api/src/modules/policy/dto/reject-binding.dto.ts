import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectBindingDto {
  @ApiProperty({ description: 'Reason for rejection by insurer' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}


import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class SelectQuotationDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsInt()
  @IsPositive()
  version!: number;
}

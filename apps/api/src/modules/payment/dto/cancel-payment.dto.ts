import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  cancelReason!: string;
}

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string = '';
}

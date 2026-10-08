import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** Both optional: omitted dates default to previous expiry + same term (see domain/renewal-dates.ts). */
export class RenewPolicyDto {
  @ApiPropertyOptional({ example: '2027-10-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  effectiveDate?: string;

  @ApiPropertyOptional({ example: '2028-10-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string;
}

import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { EndorsementType, PremiumAdjustmentType } from '../../../generated/prisma/enums.js';

/** Money is a decimal string ("1000.00"); a bare number from an older client is accepted and normalised to 2 dp. */
const toMoneyString = ({ value }: { value: unknown }) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : value);
const MONEY = /^\d+(\.\d{1,2})?$/;
const MONEY_MESSAGE = 'must be a non-negative decimal string with at most 2 decimals';

export class CreateEndorsementDto {
  @IsEnum(EndorsementType)
  type!: EndorsementType;

  @IsDateString()
  effectiveDate!: string;

  @IsObject()
  changes!: {
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  };

  @IsEnum(PremiumAdjustmentType)
  @IsOptional()
  premiumAdjustmentType?: PremiumAdjustmentType;

  @Transform(toMoneyString)
  @Matches(MONEY, { message: `netAdjustment ${MONEY_MESSAGE}` })
  @IsOptional()
  netAdjustment?: string;

  @Transform(toMoneyString)
  @Matches(MONEY, { message: `stampDuty ${MONEY_MESSAGE}` })
  @IsOptional()
  stampDuty?: string;

  @Transform(toMoneyString)
  @Matches(MONEY, { message: `vat ${MONEY_MESSAGE}` })
  @IsOptional()
  vat?: string;

  @Transform(toMoneyString)
  @Matches(MONEY, { message: `totalAdjustment ${MONEY_MESSAGE}` })
  @IsOptional()
  totalAdjustment?: string;

  @IsString()
  @IsOptional()
  remark?: string;

  @IsUUID()
  @IsOptional()
  insurerDocumentId?: string;
}

export class CalculateProRataDto {
  @IsDateString()
  endorsementDate!: string;

  /** Annual net premium the change applies to; defaults to the policy's own net premium. */
  @Transform(toMoneyString)
  @Matches(MONEY, { message: `annualNetPremium ${MONEY_MESSAGE}` })
  @IsOptional()
  annualNetPremium?: string;
}


import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class SaveRiskDto {
  @ApiProperty({
    description: 'Map of fieldCode → value (string). All values must be strings regardless of field type.',
    example: { plate_number: 'กก-1234', vehicle_year: '2022', has_modification: 'false' },
  })
  @IsObject()
  @IsOptional()
  values?: Record<string, string | null>;
}

export interface RiskFieldDefResponse {
  id: string;
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  isRequired: boolean;
  validationRule: string | null;
  sortOrder: number;
}

export interface JobRiskResponse {
  jobId: string;
  fieldDefs: RiskFieldDefResponse[];
  values: Record<string, string | null>;
}

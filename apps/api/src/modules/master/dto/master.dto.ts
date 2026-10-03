import {
  IsBoolean,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ApprovalConditionField,
  ApprovalConditionOperator,
  ApprovalRoleTarget,
  CompanyStatus,
  DocumentType,
  RiskFieldType,
} from '../../../generated/prisma/enums.js';

// ─── Insurance Type ──────────────────────────────────────────────────────────

export class CreateInsuranceTypeDto {
  @ApiProperty() @IsString() @MaxLength(50) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateInsuranceTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Insurance Product ───────────────────────────────────────────────────────

export class CreateInsuranceProductDto {
  @ApiProperty() @IsString() @MaxLength(50) insuranceTypeId!: string;
  @ApiProperty() @IsString() @MaxLength(50) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireDocsOnSubmit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireDocsOnBind?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateInsuranceProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireDocsOnSubmit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireDocsOnBind?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Insurance Company ───────────────────────────────────────────────────────

export class CreateInsuranceCompanyDto {
  @ApiProperty() @IsString() @MaxLength(50) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional({ enum: CompanyStatus }) @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
}

export class UpdateInsuranceCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional({ enum: CompanyStatus }) @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
}

// ─── Insurance Coverage ──────────────────────────────────────────────────────

export class CreateInsuranceCoverageDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsString() @MaxLength(50) code!: string;
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDecimal() defaultSumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateInsuranceCoverageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDecimal() defaultSumInsured?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Risk Field Definition ───────────────────────────────────────────────────

export class CreateRiskFieldDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @IsString() @MaxLength(50) fieldCode!: string;
  @ApiProperty() @IsString() @MaxLength(200) fieldName!: string;
  @ApiProperty({ enum: RiskFieldType }) @IsEnum(RiskFieldType) fieldType!: RiskFieldType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) validationRule?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateRiskFieldDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fieldName?: string;
  @ApiPropertyOptional({ enum: RiskFieldType }) @IsOptional() @IsEnum(RiskFieldType) fieldType?: RiskFieldType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) validationRule?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Document Checklist ──────────────────────────────────────────────────────

export class CreateDocumentChecklistDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ enum: DocumentType }) @IsEnum(DocumentType) documentType!: DocumentType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateDocumentChecklistDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Approval Rule ───────────────────────────────────────────────────────────

export class CreateApprovalRuleDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ enum: ApprovalConditionField }) @IsEnum(ApprovalConditionField) conditionField!: ApprovalConditionField;
  @ApiProperty({ enum: ApprovalConditionOperator }) @IsEnum(ApprovalConditionOperator) conditionOperator!: ApprovalConditionOperator;
  @ApiProperty() @IsDecimal() thresholdValue!: string;
  @ApiProperty({ enum: ApprovalRoleTarget }) @IsEnum(ApprovalRoleTarget) approverRole!: ApprovalRoleTarget;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateApprovalRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ enum: ApprovalConditionField }) @IsOptional() @IsEnum(ApprovalConditionField) conditionField?: ApprovalConditionField;
  @ApiPropertyOptional({ enum: ApprovalConditionOperator }) @IsOptional() @IsEnum(ApprovalConditionOperator) conditionOperator?: ApprovalConditionOperator;
  @ApiPropertyOptional() @IsOptional() @IsDecimal() thresholdValue?: string;
  @ApiPropertyOptional({ enum: ApprovalRoleTarget }) @IsOptional() @IsEnum(ApprovalRoleTarget) approverRole?: ApprovalRoleTarget;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

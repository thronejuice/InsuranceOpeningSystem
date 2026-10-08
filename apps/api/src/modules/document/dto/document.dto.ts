import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { DocumentStatus } from '../../../generated/prisma/enums.js';

// DocumentType enum values (must stay in sync with Prisma schema)
export enum DocumentTypeEnum {
  ID_CARD = 'ID_CARD',
  COMPANY_REGISTRATION = 'COMPANY_REGISTRATION',
  TAX_DOCUMENT = 'TAX_DOCUMENT',
  VEHICLE_BOOK = 'VEHICLE_BOOK',
  PREVIOUS_POLICY = 'PREVIOUS_POLICY',
  VEHICLE_PHOTO = 'VEHICLE_PHOTO',
  RISK_SURVEY = 'RISK_SURVEY',
  QUOTATION = 'QUOTATION',
  PROPOSAL = 'PROPOSAL',
  POLICY = 'POLICY',
  INVOICE = 'INVOICE',
  RECEIPT = 'RECEIPT',
  OTHER = 'OTHER',
}

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentTypeEnum })
  @IsEnum(DocumentTypeEnum)
  documentType!: DocumentTypeEnum;

  @ApiPropertyOptional({ description: 'Optional expiry date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class VerifyDocumentDto {
  @ApiPropertyOptional({ description: 'Optional document expiry date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Verification remark' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class RejectDocumentDto {
  @ApiProperty({ description: 'Rejection reason (required)' })
  @IsString()
  @IsNotEmpty({ message: 'Rejection reason is required' })
  reason!: string;
}

export interface DocumentUserSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface DocumentResponse {
  id: string;
  jobId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  version: number;
  status: DocumentStatus | string;
  uploadedById: string | null;
  uploadedBy?: DocumentUserSummary | null;
  verifiedById?: string | null;
  verifiedBy?: DocumentUserSummary | null;
  verifiedAt?: string | null;
  expiryDate?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChecklistUploadedItem {
  documentType: string;
  documentId: string;
  originalName: string;
  version: number;
  status: string;
  expiryDate: string | null;
}

export interface DocumentChecklistResponse {
  isComplete: boolean;
  required: { documentType: string; isRequired: boolean }[];
  uploaded: DocumentChecklistUploadedItem[];
  missing: string[];
}

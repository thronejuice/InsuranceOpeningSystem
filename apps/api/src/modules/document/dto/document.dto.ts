import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

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
}

export interface DocumentResponse {
  id: string;
  jobId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  version: number;
  status: string;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChecklistResponse {
  required: { documentType: string; isRequired: boolean }[];
  uploaded: { documentType: string; documentId: string; originalName: string }[];
  missing: string[];
}

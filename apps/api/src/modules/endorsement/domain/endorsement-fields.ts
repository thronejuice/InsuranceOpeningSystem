import { EndorsementType } from '../../../generated/prisma/enums.js';

export interface EndorsementFieldRule {
  allowedFields: string[];
  description: string;
}

export const ENDORSEMENT_FIELD_RULES: Record<EndorsementType, EndorsementFieldRule> = {
  [EndorsementType.CHANGE_CUSTOMER]: {
    allowedFields: ['firstName', 'lastName', 'companyName', 'taxId', 'citizenId', 'phone', 'email'],
    description: 'แก้ไขข้อมูลผู้เอาประกันภัย (ชื่อ-นามสกุล, เลขประจำตัวผู้เสียภาษี, เบอร์โทร, อีเมล)',
  },
  [EndorsementType.CHANGE_ADDRESS]: {
    allowedFields: ['addressLine1', 'subdistrict', 'district', 'province', 'postalCode'],
    description: 'แก้ไขที่อยู่ผู้เอาประกันภัยหรือสถานที่เอาประกันภัย',
  },
  [EndorsementType.CHANGE_COVERAGE]: {
    allowedFields: ['coverages', 'deductible', 'remark'],
    description: 'เพิ่ม/ลดความคุ้มครอง หรือเปลี่ยนค่าเสียหายส่วนแรก',
  },
  [EndorsementType.CHANGE_SUM_INSURED]: {
    allowedFields: ['sumInsured', 'coverages'],
    description: 'เพิ่มหรือลดจำนวนเงินเอาประกันภัย (ทุนประกันภัย)',
  },
  [EndorsementType.ADD_ASSET]: {
    allowedFields: ['assets', 'sumInsured', 'coverages'],
    description: 'เพิ่มทรัพย์สินที่เอาประกันภัย',
  },
  [EndorsementType.REMOVE_ASSET]: {
    allowedFields: ['removedAssetIds', 'sumInsured', 'coverages'],
    description: 'ลดทรัพย์สินที่เอาประกันภัย',
  },
  [EndorsementType.CHANGE_VEHICLE]: {
    allowedFields: ['licensePlate', 'chassisNo', 'engineNo', 'vehicleModel', 'vehicleYear'],
    description: 'แก้ไขข้อมูลรถยนต์ (เลขทะเบียน, เลขตัวถัง, ยี่ห้อ, รุ่น)',
  },
  [EndorsementType.CHANGE_EFFECTIVE_DATE]: {
    allowedFields: ['effectiveDate', 'expiryDate'],
    description: 'แก้ไขวันเริ่มต้นหรือสิ้นสุดความคุ้มครอง',
  },
  [EndorsementType.OTHER]: {
    allowedFields: ['remark', 'details', 'customFields'],
    description: 'สลักหลังอื่นๆ นอกเหนือจากประเภทที่กำหนด',
  },
};

export interface EndorsementChangesInput {
  before?: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates changes object against allowed fields for the endorsement type.
 */
export function validateEndorsementChanges(
  type: EndorsementType,
  changes: EndorsementChangesInput,
): ValidationResult {
  const rule = ENDORSEMENT_FIELD_RULES[type];
  if (!rule) {
    return { valid: false, errors: [`Unknown endorsement type: ${type}`] };
  }

  if (!changes || typeof changes !== 'object' || !changes.after || typeof changes.after !== 'object') {
    return { valid: false, errors: ['Changes must contain an "after" object'] };
  }

  const modifiedKeys = Object.keys(changes.after);
  if (modifiedKeys.length === 0) {
    return { valid: false, errors: ['At least one field must be modified in "after"'] };
  }

  const invalidKeys = modifiedKeys.filter((key) => !rule.allowedFields.includes(key));
  if (invalidKeys.length > 0) {
    return {
      valid: false,
      errors: [
        `Fields not allowed for ${type}: [${invalidKeys.join(', ')}]. Allowed fields: [${rule.allowedFields.join(', ')}]`,
      ],
    };
  }

  return { valid: true, errors: [] };
}


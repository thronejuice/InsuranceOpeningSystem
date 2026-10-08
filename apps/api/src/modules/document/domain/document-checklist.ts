import { DocumentStatus } from '../../../generated/prisma/enums.js';

export interface ChecklistRequirement {
  documentType: string;
  isRequired: boolean;
}

export interface DocumentItem {
  id?: string;
  documentType: string;
  status: DocumentStatus | string;
  version?: number;
  expiryDate?: Date | string | null;
  deletedAt?: Date | string | null;
}

export type ChecklistLevel = 'UPLOADED' | 'VERIFIED';

export interface ChecklistItemDetail {
  documentType: string;
  isRequired: boolean;
  satisfied: boolean;
  validDocCount: number;
  latestDoc?: DocumentItem;
}

export interface ChecklistResult {
  isComplete: boolean;
  missing: string[];
  totalRequired: number;
  satisfiedCount: number;
  details: ChecklistItemDetail[];
}

/**
 * Checks whether a single document meets completeness criteria for the given level.
 * Documents that are deleted, expired (by status or expiryDate < now), or rejected do not satisfy.
 */
export function isDocumentSatisfied(
  doc: DocumentItem,
  level: ChecklistLevel,
  now: Date = new Date(),
): boolean {
  if (doc.deletedAt) return false;

  // Expiry check: "เอกสารหมดอายุไม่นับ"
  if (doc.status === DocumentStatus.EXPIRED) return false;
  if (doc.expiryDate) {
    const exp = new Date(doc.expiryDate);
    if (!isNaN(exp.getTime()) && exp < now) return false;
  }

  // Level check
  if (level === 'VERIFIED') {
    return doc.status === DocumentStatus.VERIFIED;
  }

  // level === 'UPLOADED'
  return (
    doc.status === DocumentStatus.UPLOADED ||
    doc.status === DocumentStatus.UNDER_REVIEW ||
    doc.status === DocumentStatus.VERIFIED
  );
}

/**
 * Pure domain function to evaluate if a list of documents satisfies all required checklist items.
 */
export function isComplete(
  checklist: ChecklistRequirement[],
  docs: DocumentItem[],
  level: ChecklistLevel = 'UPLOADED',
  now: Date = new Date(),
): ChecklistResult {
  const missing: string[] = [];
  let satisfiedCount = 0;
  let totalRequired = 0;

  const details: ChecklistItemDetail[] = checklist.map((req) => {
    if (req.isRequired) totalRequired++;

    const matchingDocs = docs.filter(
      (d) => d.documentType === req.documentType && !d.deletedAt,
    );

    const validDocs = matchingDocs.filter((d) => isDocumentSatisfied(d, level, now));
    const satisfied = !req.isRequired || validDocs.length > 0;

    if (req.isRequired) {
      if (satisfied) {
        satisfiedCount++;
      } else {
        missing.push(req.documentType);
      }
    }

    const sorted = [...matchingDocs].sort((a, b) => (b.version ?? 1) - (a.version ?? 1));

    return {
      documentType: req.documentType,
      isRequired: req.isRequired,
      satisfied,
      validDocCount: validDocs.length,
      latestDoc: sorted[0],
    };
  });

  return {
    isComplete: missing.length === 0,
    missing,
    totalRequired,
    satisfiedCount,
    details,
  };
}


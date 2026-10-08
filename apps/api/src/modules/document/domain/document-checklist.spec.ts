import { describe, expect, it } from 'vitest';
import { DocumentStatus } from '../../../generated/prisma/enums.js';
import { isComplete, isDocumentSatisfied } from './document-checklist.js';

describe('document-checklist (pure domain)', () => {
  const baseTime = new Date('2026-10-08T12:00:00Z');
  const futureDate = new Date('2027-10-08T12:00:00Z');
  const pastDate = new Date('2026-09-01T12:00:00Z');

  const sampleChecklist = [
    { documentType: 'ID_CARD', isRequired: true },
    { documentType: 'VEHICLE_BOOK', isRequired: true },
    { documentType: 'OTHER', isRequired: false },
  ];

  describe('isDocumentSatisfied', () => {
    it('satisfies UPLOADED level for UPLOADED, UNDER_REVIEW, and VERIFIED', () => {
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.UPLOADED }, 'UPLOADED', baseTime)).toBe(true);
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.UNDER_REVIEW }, 'UPLOADED', baseTime)).toBe(true);
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.VERIFIED }, 'UPLOADED', baseTime)).toBe(true);
    });

    it('rejects REJECTED and EXPIRED status for UPLOADED level', () => {
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.REJECTED }, 'UPLOADED', baseTime)).toBe(false);
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.EXPIRED }, 'UPLOADED', baseTime)).toBe(false);
    });

    it('rejects document with past expiryDate even if status is UPLOADED or VERIFIED', () => {
      expect(
        isDocumentSatisfied(
          { documentType: 'ID_CARD', status: DocumentStatus.VERIFIED, expiryDate: pastDate },
          'VERIFIED',
          baseTime,
        ),
      ).toBe(false);

      expect(
        isDocumentSatisfied(
          { documentType: 'ID_CARD', status: DocumentStatus.UPLOADED, expiryDate: pastDate },
          'UPLOADED',
          baseTime,
        ),
      ).toBe(false);
    });

    it('accepts document with future expiryDate', () => {
      expect(
        isDocumentSatisfied(
          { documentType: 'ID_CARD', status: DocumentStatus.VERIFIED, expiryDate: futureDate },
          'VERIFIED',
          baseTime,
        ),
      ).toBe(true);
    });

    it('satisfies VERIFIED level ONLY when status is VERIFIED', () => {
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.UPLOADED }, 'VERIFIED', baseTime)).toBe(false);
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.UNDER_REVIEW }, 'VERIFIED', baseTime)).toBe(false);
      expect(isDocumentSatisfied({ documentType: 'ID_CARD', status: DocumentStatus.VERIFIED }, 'VERIFIED', baseTime)).toBe(true);
    });

    it('rejects soft-deleted document', () => {
      expect(
        isDocumentSatisfied(
          { documentType: 'ID_CARD', status: DocumentStatus.VERIFIED, deletedAt: new Date() },
          'VERIFIED',
          baseTime,
        ),
      ).toBe(false);
    });
  });

  describe('isComplete', () => {
    it('returns isComplete=false when all required documents are missing', () => {
      const result = isComplete(sampleChecklist, [], 'UPLOADED', baseTime);
      expect(result.isComplete).toBe(false);
      expect(result.missing).toEqual(['ID_CARD', 'VEHICLE_BOOK']);
      expect(result.totalRequired).toBe(2);
      expect(result.satisfiedCount).toBe(0);
    });

    it('returns isComplete=true when all required documents are UPLOADED (level: UPLOADED)', () => {
      const docs = [
        { documentType: 'ID_CARD', status: DocumentStatus.UPLOADED },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.UPLOADED },
      ];
      const result = isComplete(sampleChecklist, docs, 'UPLOADED', baseTime);
      expect(result.isComplete).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.satisfiedCount).toBe(2);
    });

    it('ignores optional documents when computing isComplete', () => {
      const docs = [
        { documentType: 'ID_CARD', status: DocumentStatus.UPLOADED },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.UPLOADED },
      ];
      // OTHER is optional and missing
      const result = isComplete(sampleChecklist, docs, 'UPLOADED', baseTime);
      expect(result.isComplete).toBe(true);
      expect(result.details.find((d) => d.documentType === 'OTHER')?.satisfied).toBe(true);
    });

    it('returns isComplete=false for level VERIFIED when documents are only UPLOADED', () => {
      const docs = [
        { documentType: 'ID_CARD', status: DocumentStatus.UPLOADED },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.UPLOADED },
      ];
      const result = isComplete(sampleChecklist, docs, 'VERIFIED', baseTime);
      expect(result.isComplete).toBe(false);
      expect(result.missing).toEqual(['ID_CARD', 'VEHICLE_BOOK']);
    });

    it('returns isComplete=true for level VERIFIED when all required documents are VERIFIED', () => {
      const docs = [
        { documentType: 'ID_CARD', status: DocumentStatus.VERIFIED },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.VERIFIED },
      ];
      const result = isComplete(sampleChecklist, docs, 'VERIFIED', baseTime);
      expect(result.isComplete).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('does not count expired documents towards completeness ("เอกสารหมดอายุไม่นับ")', () => {
      const docs = [
        { documentType: 'ID_CARD', status: DocumentStatus.VERIFIED, expiryDate: pastDate },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.VERIFIED, expiryDate: futureDate },
      ];
      const result = isComplete(sampleChecklist, docs, 'VERIFIED', baseTime);
      expect(result.isComplete).toBe(false);
      expect(result.missing).toEqual(['ID_CARD']);
    });

    it('handles versioning: satisfies requirement when a later version is valid', () => {
      const docs = [
        // Version 1 was rejected
        { documentType: 'ID_CARD', status: DocumentStatus.REJECTED, version: 1 },
        // Version 2 was uploaded
        { documentType: 'ID_CARD', status: DocumentStatus.UPLOADED, version: 2 },
        { documentType: 'VEHICLE_BOOK', status: DocumentStatus.UPLOADED, version: 1 },
      ];
      const result = isComplete(sampleChecklist, docs, 'UPLOADED', baseTime);
      expect(result.isComplete).toBe(true);
      const idDetail = result.details.find((d) => d.documentType === 'ID_CARD');
      expect(idDetail?.latestDoc?.version).toBe(2);
    });
  });
});


import { describe, expect, it } from 'vitest';
import { validateAcceptanceEvidence } from './proposal-acceptance.js';

describe('validateAcceptanceEvidence', () => {
  it('throws 422 if method is missing', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: undefined,
        hasEvidenceFile: false,
      }),
    ).toThrowError(/Acceptance method is required/);
  });

  it('EMAIL with no evidence file throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', () => {
    try {
      validateAcceptanceEvidence({
        method: 'EMAIL',
        hasEvidenceFile: false,
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const e = err as { code: string; status: number };
      expect(e.code).toBe('ACCEPTANCE_EVIDENCE_REQUIRED');
      expect(e.status).toBe(422);
    }
  });

  it('SIGNED_DOCUMENT with no evidence file throws 422', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'SIGNED_DOCUMENT',
        hasEvidenceFile: false,
      }),
    ).toThrowError(/Evidence file is required for SIGNED_DOCUMENT/);
  });

  it('LINE with no evidence file throws 422', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'LINE',
        hasEvidenceFile: false,
      }),
    ).toThrowError(/Evidence file is required for LINE/);
  });

  it('EMAIL with evidence file passes validation', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'EMAIL',
        hasEvidenceFile: true,
      }),
    ).not.toThrow();
  });

  it('MANUAL with no remark throws 422 ACCEPTANCE_EVIDENCE_REQUIRED', () => {
    try {
      validateAcceptanceEvidence({
        method: 'MANUAL',
        hasEvidenceFile: false,
        remark: '',
      });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const e = err as { code: string; status: number };
      expect(e.code).toBe('ACCEPTANCE_EVIDENCE_REQUIRED');
      expect(e.status).toBe(422);
    }
  });

  it('MANUAL with whitespace remark throws 422', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'MANUAL',
        hasEvidenceFile: false,
        remark: '   ',
      }),
    ).toThrowError(/Remark is required for manual acceptance method/);
  });

  it('MANUAL with non-empty remark passes validation', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'MANUAL',
        hasEvidenceFile: false,
        remark: 'Customer approved verbally over phone',
      }),
    ).not.toThrow();
  });

  it('MANUAL with remark and evidence file passes validation', () => {
    expect(() =>
      validateAcceptanceEvidence({
        method: 'MANUAL',
        hasEvidenceFile: true,
        remark: 'Customer verified in person',
      }),
    ).not.toThrow();
  });
});


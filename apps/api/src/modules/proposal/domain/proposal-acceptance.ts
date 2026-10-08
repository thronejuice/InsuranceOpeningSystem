import { BusinessException } from '../../../common/errors/business.exception.js';
import type { AcceptanceMethod } from '../../../generated/prisma/enums.js';

export interface ValidateAcceptanceInput {
  method?: AcceptanceMethod | string | null;
  hasEvidenceFile: boolean;
  remark?: string | null;
}

/**
 * Validates acceptance evidence rules according to Phase 2 Day 14:
 * - method !== 'MANUAL' requires an evidence file.
 * - method === 'MANUAL' requires a non-empty remark.
 * Throws 422 ACCEPTANCE_EVIDENCE_REQUIRED when conditions are not satisfied.
 */
export function validateAcceptanceEvidence(input: ValidateAcceptanceInput): void {
  const method = input.method;
  if (!method) {
    throw new BusinessException(
      'ACCEPTANCE_EVIDENCE_REQUIRED',
      'Acceptance method is required',
      422,
    );
  }

  if (method === 'MANUAL') {
    if (!input.remark || input.remark.trim().length === 0) {
      throw new BusinessException(
        'ACCEPTANCE_EVIDENCE_REQUIRED',
        'Remark is required for manual acceptance method',
        422,
      );
    }
  } else {
    // Non-manual methods: EMAIL, SIGNED_DOCUMENT, LINE
    if (!input.hasEvidenceFile) {
      throw new BusinessException(
        'ACCEPTANCE_EVIDENCE_REQUIRED',
        `Evidence file is required for ${method} acceptance method`,
        422,
      );
    }
  }
}

import { describe, expect, it } from 'vitest';
import { canTransition, getAllowedActions, JOB_TRANSITIONS, NON_CANCELLABLE, type JobStatus } from './job-status.js';

// ─── Table-driven: every explicit forward transition ─────────────────────────

type TransitionCase = { from: JobStatus; to: JobStatus; expected: boolean };

const VALID_TRANSITIONS: TransitionCase[] = Object.entries(JOB_TRANSITIONS).flatMap(
  ([from, tos]) => tos.map((to) => ({ from: from as JobStatus, to: to as JobStatus, expected: true })),
);

describe('canTransition — forward transitions', () => {
  it.each(VALID_TRANSITIONS)('$from → $to should be ALLOWED', ({ from, to }) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

// ─── Table-driven: invalid reverse / skip transitions ────────────────────────

const INVALID_TRANSITIONS: TransitionCase[] = [
  { from: 'OPEN', to: 'DRAFT', expected: false },
  { from: 'DRAFT', to: 'QUOTATION_REQUESTED', expected: false },
  { from: 'WAITING_INFORMATION', to: 'QUOTATION_REQUESTED', expected: false },
  { from: 'QUOTATION_RECEIVED', to: 'DRAFT', expected: false },
  { from: 'APPROVED', to: 'WAITING_APPROVAL', expected: false },
  { from: 'POLICY_ISSUED', to: 'BINDING', expected: false },
  { from: 'CLOSED', to: 'OPEN', expected: false },
  { from: 'EXPIRED', to: 'OPEN', expected: false },
  { from: 'RENEWAL', to: 'OPEN', expected: false },
];

describe('canTransition — invalid transitions', () => {
  it.each(INVALID_TRANSITIONS)('$from → $to should be REJECTED', ({ from, to }) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

// ─── Cancel rules ─────────────────────────────────────────────────────────────

const ALL_STATUSES = Object.keys(JOB_TRANSITIONS) as JobStatus[];
const CANCELLABLE = ALL_STATUSES.filter((s) => !NON_CANCELLABLE.includes(s));

describe('canTransition — cancel (→ CANCELLED)', () => {
  it.each(CANCELLABLE.map((s) => ({ status: s })))('$status should be cancellable', ({ status }) => {
    expect(canTransition(status, 'CANCELLED')).toBe(true);
  });

  it.each(NON_CANCELLABLE.map((s) => ({ status: s })))('$status should NOT be cancellable', ({ status }) => {
    expect(canTransition(status, 'CANCELLED')).toBe(false);
  });
});

// ─── getAllowedActions ────────────────────────────────────────────────────────

const FULL_PERMS = ['job.submit', 'job.cancel', 'job.update'];

describe('getAllowedActions', () => {
  it('returns empty when canWrite=false', () => {
    expect(getAllowedActions('OPEN', FULL_PERMS, false)).toEqual([]);
  });

  it('DRAFT with write + submit perm → contains submit and cancel', () => {
    const actions = getAllowedActions('DRAFT', FULL_PERMS, true);
    expect(actions).toContain('submit');
    expect(actions).toContain('cancel');
  });

  it('DRAFT without job.submit perm → no submit', () => {
    const actions = getAllowedActions('DRAFT', ['job.cancel', 'job.update'], true);
    expect(actions).not.toContain('submit');
    expect(actions).toContain('cancel');
  });

  it('OPEN with write → contains requestInfo, cancel', () => {
    const actions = getAllowedActions('OPEN', FULL_PERMS, true);
    expect(actions).toContain('requestInfo');
    expect(actions).toContain('requestQuotation');
    expect(actions).toContain('cancel');
  });

  it('OPEN without job.cancel → no cancel', () => {
    const actions = getAllowedActions('OPEN', ['job.submit', 'job.update'], true);
    expect(actions).not.toContain('cancel');
  });

  it('POLICY_ISSUED → close only (no cancel)', () => {
    const actions = getAllowedActions('POLICY_ISSUED', FULL_PERMS, true);
    expect(actions).toContain('close');
    expect(actions).not.toContain('cancel');
  });

  it('CANCELLED → no actions', () => {
    const actions = getAllowedActions('CANCELLED', FULL_PERMS, true);
    expect(actions).toHaveLength(0);
  });
});

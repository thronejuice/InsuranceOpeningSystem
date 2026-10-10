import { describe, it, expect } from 'vitest';
import {
  RENEWAL_TIMELINE_STEPS,
  getTimelineStepForDays,
  deriveRenewalStatusFromJob,
} from './renewal-timeline.js';
import { RenewalStatus } from '../../../generated/prisma/enums.js';

describe('renewal-timeline domain', () => {
  it('has 6 timeline steps (90, 60, 45, 30, 15, 7 days)', () => {
    expect(RENEWAL_TIMELINE_STEPS).toHaveLength(6);
    expect(RENEWAL_TIMELINE_STEPS.map((s) => s.daysBeforeExpiry)).toEqual([90, 60, 45, 30, 15, 7]);
  });

  it('correctly maps remaining days to timeline step', () => {
    const step90 = getTimelineStepForDays(90);
    expect(step90).not.toBeNull();
    expect(step90?.daysBeforeExpiry).toBe(90);

    const step7 = getTimelineStepForDays(7);
    expect(step7).not.toBeNull();
    expect(step7?.taskPriority).toBe('URGENT');

    const noStep = getTimelineStepForDays(100);
    expect(noStep).toBeNull();
  });

  it('derives RenewalStatus from renewal Job status correctly', () => {
    expect(deriveRenewalStatusFromJob('OPEN')).toBe(RenewalStatus.IN_PROGRESS);
    expect(deriveRenewalStatusFromJob('QUOTATION_REQUESTED')).toBe(RenewalStatus.QUOTATION);
    expect(deriveRenewalStatusFromJob('PROPOSAL_SENT')).toBe(RenewalStatus.CUSTOMER_CONTACTED);
    expect(deriveRenewalStatusFromJob('CUSTOMER_ACCEPTED')).toBe(RenewalStatus.ACCEPTED);
    expect(deriveRenewalStatusFromJob('POLICY_ISSUED')).toBe(RenewalStatus.RENEWED);
    expect(deriveRenewalStatusFromJob('CLOSED')).toBe(RenewalStatus.RENEWED);
    expect(deriveRenewalStatusFromJob('CUSTOMER_REJECTED')).toBe(RenewalStatus.REJECTED);
    expect(deriveRenewalStatusFromJob('CANCELLED')).toBe(RenewalStatus.CANCELLED);
    expect(deriveRenewalStatusFromJob('EXPIRED')).toBe(RenewalStatus.LOST);
  });
});


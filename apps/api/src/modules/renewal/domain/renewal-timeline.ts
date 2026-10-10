import { RenewalStatus } from '../../../generated/prisma/enums.js';

export interface RenewalTimelineAction {
  daysBeforeExpiry: number;
  taskSubject: string;
  taskPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  notifyCustomer: boolean;
}

export const RENEWAL_TIMELINE_STEPS: RenewalTimelineAction[] = [
  { daysBeforeExpiry: 90, taskSubject: 'ต่ออายุกรมธรรม์: แจ้งเตือนล่วงหน้า 90 วัน', taskPriority: 'LOW', notifyCustomer: false },
  { daysBeforeExpiry: 60, taskSubject: 'ต่ออายุกรมธรรม์: ติดต่อลูกค้า (60 วัน)', taskPriority: 'MEDIUM', notifyCustomer: true },
  { daysBeforeExpiry: 45, taskSubject: 'ต่ออายุกรมธรรม์: ขอใบเสนอราคาบริษัทประกัน (45 วัน)', taskPriority: 'MEDIUM', notifyCustomer: false },
  { daysBeforeExpiry: 30, taskSubject: 'ต่ออายุกรมธรรม์: ส่งใบเสนอราคาให้ลูกค้า (30 วัน)', taskPriority: 'HIGH', notifyCustomer: true },
  { daysBeforeExpiry: 15, taskSubject: 'ต่ออายุกรมธรรม์: ติดตามผลการต่ออายุ (15 วัน)', taskPriority: 'HIGH', notifyCustomer: true },
  { daysBeforeExpiry: 7, taskSubject: 'ต่ออายุกรมธรรม์: ติดตามด่วนใกล้หมดอายุ (7 วัน)', taskPriority: 'URGENT', notifyCustomer: true },
];

/**
 * Determines which timeline step applies based on remaining days until expiry.
 */
export function getTimelineStepForDays(daysRemaining: number): RenewalTimelineAction | null {
  // Find matching window: exact step or closest step that hasn't fired
  for (const step of RENEWAL_TIMELINE_STEPS) {
    if (daysRemaining <= step.daysBeforeExpiry && daysRemaining > step.daysBeforeExpiry - 1) {
      return step;
    }
  }
  return null;
}

/**
 * Maps Job status of the Renewal Job to the appropriate RenewalStatus.
 */
export function deriveRenewalStatusFromJob(jobStatus: string): RenewalStatus | null {
  switch (jobStatus) {
    case 'OPEN':
    case 'WAITING_INFORMATION':
      return RenewalStatus.IN_PROGRESS;
    case 'QUOTATION_REQUESTED':
    case 'QUOTATION_RECEIVED':
    case 'QUOTATION_SELECTED':
      return RenewalStatus.QUOTATION;
    case 'PROPOSAL_SENT':
    case 'WAITING_CUSTOMER':
      return RenewalStatus.CUSTOMER_CONTACTED;
    case 'CUSTOMER_ACCEPTED':
    case 'WAITING_APPROVAL':
    case 'APPROVED':
    case 'BINDING':
    case 'POLICY_PENDING':
      return RenewalStatus.ACCEPTED;
    case 'CUSTOMER_REJECTED':
      return RenewalStatus.REJECTED;
    case 'POLICY_ISSUED':
    case 'CLOSED':
      return RenewalStatus.RENEWED;
    case 'CANCELLED':
      return RenewalStatus.CANCELLED;
    case 'EXPIRED':
      return RenewalStatus.LOST;
    default:
      return null;
  }
}


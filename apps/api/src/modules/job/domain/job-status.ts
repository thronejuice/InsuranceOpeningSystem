export type JobStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'WAITING_INFORMATION'
  | 'QUOTATION_REQUESTED'
  | 'QUOTATION_RECEIVED'
  | 'QUOTATION_SELECTED'
  | 'PROPOSAL_SENT'
  | 'WAITING_CUSTOMER'
  | 'CUSTOMER_ACCEPTED'
  | 'CUSTOMER_REJECTED'
  | 'WAITING_APPROVAL'
  | 'APPROVAL_REJECTED'
  | 'APPROVED'
  | 'BINDING'
  | 'POLICY_PENDING'
  | 'POLICY_ISSUED'
  | 'CANCELLED'
  | 'CLOSED'
  | 'EXPIRED'
  | 'RENEWAL';

export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT:               ['OPEN', 'QUOTATION_SELECTED'],
  OPEN:                ['WAITING_INFORMATION', 'QUOTATION_REQUESTED', 'QUOTATION_SELECTED', 'CLOSED'],
  WAITING_INFORMATION: ['OPEN', 'CLOSED'],
  QUOTATION_REQUESTED: ['QUOTATION_RECEIVED', 'QUOTATION_SELECTED'],
  QUOTATION_RECEIVED:  ['QUOTATION_SELECTED'],
  QUOTATION_SELECTED:  ['PROPOSAL_SENT'],
  PROPOSAL_SENT:       ['WAITING_CUSTOMER'],
  WAITING_CUSTOMER:    ['CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED', 'WAITING_APPROVAL', 'QUOTATION_RECEIVED'],
  CUSTOMER_ACCEPTED:   ['WAITING_APPROVAL', 'BINDING'],
  WAITING_APPROVAL:    ['APPROVED', 'APPROVAL_REJECTED'],
  APPROVAL_REJECTED:   ['WAITING_APPROVAL', 'QUOTATION_RECEIVED', 'CANCELLED'],
  APPROVED:            ['BINDING'],
  BINDING:             ['POLICY_PENDING', 'APPROVED', 'CUSTOMER_ACCEPTED'],
  POLICY_PENDING:      ['POLICY_ISSUED'],
  POLICY_ISSUED:       ['CLOSED'],
  CUSTOMER_REJECTED:   ['CLOSED'],
  CANCELLED:           [],
  CLOSED:              [],
  EXPIRED:             [],
  RENEWAL:             [],
};

export const NON_CANCELLABLE: JobStatus[] = [
  'POLICY_ISSUED', 'CANCELLED', 'CLOSED', 'EXPIRED', 'RENEWAL',
];

/** Statuses that require manager approval before cancelling (D-26) */
export const CANCEL_REQUIRES_APPROVAL_STATUSES: JobStatus[] = [
  'BINDING', 'POLICY_PENDING',
];

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (to === 'CANCELLED') return !NON_CANCELLABLE.includes(from);
  return (JOB_TRANSITIONS[from] ?? []).includes(to);
}

export type JobAction =
  | 'submit'
  | 'requestInfo'
  | 'resume'
  | 'cancel'
  | 'requestCancel'
  | 'approveCancel'
  | 'rejectCancel'
  | 'close'
  | 'requestQuotation'
  | 'recordQuotation'
  | 'selectQuotation'
  | 'sendProposal'
  | 'acceptProposal'
  | 'rejectProposal'
  | 'revise'
  | 'resubmit'
  | 'approve'
  | 'bind'
  | 'confirmBinding'
  | 'insurerRejectBinding'
  | 'issuePolicy';

const STATUS_ACTIONS: Partial<Record<JobStatus, JobAction[]>> = {
  DRAFT:               ['submit'],
  OPEN:                ['requestInfo', 'requestQuotation'],
  WAITING_INFORMATION: ['resume'],
  QUOTATION_REQUESTED: ['recordQuotation'],
  QUOTATION_RECEIVED:  ['selectQuotation'],
  QUOTATION_SELECTED:  ['sendProposal'],
  PROPOSAL_SENT:       [],
  WAITING_CUSTOMER:    ['acceptProposal', 'rejectProposal', 'revise'],
  CUSTOMER_ACCEPTED:   ['bind'],
  WAITING_APPROVAL:    ['approve'],
  APPROVAL_REJECTED:   ['resubmit', 'revise'],
  APPROVED:            ['bind'],
  BINDING:             ['confirmBinding', 'insurerRejectBinding'],
  POLICY_PENDING:      ['issuePolicy'],
  POLICY_ISSUED:       ['close'],
  CUSTOMER_REJECTED:   ['close'],
};

/** Actions that need a permission beyond write access to the job. */
const ACTION_PERMISSION: Partial<Record<JobAction, string>> = {
  submit: 'job.submit',
  requestQuotation: 'quotation.create',
  recordQuotation: 'quotation.update',
  selectQuotation: 'quotation.select',
  approve: 'approval.approve',
  resubmit: 'approval.manage',
  bind: 'policy.create',
  confirmBinding: 'policy.create',
  insurerRejectBinding: 'policy.create',
  requestCancel: 'job.cancel',
  approveCancel: 'job.cancel',
  rejectCancel: 'job.cancel',
};

/** Actions decided by a checker who does not own the job, so they skip the write-access check. */
const CHECKER_ACTIONS: JobAction[] = ['approve', 'approveCancel', 'rejectCancel'];

export function getAllowedActions(status: JobStatus, permissions: string[], canWrite: boolean): JobAction[] {
  const result = [...(STATUS_ACTIONS[status] ?? [])].filter((action) => {
    if (!canWrite && !CHECKER_ACTIONS.includes(action)) return false;
    const required = ACTION_PERMISSION[action];
    return !required || permissions.includes(required);
  });
  if (canWrite && !NON_CANCELLABLE.includes(status)) {
    if (CANCEL_REQUIRES_APPROVAL_STATUSES.includes(status)) {
      if (permissions.includes('job.cancel')) result.push('requestCancel');
    } else {
      if (permissions.includes('job.cancel')) result.push('cancel');
    }
  }
  return result;
}

export interface JobCapabilities {
  editRisk: boolean;
  manageDocuments: boolean;
  manageQuotations: boolean;
}

export const EDITABLE_STATUSES: JobStatus[] = ['DRAFT', 'OPEN', 'WAITING_INFORMATION'];
export const DOCS_LOCKED_STATUSES: JobStatus[] = ['CANCELLED', 'CLOSED', 'EXPIRED'];
export const QUOTATION_MANAGEABLE_STATUSES: JobStatus[] = [
  'OPEN',
  'WAITING_INFORMATION',
  'QUOTATION_REQUESTED',
  'QUOTATION_RECEIVED',
  'QUOTATION_SELECTED',
];

export function getJobCapabilities(status: JobStatus, canWrite = true): JobCapabilities {
  return {
    editRisk: canWrite && EDITABLE_STATUSES.includes(status),
    manageDocuments: canWrite && !DOCS_LOCKED_STATUSES.includes(status),
    manageQuotations: canWrite && QUOTATION_MANAGEABLE_STATUSES.includes(status),
  };
}

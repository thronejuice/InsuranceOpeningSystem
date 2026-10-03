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
  | 'APPROVED'
  | 'BINDING'
  | 'POLICY_PENDING'
  | 'POLICY_ISSUED'
  | 'CANCELLED'
  | 'CLOSED'
  | 'EXPIRED'
  | 'RENEWAL';

export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT:               ['OPEN'],
  OPEN:                ['WAITING_INFORMATION', 'QUOTATION_REQUESTED'],
  WAITING_INFORMATION: ['OPEN'],
  QUOTATION_REQUESTED: ['QUOTATION_RECEIVED'],
  QUOTATION_RECEIVED:  ['QUOTATION_SELECTED'],
  QUOTATION_SELECTED:  ['PROPOSAL_SENT'],
  PROPOSAL_SENT:       ['WAITING_CUSTOMER'],
  WAITING_CUSTOMER:    ['CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED'],
  CUSTOMER_ACCEPTED:   ['WAITING_APPROVAL', 'BINDING'],
  WAITING_APPROVAL:    ['APPROVED'],
  APPROVED:            ['BINDING'],
  BINDING:             ['POLICY_PENDING'],
  POLICY_PENDING:      ['POLICY_ISSUED'],
  POLICY_ISSUED:       ['RENEWAL', 'CLOSED'],
  CUSTOMER_REJECTED:   ['CLOSED'],
  CANCELLED:           [],
  CLOSED:              [],
  EXPIRED:             [],
  RENEWAL:             [],
};

export const NON_CANCELLABLE: JobStatus[] = [
  'POLICY_ISSUED', 'CANCELLED', 'CLOSED', 'EXPIRED', 'RENEWAL',
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
  | 'close'
  | 'requestQuotation'
  | 'recordQuotation'
  | 'selectQuotation'
  | 'sendProposal'
  | 'acceptProposal'
  | 'rejectProposal'
  | 'approve'
  | 'bind'
  | 'issuePolicy';

const STATUS_ACTIONS: Partial<Record<JobStatus, JobAction[]>> = {
  DRAFT:               ['submit'],
  OPEN:                ['requestInfo', 'requestQuotation'],
  WAITING_INFORMATION: ['resume'],
  QUOTATION_REQUESTED: ['recordQuotation'],
  QUOTATION_RECEIVED:  ['selectQuotation'],
  QUOTATION_SELECTED:  ['sendProposal'],
  PROPOSAL_SENT:       [],
  WAITING_CUSTOMER:    ['acceptProposal', 'rejectProposal'],
  CUSTOMER_ACCEPTED:   ['bind'],
  WAITING_APPROVAL:    ['approve'],
  APPROVED:            ['bind'],
  BINDING:             [],
  POLICY_PENDING:      ['issuePolicy'],
  POLICY_ISSUED:       ['close'],
  CUSTOMER_REJECTED:   ['close'],
};

export function getAllowedActions(status: JobStatus, permissions: string[], canWrite: boolean): JobAction[] {
  if (!canWrite) return [];
  const result = [...(STATUS_ACTIONS[status] ?? [])].filter((action) => {
    if (action === 'submit') return permissions.includes('job.submit');
    return true;
  });
  if (!NON_CANCELLABLE.includes(status) && permissions.includes('job.cancel')) result.push('cancel');
  return result;
}

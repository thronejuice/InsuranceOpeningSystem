import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

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
  | 'revise'
  | 'approve'
  | 'bind'
  | 'issuePolicy';

export interface JobCapabilities {
  editRisk: boolean;
  manageDocuments: boolean;
  manageQuotations: boolean;
}

export interface Job {
  id: string;
  jobNo: string;
  status: JobStatus;
  priority: string;
  source: string | null;
  remark: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  version: number;
  customerId: string;
  customerName: string;
  customerCode: string;
  insuranceTypeId: string;
  insuranceTypeName: string;
  productId: string;
  productName: string;
  agentId: string;
  agentName: string;
  assignedTo: string | null;
  brokerStaffId?: string | null;
  brokerStaffName?: string | null;
  branchId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  selectedQuotationId: string | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: JobAction[];
  capabilities?: JobCapabilities;
}

export interface JobAssignmentHistory {
  id: string;
  jobId: string;
  fromUserId?: string | null;
  fromUser?: { id: string; username: string; fullName: string } | null;
  toUserId?: string | null;
  toUser?: { id: string; username: string; fullName: string } | null;
  role: 'AGENT' | 'BROKER_STAFF';
  reason?: string | null;
  changedById?: string | null;
  changedBy?: { id: string; username: string; fullName: string } | null;
  changedAt: string;
}

export interface CreateJobDto {
  customerId: string;
  insuranceTypeId: string;
  productId: string;
  agentId: string;
  effectiveDate: string;
  expiryDate?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  source?: string;
  remark?: string;
}

export interface UpdateJobDto {
  effectiveDate?: string;
  expiryDate?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  source?: string;
  remark?: string;
}

export interface JobQuery {
  page?: number;
  perPage?: number;
  sort?: string;
  q?: string;
  customerId?: string;
  status?: JobStatus;
  agentId?: string;
  productId?: string;
  insuranceTypeId?: string;
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
}

// ─── Risk ──────────────────────────────────────────────────────────────────

export interface RiskFieldDef {
  id: string;
  fieldCode: string;
  fieldName: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT';
  isRequired: boolean;
  validationRule: string | null;
  sortOrder: number;
}

export interface JobRisk {
  jobId: string;
  fieldDefs: RiskFieldDef[];
  values: Record<string, string | null>;
}

// ─── Coverage ──────────────────────────────────────────────────────────────

export interface JobCoverage {
  id: string;
  jobId: string;
  coverageId: string;
  coverageCode: string;
  coverageName: string;
  sumInsured: string | null;
  deductible: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddCoverageDto {
  coverageId: string;
  sumInsured?: string;
  deductible?: string;
  remark?: string;
}

export interface UpdateCoverageDto {
  sumInsured?: string;
  deductible?: string;
  remark?: string;
}

// ─── Document ──────────────────────────────────────────────────────────────

export interface DocumentUserSummary {
  id: string;
  username: string;
  fullName: string;
}

export interface JobDocument {
  id: string;
  jobId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  version: number;
  status: 'REQUIRED' | 'UPLOADED' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | string;
  uploadedById: string | null;
  uploadedBy?: DocumentUserSummary | null;
  verifiedById?: string | null;
  verifiedBy?: DocumentUserSummary | null;
  verifiedAt?: string | null;
  expiryDate?: string | null;
  remark?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChecklistUploadedItem {
  documentType: string;
  documentId: string;
  originalName: string;
  version: number;
  status: string;
  expiryDate: string | null;
}

export interface DocumentChecklist {
  isComplete: boolean;
  required: { documentType: string; isRequired: boolean }[];
  uploaded: DocumentChecklistUploadedItem[];
  missing: string[];
}

// ─── Quotations ────────────────────────────────────────────────────────────

export type QuotationStatus = 'REQUESTED' | 'RECEIVED' | 'SELECTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN' | 'CANCELLED';

export type QuotationVersionStatus = 'ACTIVE' | 'SUPERSEDED' | 'SELECTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';

export interface QuotationItem {
  id: string;
  quotationId: string;
  coverageId: string | null;
  coverageName: string;
  sumInsured: string;
  rate: string | null;
  deductible: string | null;
  premium: string;
  remark: string | null;
}

export interface QuotationVersion {
  id: string;
  quotationId: string;
  version: number;
  status: QuotationVersionStatus;
  quotationDate: string | null;
  validUntil: string | null;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalAmount: string;
  commissionRate: string | null;
  commissionAmount: string | null;
  deductible: string | null;
  exclusion: string | null;
  specialCondition: string | null;
  insurerReference: string | null;
  underwriter: string | null;
  attachment: string | null;
  remark: string | null;
  createdById: string | null;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Quotation {
  id: string;
  jobId: string;
  insuranceCompanyId: string;
  insuranceCompanyName: string;
  quotationNo: string;
  quotationDate: string | null;
  validUntil: string | null;
  status: QuotationStatus;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalAmount: string;
  commissionRate?: string | null;
  commissionAmount?: string | null;
  deductible?: string | null;
  exclusion?: string | null;
  specialCondition?: string | null;
  insurerReference?: string | null;
  underwriter?: string | null;
  attachment?: string | null;
  remark: string | null;
  version: number;
  requestedById: string | null;
  jobNo: string | null;
  items: QuotationItem[];
  versions?: QuotationVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuotationBody {
  insuranceCompanyId: string;
  grossPremium: string;
  discount?: string;
  stampDuty?: string;
  tax?: string;
  quotationDate?: string;
  validUntil?: string;
  remark?: string;
}

export interface QuotationItemBody {
  coverageId?: string;
  coverageName: string;
  sumInsured: string;
  rate?: string;
  deductible?: string;
  premium: string;
  remark?: string;
}

export interface RecordQuotationBody {
  grossPremium?: string;
  discount?: string;
  stampDuty?: string;
  tax?: string;
  commissionRate?: string;
  commissionAmount?: string;
  deductible?: string;
  exclusion?: string;
  specialCondition?: string;
  insurerReference?: string;
  underwriter?: string;
  attachment?: string;
  quotationDate?: string;
  validUntil?: string;
  remark?: string;
  items?: QuotationItemBody[];
}

export interface SelectQuotationBody {
  reason: string;
  version: number;
}

export interface CompanyColumn {
  quotationId: string;
  quotationNo: string;
  insuranceCompanyId: string;
  insuranceCompanyName: string;
  status: string;
  version?: number;
  quotationDate?: string | null;
  validUntil: string | null;
  grossPremium?: string;
  discount?: string;
  netPremium: string;
  stampDuty: string;
  tax: string;
  totalAmount: string;
  deductible?: string | null;
  commissionRate?: string | null;
  commissionAmount?: string | null;
  exclusion?: string | null;
  specialCondition?: string | null;
  underwriter?: string | null;
  insurerReference?: string | null;
  isLowest?: boolean;
}

export interface ComparisonCoverageCell {
  sumInsured: string | null;
  rate?: string | null;
  deductible: string | null;
  premium: string | null;
  remark?: string | null;
}

export interface ComparisonResponse {
  jobId: string;
  companies: CompanyColumn[];
  coverages: { coverageName: string; cells: ComparisonCoverageCell[] }[];
}

// ─── Proposal ──────────────────────────────────────────────────────────────

export type ProposalStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AcceptanceMethod = 'EMAIL' | 'SIGNED_DOCUMENT' | 'LINE' | 'MANUAL';

export interface ProposalAcceptanceResponse {
  id: string;
  proposalId: string;
  proposalVersion: number;
  acceptedByName: string;
  acceptedAt: string;
  method: AcceptanceMethod;
  ipAddress: string | null;
  evidenceFileId: string | null;
  evidenceFile?: {
    id: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
  } | null;
  remark: string | null;
  recordedById: string | null;
  recordedBy?: {
    id: string;
    username: string;
    fullName?: string;
  } | null;
  createdAt: string;
}

export interface ApprovalResponse {
  id: string;
  jobId: string;
  jobNo?: string | null;
  customerName?: string | null;
  totalPremium?: string | null;
  proposalId: string;
  approvalType: string;
  requestedById: string | null;
  approverId: string | null;
  status: ApprovalStatus;
  reason: string | null;
  remark?: string | null;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Server-computed: current user may approve/reject (not the requester). */
  canDecide: boolean;
}

export type ApprovalInProposal = ApprovalResponse;

export interface ProposalResponse {
  id: string;
  proposalNo: string;
  jobId: string;
  quotationId: string;
  quotationVersionId?: string | null;
  paymentTermId?: string | null;
  customerId: string;
  proposalDate: string | null;
  validUntil: string | null;
  status: ProposalStatus;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  coverageSummary?: string | null;
  terms?: string | null;
  conditions?: string | null;
  remark: string | null;
  version: number;
  paymentTerm?: {
    id: string;
    code: string;
    name: string;
    installments: number;
    intervalMonths: number;
    firstDueDays: number;
  } | null;
  latestAcceptance?: ProposalAcceptanceResponse | null;
  acceptances?: ProposalAcceptanceResponse[];
  approvals: ApprovalInProposal[];
  createdAt: string;
  updatedAt: string;
}

// ─── Binding / Policy ──────────────────────────────────────────────────────

export interface PreconditionCheck {
  code: string;
  label: string;
  met: boolean;
  details?: string;
}

export interface BindingResponse {
  id: string;
  jobId: string;
  quotationId: string;
  bindingDate: string;
  effectiveDate: string;
  expiryDate: string | null;
  remark: string | null;
  createdAt: string;
}

export interface PolicyCoverage {
  id: string;
  coverageId: string | null;
  coverageName: string;
  sumInsured: string;
  rate: string | null;
  deductible: string | null;
  premium: string;
}

export interface PolicyResponse {
  id: string;
  policyNo: string;
  jobId: string;
  quotationId: string;
  insuranceCompanyId: string;
  policyType: string | null;
  effectiveDate: string;
  expiryDate: string | null;
  sumInsured: string | null;
  grossPremium: string;
  discount: string;
  netPremium: string;
  tax: string;
  stampDuty: string;
  totalPremium: string;
  status: string;
  paymentDueDate: string | null;
  issuedAt: string | null;
  remark: string | null;
  version: number;
  coverages: PolicyCoverage[];
  createdAt: string;
  updatedAt: string;
}

// ─── Payment ───────────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'CHEQUE' | 'ONLINE' | 'OTHER';
export type PaymentStatus = 'ACTIVE' | 'CANCELLED';
export type PolicyPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface PaymentRecord {
  id: string;
  paymentNo: string;
  policyId: string;
  paymentDate: string;
  amount: string;
  paymentMethod: PaymentMethod;
  referenceNo: string | null;
  status: PaymentStatus;
  cancelReason: string | null;
  remark: string | null;
  createdAt: string;
}

export interface PaymentListResponse {
  payments: PaymentRecord[];
  totalPaid: string;
  paymentStatus: PolicyPaymentStatus;
}

export interface CreatePaymentDto {
  amount: string;
  paymentMethod: PaymentMethod;
  paymentDate?: string;
  referenceNo?: string;
  remark?: string;
}

// ─── Commission ────────────────────────────────────────────────────────────

export type CommissionType = 'COMPANY' | 'AGENT' | 'TEAM' | 'REFERRAL' | 'OTHER';
export type CommissionStatus = 'PENDING' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface CommissionRecord {
  id: string;
  policyId: string;
  agentId: string | null;
  commissionType: CommissionType;
  commissionRate: string;
  commissionBase: string;
  commissionAmount: string;
  status: CommissionStatus;
  paidDate: string | null;
  remark: string | null;
  createdAt: string;
}

export interface CommissionListResponse {
  items: CommissionRecord[];
  total: number;
}

export type TaskType = 'CALL_CUSTOMER' | 'REQUEST_DOCUMENT' | 'REQUEST_QUOTATION' | 'FOLLOW_UP_QUOTATION' | 'SEND_PROPOSAL' | 'FOLLOW_UP_CUSTOMER' | 'FOLLOW_UP_PAYMENT' | 'FOLLOW_UP_POLICY' | 'RENEWAL' | 'OTHER';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface TaskRecord {
  id: string;
  jobId: string;
  assignedTo: string | null;
  taskType: TaskType;
  subject: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt: string | null;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  items: TaskRecord[];
  total: number;
}

export interface CreateTaskDto {
  taskType: TaskType;
  subject: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  assignedTo?: string;
}

// ─── Renewal types ────────────────────────────────────────────────────────────

export type RenewalStatus = 'PENDING' | 'IN_PROGRESS' | 'QUOTATION' | 'CUSTOMER_CONTACTED' | 'ACCEPTED' | 'REJECTED' | 'RENEWED' | 'LOST' | 'CANCELLED';

export interface RenewalRecord {
  id: string;
  previousPolicyId: string;
  previousPolicyNo: string;
  previousJobId: string;
  previousJobNo: string;
  customerName: string;
  productName: string;
  insuranceCompanyName: string;
  policyEffectiveDate: string;
  policyExpiryDate: string | null;
  /** Money as string (Decimal 15,2) */
  totalPremium: string;
  newJobId: string | null;
  newJobNo: string | null;
  /** Defaults for the renew dialog, computed by the backend (yyyy-mm-dd) */
  suggestedEffectiveDate: string;
  suggestedExpiryDate: string;
  /** Decided by the backend: show the renew button only when true */
  canRenew: boolean;
  renewalDate: string;
  targetExpiryDate: string;
  status: RenewalStatus;
  assignedTo: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalReference {
  previousPolicyId: string;
  previousPolicyNo: string;
  previousJobId: string;
  previousJobNo: string;
  insuranceCompanyName: string;
  totalPremium: string;
  effectiveDate: string;
  expiryDate: string | null;
}

export interface RenewPolicyBody {
  /** yyyy-mm-dd; omitted = backend default (previous expiry, same term) */
  effectiveDate?: string;
  expiryDate?: string;
}

export interface RenewalListResponse {
  items: RenewalRecord[];
  total: number;
}

export interface CreateCommissionDto {
  commissionType: CommissionType;
  commissionRate: string;
  commissionBase: string;
  paidDate?: string;
  remark?: string;
}

// ─── Activities ────────────────────────────────────────────────────────────

export interface ActivityItem {
  type: 'STATUS_CHANGE' | 'ACTIVITY';
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface ActivitiesResponse {
  jobId: string;
  items: ActivityItem[];
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

interface ListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

interface ItemResponse<T> {
  success: boolean;
  data: T;
}

const ACTION_PATH: Partial<Record<JobAction, string>> = {
  submit: 'submit',
  requestInfo: 'request-info',
  resume: 'resume',
  cancel: 'cancel',
  close: 'close',
  revise: 'revise',
};

@Injectable({ providedIn: 'root' })
export class JobsApi {
  private readonly http = inject(HttpClient);

  // ─── Job CRUD ───────────────────────────────────────────────────────────

  list(query: JobQuery): Observable<ListResponse<Job>> {
    let params = new HttpParams();
    if (query.page != null) params = params.set('page', query.page);
    if (query.perPage != null) params = params.set('perPage', query.perPage);
    if (query.sort) params = params.set('sort', query.sort);
    if (query.q) params = params.set('q', query.q);
    if (query.customerId) params = params.set('customerId', query.customerId);
    if (query.status) params = params.set('status', query.status);
    if (query.agentId) params = params.set('agentId', query.agentId);
    if (query.productId) params = params.set('productId', query.productId);
    if (query.insuranceTypeId) params = params.set('insuranceTypeId', query.insuranceTypeId);
    if (query.effectiveDateFrom) params = params.set('effectiveDateFrom', query.effectiveDateFrom);
    if (query.effectiveDateTo) params = params.set('effectiveDateTo', query.effectiveDateTo);
    return this.http.get<ListResponse<Job>>('/api/jobs', { params });
  }

  get(id: string): Observable<Job> {
    return this.http.get<ItemResponse<Job>>(`/api/jobs/${id}`).pipe(map((r) => r.data));
  }

  create(body: CreateJobDto): Observable<Job> {
    return this.http.post<ItemResponse<Job>>('/api/jobs', body).pipe(map((r) => r.data));
  }

  update(id: string, body: UpdateJobDto): Observable<Job> {
    return this.http.put<ItemResponse<Job>>(`/api/jobs/${id}`, body).pipe(map((r) => r.data));
  }

  assign(id: string, body: { assigneeId?: string | null; role?: 'AGENT' | 'BROKER_STAFF'; reason?: string }): Observable<Job> {
    return this.http.post<ItemResponse<Job>>(`/api/jobs/${id}/assign`, body).pipe(map((r) => r.data));
  }

  getAssignmentHistories(jobId: string): Observable<JobAssignmentHistory[]> {
    return this.http
      .get<{ success: boolean; data: JobAssignmentHistory[] }>(`/api/jobs/${jobId}/assignment-histories`)
      .pipe(map((r) => r.data));
  }

  // ─── Workflow Actions ───────────────────────────────────────────────────

  action(id: string, act: JobAction, body: Record<string, unknown> = {}): Observable<Job> {
    const path = ACTION_PATH[act];
    if (!path) throw new Error(`No endpoint for action: ${act}`);
    return this.http.post<ItemResponse<Job>>(`/api/jobs/${id}/${path}`, body).pipe(map((r) => r.data));
  }

  // ─── Risk ───────────────────────────────────────────────────────────────

  getRisk(id: string): Observable<JobRisk> {
    return this.http.get<ItemResponse<JobRisk>>(`/api/jobs/${id}/risk`).pipe(map((r) => r.data));
  }

  saveRisk(id: string, values: Record<string, string | null>): Observable<JobRisk> {
    return this.http.put<ItemResponse<JobRisk>>(`/api/jobs/${id}/risk`, { values }).pipe(map((r) => r.data));
  }

  // ─── Coverage ───────────────────────────────────────────────────────────

  listCoverages(id: string): Observable<JobCoverage[]> {
    return this.http.get<ItemResponse<JobCoverage[]>>(`/api/jobs/${id}/coverages`).pipe(map((r) => r.data));
  }

  addCoverage(id: string, body: AddCoverageDto): Observable<JobCoverage> {
    return this.http.post<ItemResponse<JobCoverage>>(`/api/jobs/${id}/coverages`, body).pipe(map((r) => r.data));
  }

  updateCoverage(id: string, coverageId: string, body: UpdateCoverageDto): Observable<JobCoverage> {
    return this.http.put<ItemResponse<JobCoverage>>(`/api/jobs/${id}/coverages/${coverageId}`, body).pipe(map((r) => r.data));
  }

  removeCoverage(id: string, coverageId: string): Observable<void> {
    return this.http.delete<void>(`/api/jobs/${id}/coverages/${coverageId}`);
  }

  // ─── Documents ──────────────────────────────────────────────────────────

  listDocuments(id: string): Observable<JobDocument[]> {
    return this.http.get<ItemResponse<JobDocument[]>>(`/api/jobs/${id}/documents`).pipe(map((r) => r.data));
  }

  getChecklist(id: string): Observable<DocumentChecklist> {
    return this.http.get<ItemResponse<DocumentChecklist>>(`/api/jobs/${id}/documents/checklist`).pipe(map((r) => r.data));
  }

  uploadDocument(jobId: string, documentType: string, file: File, expiryDate?: string): Observable<JobDocument> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    if (expiryDate) {
      fd.append('expiryDate', expiryDate);
    }
    return this.http.post<ItemResponse<JobDocument>>(`/api/jobs/${jobId}/documents`, fd).pipe(map((r) => r.data));
  }

  verifyDocument(docId: string, dto: { expiryDate?: string; remark?: string } = {}): Observable<JobDocument> {
    return this.http.post<ItemResponse<JobDocument>>(`/api/documents/${docId}/verify`, dto).pipe(map((r) => r.data));
  }

  rejectDocument(docId: string, dto: { reason: string }): Observable<JobDocument> {
    return this.http.post<ItemResponse<JobDocument>>(`/api/documents/${docId}/reject`, dto).pipe(map((r) => r.data));
  }

  deleteDocument(docId: string): Observable<void> {
    return this.http.delete<void>(`/api/documents/${docId}`);
  }

  downloadDocumentUrl(docId: string): string {
    return `/api/documents/${docId}/download`;
  }

  downloadDocumentBlob(docId: string): Observable<Blob> {
    return this.http.get(`/api/documents/${docId}/download`, { responseType: 'blob' });
  }

  // ─── Quotations ─────────────────────────────────────────────────────────

  listAllQuotations(params: { insuranceCompanyId?: string; status?: string; validUntilFrom?: string; validUntilTo?: string }): Observable<Quotation[]> {
    let p = new HttpParams();
    if (params.insuranceCompanyId) p = p.set('insuranceCompanyId', params.insuranceCompanyId);
    if (params.status) p = p.set('status', params.status);
    if (params.validUntilFrom) p = p.set('validUntilFrom', params.validUntilFrom);
    if (params.validUntilTo) p = p.set('validUntilTo', params.validUntilTo);
    return this.http.get<ItemResponse<Quotation[]>>('/api/quotations', { params: p }).pipe(map((r) => r.data));
  }

  listQuotations(jobId: string): Observable<Quotation[]> {
    return this.http.get<ItemResponse<Quotation[]>>(`/api/jobs/${jobId}/quotations`).pipe(map((r) => r.data));
  }

  createQuotation(jobId: string, body: CreateQuotationBody): Observable<Quotation> {
    return this.http.post<ItemResponse<Quotation>>(`/api/jobs/${jobId}/quotations`, body).pipe(map((r) => r.data));
  }

  recordQuotation(id: string, body: RecordQuotationBody): Observable<Quotation> {
    return this.http.put<ItemResponse<Quotation>>(`/api/quotations/${id}`, body).pipe(map((r) => r.data));
  }

  recordQuotationVersion(id: string, body: RecordQuotationBody): Observable<Quotation> {
    return this.http.post<ItemResponse<Quotation>>(`/api/quotations/${id}/versions`, body).pipe(map((r) => r.data));
  }

  selectQuotation(id: string, body: SelectQuotationBody): Observable<Quotation> {
    return this.http.post<ItemResponse<Quotation>>(`/api/quotations/${id}/select`, body).pipe(map((r) => r.data));
  }

  withdrawQuotation(id: string, body: { reason?: string } = {}): Observable<Quotation> {
    return this.http.post<ItemResponse<Quotation>>(`/api/quotations/${id}/withdraw`, body).pipe(map((r) => r.data));
  }

  quotationComparison(jobId: string): Observable<ComparisonResponse> {
    return this.http.get<ItemResponse<ComparisonResponse>>(`/api/jobs/${jobId}/quotation-comparison`).pipe(map((r) => r.data));
  }

  deleteQuotation(id: string): Observable<void> {
    return this.http.delete<void>(`/api/quotations/${id}`);
  }

  // ─── Proposal ───────────────────────────────────────────────────────────

  listProposals(jobId: string): Observable<ProposalResponse[]> {
    return this.http.get<ItemResponse<ProposalResponse[]>>(`/api/jobs/${jobId}/proposals`).pipe(map((r) => r.data));
  }

  createProposal(
    jobId: string,
    body: {
      proposalDate?: string;
      validUntil?: string;
      quotationVersionId?: string;
      paymentTermId?: string;
      coverageSummary?: string;
      terms?: string;
      conditions?: string;
      remark?: string;
    },
  ): Observable<ProposalResponse> {
    return this.http.post<ItemResponse<ProposalResponse>>(`/api/jobs/${jobId}/proposal`, body).pipe(map((r) => r.data));
  }

  sendProposal(proposalId: string): Observable<ProposalResponse> {
    return this.http.post<ItemResponse<ProposalResponse>>(`/api/proposals/${proposalId}/send`, {}).pipe(map((r) => r.data));
  }

  downloadProposalPdf(proposalId: string): Observable<Blob> {
    return this.http.get(`/api/proposals/${proposalId}/pdf`, { responseType: 'blob' });
  }

  acceptProposal(
    proposalId: string,
    payload?: FormData | { method?: string; remark?: string; acceptedByName?: string; evidenceFileId?: string },
  ): Observable<ProposalResponse> {
    return this.http.post<ItemResponse<ProposalResponse>>(`/api/proposals/${proposalId}/accept`, payload ?? {}).pipe(map((r) => r.data));
  }

  getProposalAcceptance(proposalId: string): Observable<ProposalAcceptanceResponse> {
    return this.http.get<ItemResponse<ProposalAcceptanceResponse>>(`/api/proposals/${proposalId}/acceptance`).pipe(map((r) => r.data));
  }

  rejectProposal(proposalId: string, body: { reason: string }): Observable<ProposalResponse> {
    return this.http.post<ItemResponse<ProposalResponse>>(`/api/proposals/${proposalId}/reject`, body).pipe(map((r) => r.data));
  }

  reviseProposal(proposalId: string, body: { reason?: string } = {}): Observable<ProposalResponse> {
    return this.http.post<ItemResponse<ProposalResponse>>(`/api/proposals/${proposalId}/revise`, body).pipe(map((r) => r.data));
  }

  // ─── Approval (global inbox) ─────────────────────────────────────────────

  listApprovals(params?: { status?: string }): Observable<ApprovalResponse[]> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    return this.http.get<ItemResponse<ApprovalResponse[]>>('/api/approvals', { params: p }).pipe(map((r) => r.data));
  }

  approveApproval(id: string, body: { reason?: string } = {}): Observable<ApprovalResponse> {
    return this.http.post<ItemResponse<ApprovalResponse>>(`/api/approvals/${id}/approve`, body).pipe(map((r) => r.data));
  }

  rejectApproval(id: string, body: { reason: string }): Observable<ApprovalResponse> {
    return this.http.post<ItemResponse<ApprovalResponse>>(`/api/approvals/${id}/reject`, body).pipe(map((r) => r.data));
  }

  // ─── Binding / Policy ────────────────────────────────────────────────────

  getBindPreconditions(jobId: string): Observable<PreconditionCheck[]> {
    return this.http.get<ItemResponse<PreconditionCheck[]>>(`/api/jobs/${jobId}/bind/preconditions`).pipe(map((r) => r.data));
  }

  bind(jobId: string, body: { remark?: string } = {}): Observable<BindingResponse> {
    return this.http.post<ItemResponse<BindingResponse>>(`/api/jobs/${jobId}/bind`, body).pipe(map((r) => r.data));
  }

  issuePolicy(jobId: string, body: { remark?: string } = {}): Observable<PolicyResponse> {
    return this.http.post<ItemResponse<PolicyResponse>>(`/api/jobs/${jobId}/policy`, body).pipe(map((r) => r.data));
  }

  listPolicies(params?: { page?: number; perPage?: number; jobId?: string }): Observable<ListResponse<PolicyResponse>> {
    let p = new HttpParams();
    if (params?.page != null) p = p.set('page', params.page);
    if (params?.perPage != null) p = p.set('perPage', params.perPage);
    if (params?.jobId) p = p.set('jobId', params.jobId);
    return this.http.get<ListResponse<PolicyResponse>>('/api/policies', { params: p });
  }

  getPolicy(id: string): Observable<PolicyResponse> {
    return this.http.get<ItemResponse<PolicyResponse>>(`/api/policies/${id}`).pipe(map((r) => r.data));
  }

  updatePolicy(id: string, body: { paymentDueDate?: string; remark?: string }): Observable<PolicyResponse> {
    return this.http.put<ItemResponse<PolicyResponse>>(`/api/policies/${id}`, body).pipe(map((r) => r.data));
  }

  // ─── Payment ─────────────────────────────────────────────────────────────

  listPayments(policyId: string): Observable<PaymentListResponse> {
    return this.http.get<{ success: boolean; data: PaymentListResponse }>(`/api/policies/${policyId}/payments`).pipe(map((r) => r.data));
  }

  createPayment(policyId: string, body: CreatePaymentDto): Observable<PaymentListResponse> {
    return this.http.post<{ success: boolean; data: PaymentListResponse }>(`/api/policies/${policyId}/payments`, body).pipe(map((r) => r.data));
  }

  cancelPayment(policyId: string, paymentId: string, cancelReason: string): Observable<PaymentListResponse> {
    return this.http.post<{ success: boolean; data: PaymentListResponse }>(`/api/policies/${policyId}/payments/${paymentId}/cancel`, { cancelReason }).pipe(map((r) => r.data));
  }

  listAllPayments(params?: { policyId?: string; page?: number; perPage?: number }): Observable<{ items: PaymentRecord[]; total: number }> {
    let p = new HttpParams();
    if (params?.page != null) p = p.set('page', params.page);
    if (params?.perPage != null) p = p.set('perPage', params.perPage);
    if (params?.policyId) p = p.set('policyId', params.policyId);
    return this.http.get<{ success: boolean; data: { items: PaymentRecord[]; total: number } }>('/api/payments', { params: p }).pipe(map((r) => r.data));
  }

  // ─── Commission ───────────────────────────────────────────────────────────

  listCommissions(policyId: string): Observable<CommissionListResponse> {
    return this.http.get<{ success: boolean; data: CommissionListResponse }>(`/api/policies/${policyId}/commissions`).pipe(map((r) => r.data));
  }

  createCommission(policyId: string, body: CreateCommissionDto): Observable<CommissionListResponse> {
    return this.http.post<{ success: boolean; data: CommissionListResponse }>(`/api/policies/${policyId}/commission`, body).pipe(map((r) => r.data));
  }

  listAllCommissions(params?: { agentId?: string; status?: string; fromDate?: string; toDate?: string; page?: number; perPage?: number }): Observable<CommissionListResponse> {
    let p = new HttpParams();
    if (params?.page != null) p = p.set('page', params.page);
    if (params?.perPage != null) p = p.set('perPage', params.perPage);
    if (params?.agentId) p = p.set('agentId', params.agentId);
    if (params?.status) p = p.set('status', params.status);
    if (params?.fromDate) p = p.set('fromDate', params.fromDate);
    if (params?.toDate) p = p.set('toDate', params.toDate);
    return this.http.get<{ success: boolean; data: CommissionListResponse }>('/api/commissions', { params: p }).pipe(map((r) => r.data));
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────

  listTasks(jobId: string): Observable<TaskListResponse> {
    return this.http.get<{ success: boolean; data: TaskListResponse }>(`/api/jobs/${jobId}/tasks`).pipe(map((r) => r.data));
  }

  createTask(jobId: string, body: CreateTaskDto): Observable<TaskRecord> {
    return this.http.post<{ success: boolean; data: TaskRecord }>(`/api/jobs/${jobId}/tasks`, body).pipe(map((r) => r.data));
  }

  completeTask(id: string): Observable<TaskRecord> {
    return this.http.post<{ success: boolean; data: TaskRecord }>(`/api/tasks/${id}/complete`, {}).pipe(map((r) => r.data));
  }

  cancelTask(id: string): Observable<TaskRecord> {
    return this.http.post<{ success: boolean; data: TaskRecord }>(`/api/tasks/${id}/cancel`, {}).pipe(map((r) => r.data));
  }

  listAllTasks(params?: { mine?: boolean; overdue?: boolean; status?: string; page?: number; perPage?: number }): Observable<TaskListResponse> {
    let p = new HttpParams();
    if (params?.mine) p = p.set('mine', 'true');
    if (params?.overdue) p = p.set('overdue', 'true');
    if (params?.status) p = p.set('status', params.status);
    if (params?.page) p = p.set('page', String(params.page));
    if (params?.perPage) p = p.set('perPage', String(params.perPage));
    return this.http.get<{ success: boolean; data: TaskListResponse }>('/api/tasks', { params: p }).pipe(map((r) => r.data));
  }

  // ─── Activities ─────────────────────────────────────────────────────────

  activities(id: string): Observable<ActivitiesResponse> {
    return this.http.get<ItemResponse<ActivitiesResponse>>(`/api/jobs/${id}/activities`).pipe(map((r) => r.data));
  }

  // ─── Renewal ────────────────────────────────────────────────────────────────

  listRenewals(params?: { status?: string; assignedTo?: string; page?: number; perPage?: number }): Observable<RenewalListResponse> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    if (params?.assignedTo) p = p.set('assignedTo', params.assignedTo);
    if (params?.page != null) p = p.set('page', params.page);
    if (params?.perPage != null) p = p.set('perPage', params.perPage);
    return this.http.get<{ success: boolean; data: RenewalListResponse }>('/api/renewals', { params: p }).pipe(map((r) => r.data));
  }

  renewPolicy(policyId: string, body: RenewPolicyBody = {}): Observable<RenewalRecord> {
    return this.http.post<{ success: boolean; data: RenewalRecord }>(`/api/policies/${policyId}/renew`, body).pipe(map((r) => r.data));
  }

  getRenewalReference(jobId: string): Observable<RenewalReference | null> {
    return this.http.get<{ success: boolean; data: RenewalReference | null }>(`/api/jobs/${jobId}/renewal-reference`).pipe(map((r) => r.data));
  }
}

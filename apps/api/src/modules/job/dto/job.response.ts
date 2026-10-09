import { getAllowedActions, getJobCapabilities, type JobAction, type JobCapabilities, type JobStatus } from '../domain/job-status.js';

interface JobWithRelations {
  id: string;
  jobNo: string;
  status: string;
  priority: string;
  source: string | null;
  remark: string | null;
  effectiveDate: Date;
  expiryDate: Date | null;
  version: number;
  customerId: string;
  insuranceTypeId: string;
  productId: string;
  agentId: string;
  assignedTo: string | null;
  brokerStaffId?: string | null;
  selectedQuotationId: string | null;
  cancelRequestedAt?: Date | null;
  cancelRequestedById?: string | null;
  cancelRequestReason?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
  cancellationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; customerCode: string; firstName: string | null; lastName: string | null; companyName: string | null; customerType: string } | null;
  insuranceType?: { id: string; code: string; name: string } | null;
  product?: { id: string; code: string; name: string; requireUnderwriting?: boolean } | null;
  agent?: { id: string; username: string; fullName: string; branchId?: string | null } | null;
  brokerStaff?: { id: string; username: string; fullName: string; branchId?: string | null } | null;
  branchId?: string | null;
  branch?: { id: string; code: string; name: string } | null;
}

export interface JobResponse {
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
  requireUnderwriting: boolean;
  agentId: string;
  agentName: string;
  assignedTo: string | null;
  brokerStaffId: string | null;
  brokerStaffName: string | null;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  selectedQuotationId: string | null;
  cancelRequestedAt?: string | null;
  cancelRequestedById?: string | null;
  cancelRequestReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: JobAction[];
  capabilities: JobCapabilities;
}

export function toJobResponse(job: JobWithRelations, permissions: string[], canWrite: boolean): JobResponse {
  const c = job.customer;
  const customerName = c
    ? c.customerType === 'INDIVIDUAL'
      ? [c.firstName, c.lastName].filter(Boolean).join(' ') || c.customerCode
      : c.companyName || c.customerCode
    : job.customerId;

  return {
    id: job.id,
    jobNo: job.jobNo,
    status: job.status as JobStatus,
    priority: job.priority,
    source: job.source,
    remark: job.remark,
    effectiveDate: (job.effectiveDate as Date).toISOString().slice(0, 10),
    expiryDate: job.expiryDate ? (job.expiryDate as Date).toISOString().slice(0, 10) : null,
    version: job.version,
    customerId: job.customerId,
    customerName,
    customerCode: c?.customerCode ?? '',
    insuranceTypeId: job.insuranceTypeId,
    insuranceTypeName: job.insuranceType?.name ?? '',
    productId: job.productId,
    productName: job.product?.name ?? '',
    requireUnderwriting: job.product?.requireUnderwriting ?? false,
    agentId: job.agentId,
    agentName: job.agent?.fullName ?? job.agent?.username ?? '',
    assignedTo: job.assignedTo,
    brokerStaffId: job.brokerStaffId ?? null,
    brokerStaffName: job.brokerStaff?.fullName ?? job.brokerStaff?.username ?? null,
    branchId: job.branchId ?? job.branch?.id ?? null,
    branchCode: job.branch?.code ?? null,
    branchName: job.branch?.name ?? null,
    selectedQuotationId: job.selectedQuotationId,
    cancelRequestedAt: job.cancelRequestedAt ? (job.cancelRequestedAt as Date).toISOString() : null,
    cancelRequestedById: job.cancelRequestedById ?? null,
    cancelRequestReason: job.cancelRequestReason ?? null,
    cancelledAt: job.cancelledAt ? (job.cancelledAt as Date).toISOString() : null,
    cancelledById: job.cancelledById ?? null,
    cancellationReason: job.cancellationReason ?? null,
    createdAt: (job.createdAt as Date).toISOString(),
    updatedAt: (job.updatedAt as Date).toISOString(),
    allowedActions: getAllowedActions(job.status as JobStatus, permissions, canWrite),
    capabilities: getJobCapabilities(job.status as JobStatus, canWrite),
  };
}

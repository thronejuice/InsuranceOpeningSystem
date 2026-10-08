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
  selectedQuotationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; customerCode: string; firstName: string | null; lastName: string | null; companyName: string | null; customerType: string } | null;
  insuranceType?: { id: string; code: string; name: string } | null;
  product?: { id: string; code: string; name: string } | null;
  agent?: { id: string; username: string; fullName: string } | null;
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
  agentId: string;
  agentName: string;
  assignedTo: string | null;
  selectedQuotationId: string | null;
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
    agentId: job.agentId,
    agentName: job.agent?.fullName ?? job.agent?.username ?? '',
    assignedTo: job.assignedTo,
    selectedQuotationId: job.selectedQuotationId,
    createdAt: (job.createdAt as Date).toISOString(),
    updatedAt: (job.updatedAt as Date).toISOString(),
    allowedActions: getAllowedActions(job.status as JobStatus, permissions, canWrite),
    capabilities: getJobCapabilities(job.status as JobStatus, canWrite),
  };
}

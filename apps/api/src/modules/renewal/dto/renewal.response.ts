import type { Renewal } from '../../../generated/prisma/client.js';

export interface RenewalResponse {
  id: string;
  previousPolicyId: string;
  newJobId: string | null;
  renewalDate: string;
  targetExpiryDate: string;
  status: string;
  assignedTo: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toRenewalResponse(r: Renewal): RenewalResponse {
  return {
    id: r.id,
    previousPolicyId: r.previousPolicyId,
    newJobId: r.newJobId,
    renewalDate: r.renewalDate.toISOString().slice(0, 10),
    targetExpiryDate: r.targetExpiryDate.toISOString().slice(0, 10),
    status: r.status,
    assignedTo: r.assignedTo,
    remark: r.remark,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

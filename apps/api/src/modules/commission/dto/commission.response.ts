import type { Commission } from '../../../generated/prisma/client.js';

export type CommissionResponse = Omit<Commission, 'commissionRate' | 'commissionBase' | 'commissionAmount'> & {
  commissionRate: string;
  commissionBase: string;
  commissionAmount: string;
};

export interface CommissionListResponse {
  items: CommissionResponse[];
  total: number;
}

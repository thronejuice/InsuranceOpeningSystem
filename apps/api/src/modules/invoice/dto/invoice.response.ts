import { Decimal } from 'decimal.js';
import type { Invoice, Customer, Policy } from '../../../generated/prisma/client.js';
import { outstandingAmount } from '../domain/invoice-status.js';
import type { InvoiceStatus, InvoiceType } from '../../../generated/prisma/enums.js';

export interface InvoiceCustomerSummary {
  id: string;
  customerCode: string;
  name: string;
}

export interface InvoicePolicySummary {
  id: string;
  policyNo: string;
  jobId: string;
}

export interface InvoiceResponse {
  id: string;
  invoiceNo: string;
  policyId: string;
  customerId: string;
  type: InvoiceType;
  installmentNo: number | null;
  amount: string;
  netAmount: string;
  stampDuty: string;
  vat: string;
  dueDate: string;
  status: InvoiceStatus;
  paidAmount: string;
  outstandingAmount: string;
  cancelledAt: string | null;
  cancelledById: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: InvoiceCustomerSummary;
  policy?: InvoicePolicySummary;
}

export function toInvoiceResponse(
  invoice: Invoice & {
    customer?: Pick<Customer, 'id' | 'customerCode' | 'companyName' | 'firstName' | 'lastName'> | null;
    policy?: Pick<Policy, 'id' | 'policyNo' | 'jobId'> | null;
  },
  paidAmount = '0',
): InvoiceResponse {
  const paid = new Decimal(paidAmount);
  const outstanding = outstandingAmount(invoice.amount.toString(), paid);

  let customerSummary: InvoiceCustomerSummary | undefined;
  if (invoice.customer) {
    const name = invoice.customer.companyName ||
      [invoice.customer.firstName, invoice.customer.lastName].filter(Boolean).join(' ') ||
      invoice.customer.customerCode;
    customerSummary = {
      id: invoice.customer.id,
      customerCode: invoice.customer.customerCode,
      name,
    };
  }

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    policyId: invoice.policyId,
    customerId: invoice.customerId,
    type: invoice.type,
    installmentNo: invoice.installmentNo,
    amount: invoice.amount.toString(),
    netAmount: invoice.netAmount.toString(),
    stampDuty: invoice.stampDuty.toString(),
    vat: invoice.vat.toString(),
    dueDate: invoice.dueDate instanceof Date ? invoice.dueDate.toISOString().slice(0, 10) : String(invoice.dueDate),
    status: invoice.status,
    paidAmount: paid.toFixed(2),
    outstandingAmount: outstanding.toFixed(2),
    cancelledAt: invoice.cancelledAt ? invoice.cancelledAt.toISOString() : null,
    cancelledById: invoice.cancelledById ?? null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    customer: customerSummary,
    policy: invoice.policy ? {
      id: invoice.policy.id,
      policyNo: invoice.policy.policyNo,
      jobId: invoice.policy.jobId,
    } : undefined,
  };
}


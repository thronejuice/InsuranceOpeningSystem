import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { UiTag } from '../../ui';

type Severity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined;

const STATUS_MAP: Record<string, { label: string; severity: Severity }> = {
  ACTIVE: { label: 'ใช้งาน', severity: 'success' },
  INACTIVE: { label: 'ไม่ใช้งาน', severity: 'secondary' },
  DRAFT: { label: 'ร่าง', severity: 'secondary' },
  OPEN: { label: 'เปิด', severity: 'info' },
  WAITING_INFORMATION: { label: 'รอข้อมูล', severity: 'warn' },
  QUOTATION_REQUESTED: { label: 'ขอราคาแล้ว', severity: 'info' },
  QUOTATION_RECEIVED: { label: 'ได้รับราคา', severity: 'info' },
  QUOTATION_SELECTED: { label: 'เลือกราคาแล้ว', severity: 'info' },
  PROPOSAL_SENT: { label: 'ส่งใบเสนอแล้ว', severity: 'info' },
  WAITING_CUSTOMER: { label: 'รอลูกค้า', severity: 'warn' },
  CUSTOMER_ACCEPTED: { label: 'ลูกค้ายอมรับ', severity: 'success' },
  CUSTOMER_REJECTED: { label: 'ลูกค้าปฏิเสธ', severity: 'danger' },
  WAITING_APPROVAL: { label: 'รออนุมัติ', severity: 'warn' },
  APPROVAL_REJECTED: { label: 'ไม่อนุมัติ', severity: 'danger' },
  APPROVED: { label: 'อนุมัติแล้ว', severity: 'success' },
  SUPERSEDED: { label: 'ยกเลิกโดยฉบับใหม่', severity: 'secondary' },
  BINDING: { label: 'ออกกรมธรรม์', severity: 'info' },
  POLICY_PENDING: { label: 'รอออกกรมธรรม์', severity: 'warn' },
  POLICY_ISSUED: { label: 'ออกกรมธรรม์แล้ว', severity: 'success' },
  CANCELLED: { label: 'ยกเลิก', severity: 'danger' },
  CLOSED: { label: 'ปิด', severity: 'secondary' },
  EXPIRED: { label: 'หมดอายุ', severity: 'danger' },
  RENEWAL: { label: 'ต่ออายุ', severity: 'info' },

  // Quotation & Version status (V2, spec Day 11-12)
  REQUESTED: { label: 'รอราคา', severity: 'info' },
  RECEIVED: { label: 'ได้รับราคา', severity: 'info' },
  SELECTED: { label: 'เลือกแล้ว', severity: 'success' },
  WITHDRAWN: { label: 'ถอนข้อเสนอ', severity: 'secondary' },

  // Proposal status (V2, spec Day 13-16)
  SENT: { label: 'ส่งแล้ว', severity: 'info' },
  VIEWED: { label: 'เปิดดูแล้ว', severity: 'info' },
  ACCEPTED: { label: 'ลูกค้ายอมรับ', severity: 'success' },

  // Document status (V2, spec Day 6)
  REQUIRED: { label: 'ต้องใช้', severity: 'secondary' },
  UPLOADED: { label: 'อัปโหลดแล้ว', severity: 'info' },
  UNDER_REVIEW: { label: 'กำลังตรวจสอบ', severity: 'warn' },
  VERIFIED: { label: 'ตรวจสอบแล้ว', severity: 'success' },
  REJECTED: { label: 'ปฏิเสธ', severity: 'danger' },

  // Policy & Binding status (V2, spec Day 19-20)
  EXPIRING: { label: 'ใกล้หมดอายุ', severity: 'warn' },
  CANCEL_REQUESTED: { label: 'ขอยกเลิก', severity: 'warn' },
  SUBMITTED: { label: 'ยื่นเรื่องแล้ว', severity: 'info' },
  CONFIRMED: { label: 'ยืนยันแล้ว', severity: 'success' },

  // Billing & commission (V2, Phase 4)
  PENDING: { label: 'รอดำเนินการ', severity: 'warn' },
  PARTIALLY_PAID: { label: 'ชำระบางส่วน', severity: 'info' },
  PAID: { label: 'ชำระแล้ว', severity: 'success' },
  OVERDUE: { label: 'เกินกำหนด', severity: 'danger' },
  ISSUED: { label: 'ออกแล้ว', severity: 'success' },
  VOID: { label: 'โมฆะ', severity: 'danger' },
  CALCULATED: { label: 'คำนวณแล้ว', severity: 'info' },
  PAYABLE: { label: 'พร้อมจ่าย', severity: 'success' },
  IN_STATEMENT: { label: 'อยู่ในใบสรุป', severity: 'info' },
  SETTLED: { label: 'ชำระแล้ว', severity: 'success' },

  // Endorsement & Refund (V2, Phase 5)
  REVIEWING: { label: 'กำลังตรวจสอบ', severity: 'info' },
  PROCESSED: { label: 'คืนเงินแล้ว', severity: 'success' },
  REFUNDED: { label: 'คืนเงินครบแล้ว', severity: 'secondary' },
};


/** Some words mean different things per entity (REQUESTED = "waiting for a price" on a quotation, "waiting for approval" elsewhere). */
const CONTEXT_MAP: Record<string, Record<string, { label: string; severity: Severity }>> = {
  underwriting: {
    PENDING: { label: 'รอตรวจพิจารณา', severity: 'warn' },
    INFO_REQUIRED: { label: 'รอข้อมูลเพิ่มเติม', severity: 'info' },
  },
  endorsement: {
    REQUESTED: { label: 'รออนุมัติ', severity: 'warn' },
    REVIEWING: { label: 'กำลังตรวจสอบ', severity: 'info' },
    APPROVED: { label: 'อนุมัติแล้ว (รอออก)', severity: 'success' },
    ISSUED: { label: 'ออกสลักหลังแล้ว', severity: 'success' },
  },
  refund: {
    REQUESTED: { label: 'รออนุมัติ', severity: 'warn' },
    APPROVED: { label: 'อนุมัติแล้ว (รอจ่าย)', severity: 'info' },
    PROCESSED: { label: 'จ่ายแล้ว', severity: 'success' },
  },
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiTag],
  template: `<ui-tag [value]="label()" [severity]="severity()" />`,
})
export class AppStatusBadgeComponent {
  @Input({ required: true }) status!: string;
  /** Optional entity name ('endorsement' | 'refund') for words that differ per entity. */
  @Input() context?: string;

  private entry(): { label: string; severity: Severity } | undefined {
    return (this.context ? CONTEXT_MAP[this.context]?.[this.status] : undefined) ?? STATUS_MAP[this.status];
  }

  label(): string {
    return this.entry()?.label ?? this.status;
  }

  severity(): Severity {
    return this.entry()?.severity;
  }
}

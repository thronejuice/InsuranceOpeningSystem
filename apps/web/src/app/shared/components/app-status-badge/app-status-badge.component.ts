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
  APPROVED: { label: 'อนุมัติแล้ว', severity: 'success' },
  BINDING: { label: 'ออกกรมธรรม์', severity: 'info' },
  POLICY_PENDING: { label: 'รอออกกรมธรรม์', severity: 'warn' },
  POLICY_ISSUED: { label: 'ออกกรมธรรม์แล้ว', severity: 'success' },
  CANCELLED: { label: 'ยกเลิก', severity: 'danger' },
  CLOSED: { label: 'ปิด', severity: 'secondary' },
  EXPIRED: { label: 'หมดอายุ', severity: 'danger' },
  RENEWAL: { label: 'ต่ออายุ', severity: 'info' },
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

  label(): string {
    return STATUS_MAP[this.status]?.label ?? this.status;
  }

  severity(): Severity {
    return STATUS_MAP[this.status]?.severity;
  }
}

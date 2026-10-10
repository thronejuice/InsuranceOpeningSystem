import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage, UiSelect } from '../../../shared/ui';
import {
  PoliciesExtendedApi,
  type EndorsementResponse,
  type EndorsementType,
  type CreateEndorsementDto,
  type PremiumAdjustmentType,
} from '../data/policies-extended.api';
import type { PolicyResponse } from '../../jobs/data/jobs.api';


interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
}

/** The fields the API accepts for each endorsement type (mirrors the backend rules in endorsement-fields.ts). */
const FIELD_SPECS: Partial<Record<EndorsementType, FieldSpec[]>> = {
  CHANGE_SUM_INSURED: [{ key: 'sumInsured', label: 'ทุนประกันใหม่ (บาท)', type: 'number' }],
  CHANGE_CUSTOMER: [
    { key: 'firstName', label: 'ชื่อ' },
    { key: 'lastName', label: 'นามสกุล' },
    { key: 'companyName', label: 'ชื่อบริษัท' },
    { key: 'taxId', label: 'เลขประจำตัวผู้เสียภาษี' },
    { key: 'citizenId', label: 'เลขบัตรประชาชน' },
    { key: 'phone', label: 'โทรศัพท์' },
    { key: 'email', label: 'อีเมล' },
  ],
  CHANGE_ADDRESS: [
    { key: 'addressLine1', label: 'ที่อยู่' },
    { key: 'subdistrict', label: 'ตำบล/แขวง' },
    { key: 'district', label: 'อำเภอ/เขต' },
    { key: 'province', label: 'จังหวัด' },
    { key: 'postalCode', label: 'รหัสไปรษณีย์' },
  ],
  CHANGE_COVERAGE: [{ key: 'deductible', label: 'ค่าเสียหายส่วนแรกใหม่ (บาท)', type: 'number' }],
  CHANGE_VEHICLE: [
    { key: 'licensePlate', label: 'ทะเบียนรถ' },
    { key: 'chassisNo', label: 'เลขตัวถัง' },
    { key: 'engineNo', label: 'เลขเครื่องยนต์' },
    { key: 'vehicleModel', label: 'ยี่ห้อ/รุ่น' },
    { key: 'vehicleYear', label: 'ปีรถ' },
  ],
  CHANGE_EFFECTIVE_DATE: [
    { key: 'effectiveDate', label: 'วันเริ่มคุ้มครองใหม่', type: 'date' },
    { key: 'expiryDate', label: 'วันสิ้นสุดใหม่', type: 'date' },
  ],
  OTHER: [{ key: 'remark', label: 'รายละเอียดการเปลี่ยนแปลง' }],
};

const ENDORSEMENT_TYPE_OPTIONS: { label: string; value: EndorsementType }[] = [
  { label: 'เปลี่ยนทุนประกัน', value: 'CHANGE_SUM_INSURED' },
  { label: 'แก้ไขข้อมูลผู้เอาประกัน', value: 'CHANGE_CUSTOMER' },
  { label: 'แก้ไขที่อยู่', value: 'CHANGE_ADDRESS' },
  { label: 'แก้ไขความคุ้มครอง / ค่าเสียหายส่วนแรก', value: 'CHANGE_COVERAGE' },
  { label: 'แก้ไขข้อมูลรถ', value: 'CHANGE_VEHICLE' },
  { label: 'เปลี่ยนวันเริ่ม/สิ้นสุดความคุ้มครอง', value: 'CHANGE_EFFECTIVE_DATE' },
  { label: 'อื่นๆ', value: 'OTHER' },
];

/** "1234.5" → 123450 satang. Anything unparsable counts as 0 (the API validates the real values). */
function toSatang(value: string): number {
  const m = /^\s*(-?)(\d*)(?:\.(\d{0,2}))?\d*\s*$/.exec(value ?? '');
  if (!m) return 0;
  const sign = m[1] ? -1 : 1;
  return sign * (Number(m[2] || '0') * 100 + Number((m[3] ?? '').padEnd(2, '0')));
}

function formatSatang(n: number): string {
  const abs = Math.abs(n);
  return `${n < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

@Component({
  selector: 'app-policy-endorsements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    JsonPipe,
    AppStateComponent,
    AppStatusBadgeComponent,
    HasPermissionDirective,
    MoneyPipe,
    ThDatePipe,
    UiButton,
    UiDialog,
    UiInput,
    UiMessage,
    UiSelect,
  ],
  template: `
    <div class="endorsements-header">
      <h4 class="section-title">รายการสลักหลัง (Endorsements)</h4>
      @if (policy().status === 'ACTIVE' || policy().status === 'EXPIRING') {
        <ng-container *appHasPermission="'policy.update'">
          <ui-button
            label="สร้างสลักหลัง"
            icon="pi pi-plus"
            size="small"
            (onClick)="openCreateDialog()"
          />
        </ng-container>
      }
    </div>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (endorsements().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีรายการสลักหลังสำหรับกรมธรรม์นี้" />
    } @else {
      <table class="data-table">
        <thead>
          <tr>
            <th>เลขที่สลักหลัง</th>
            <th>ประเภท</th>
            <th>วันที่มีผล</th>
            <th style="text-align:right">ยอดปรับปรุงเบี้ย</th>
            <th>สถานะ</th>
            <th>ผู้ขอ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          @for (e of endorsements(); track e.id) {
            <tr>
              <td class="mono font-bold">{{ e.endorsementNo }}</td>
              <td>{{ getTypeName(e.type) }}</td>
              <td>{{ e.effectiveDate | thDate }}</td>
              <td style="text-align:right" [class.text-green]="isAdditional(e)" [class.text-red]="isReturn(e)">
                {{ e.premiumAdjustmentType === 'NO_CHANGE' ? '-' : (e.totalAdjustment | money) }}
                @if (e.premiumAdjustmentType === 'ADDITIONAL_PREMIUM') { (เรียกเก็บเพิ่ม) }
                @else if (e.premiumAdjustmentType === 'REFUND_PREMIUM') { (คืนเบี้ย) }
              </td>
              <td><app-status-badge [status]="e.status" context="endorsement" /></td>
              <td>{{ e.requestedByName ?? '-' }}</td>
              <td class="actions">
                <ui-button
                  label="ดูรายละเอียด"
                  size="small"
                  [text]="true"
                  (onClick)="viewDetails(e)"
                />
                @if (e.status === 'DRAFT') {
                  <ng-container *appHasPermission="'policy.update'">
                    <ui-button
                      label="ส่งขออนุมัติ"
                      size="small"
                      severity="primary"
                      (onClick)="submit(e.id)"
                    />
                  </ng-container>
                }
                @if (e.status === 'REQUESTED') {
                  <ng-container *appHasPermission="'policy.update'">
                    <ui-button label="เริ่มตรวจสอบ" size="small" severity="secondary" [outlined]="true" (onClick)="startReview(e.id)" />
                  </ng-container>
                }
                @if (e.status === 'REQUESTED' || e.status === 'REVIEWING') {
                  <ng-container *appHasPermission="'approval.approve'">
                    <ui-button
                      label="อนุมัติ"
                      size="small"
                      severity="success"
                      (onClick)="approve(e.id)"
                    />
                    <ui-button
                      label="ปฏิเสธ"
                      size="small"
                      severity="danger"
                      [outlined]="true"
                      (onClick)="openRejectDialog(e)"
                    />
                  </ng-container>
                }
                @if (e.status === 'APPROVED') {
                  <ng-container *appHasPermission="'policy.update'">
                    <ui-button
                      label="ออกสลักหลัง (Issue)"
                      size="small"
                      severity="success"
                      (onClick)="issue(e.id)"
                    />
                  </ng-container>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }

    <!-- Create Endorsement Dialog -->
    <ui-dialog
      header="สร้างคำขอสลักหลัง"
      [visible]="createDialogVisible()"
      [modal]="true"
      [style]="{ width: '600px' }"
      (onHide)="createDialogVisible.set(false)"
    >
      <div class="form-container">
        @if (dialogError()) {
          <ui-message severity="error" class="mb-3">{{ dialogError() }}</ui-message>
        }

        <div class="field">
          <label>ประเภทสลักหลัง *</label>
          <ui-select
            [options]="endorsementTypeOptions"
            optionLabel="label"
            optionValue="value"
            [(ngModel)]="newType"
            placeholder="เลือกประเภทสลักหลัง"
            class="w-full"
          />
        </div>

        <div class="field">
          <label>วันที่มีผลบังคับ *</label>
          <input
            uiInput
            type="date"
            [(ngModel)]="newEffectiveDate"
            class="w-full"
          />
        </div>

        <!-- Fields of the chosen type (the API accepts only these for each type) -->
        <div class="diff-box">
          @for (f of fieldSpecs(); track f.key) {
            <div class="field">
              <label [for]="'en-' + f.key">{{ f.label }}@if (f.key === 'sumInsured' && policy().sumInsured) { <small class="lbl"> (เดิม {{ policy().sumInsured | money }})</small> }</label>
              <input
                uiInput
                [id]="'en-' + f.key"
                [type]="f.type === 'date' ? 'date' : 'text'"
                [attr.inputmode]="f.type === 'number' ? 'decimal' : null"
                [ngModel]="fieldValues[f.key] ?? ''"
                (ngModelChange)="fieldValues[f.key] = $event"
                class="w-full"
              />
            </div>
          }
        </div>
        <small class="lbl">กรอกเฉพาะข้อมูลที่ต้องการเปลี่ยน</small>

        <!-- Premium Adjustment Section -->
        <div class="field">
          <label>การปรับปรุงเบี้ยประกัน</label>
          <ui-select
            [options]="premiumAdjOptions"
            optionLabel="label"
            optionValue="value"
            [(ngModel)]="newPremiumAdjType"
            class="w-full"
          />
        </div>

        @if (newPremiumAdjType !== 'NO_CHANGE') {
          <div class="p-3 bg-ground border rounded mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-sm">คำนวณเบี้ยเฉลี่ยตามวัน (Pro-rata)</span>
              <ui-button
                label="คำนวณอัตโนมัติ"
                icon="pi pi-calculator"
                size="small"
                [outlined]="true"
                [loading]="calculatingProRata()"
                (onClick)="calcProRata()"
              />
            </div>
            <div class="field">
              <label for="en-annual">เบี้ยสุทธิต่อปีที่เปลี่ยนแปลง (บาท) — เว้นว่างเพื่อใช้เบี้ยสุทธิของกรมธรรม์</label>
              <input uiInput id="en-annual" inputmode="decimal" [(ngModel)]="annualChange" class="w-full" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="field">
                <label for="en-net">เบี้ยสุทธิที่ปรับปรุง (บาท)</label>
                <input uiInput id="en-net" inputmode="decimal" [(ngModel)]="newNetAdj" (ngModelChange)="recalcTotal()" class="w-full" />
              </div>
              <div class="field">
                <label for="en-stamp">อากรแสตมป์ (บาท)</label>
                <input uiInput id="en-stamp" inputmode="decimal" [(ngModel)]="newStamp" (ngModelChange)="recalcTotal()" class="w-full" />
              </div>
              <div class="field">
                <label for="en-vat">ภาษีมูลค่าเพิ่ม 7% (บาท)</label>
                <input uiInput id="en-vat" inputmode="decimal" [(ngModel)]="newVat" (ngModelChange)="recalcTotal()" class="w-full" />
              </div>
              <div class="field">
                <label for="en-total">ยอดรวมปรับปรุงทั้งสิ้น (บาท)</label>
                <input uiInput id="en-total" [value]="newTotalAdj" readonly class="w-full font-bold" />
              </div>
            </div>
          </div>
        }

        <div class="field">
          <label>หมายเหตุ</label>
          <input uiInput type="text" [(ngModel)]="newRemark" class="w-full" />
        </div>
      </div>

      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="createDialogVisible.set(false)" />
          <ui-button
            label="สร้างคำขอสลักหลัง"
            icon="pi pi-check"
            [loading]="submitting()"
            (onClick)="createEndorsement()"
          />
        </div>
      </ng-template>
    </ui-dialog>

    <!-- View Details Dialog -->
    <ui-dialog
      header="รายละเอียดสลักหลัง"
      [visible]="viewDialogVisible()"
      [modal]="true"
      [style]="{ width: '550px' }"
      (onHide)="viewDialogVisible.set(false)"
    >
      @if (selectedEndorsement(); as e) {
        <div class="detail-container">
          <div class="info-row"><span class="lbl">เลขที่:</span> <strong>{{ e.endorsementNo }}</strong></div>
          <div class="info-row"><span class="lbl">ประเภท:</span> <span>{{ getTypeName(e.type) }}</span></div>
          <div class="info-row"><span class="lbl">สถานะ:</span> <app-status-badge [status]="e.status" context="endorsement" /></div>
          <div class="info-row"><span class="lbl">วันที่มีผล:</span> <span>{{ e.effectiveDate | thDate }}</span></div>
          <div class="info-row"><span class="lbl">การปรับปรุงเบี้ย:</span> <span>{{ e.premiumAdjustmentType }}</span></div>
          @if (e.premiumAdjustmentType !== 'NO_CHANGE') {
            <div class="info-row"><span class="lbl">ยอดปรับปรุงสุทธิ:</span> <span>{{ e.netAdjustment | money }} บาท</span></div>
            <div class="info-row"><span class="lbl">อากรแสตมป์:</span> <span>{{ e.stampDuty | money }} บาท</span></div>
            <div class="info-row"><span class="lbl">ภาษี:</span> <span>{{ e.vat | money }} บาท</span></div>
            <div class="info-row"><span class="lbl">ยอดรวมทั้งสิ้น:</span> <strong>{{ e.totalAdjustment | money }} บาท</strong></div>
          }
          <div class="mt-3">
            <h5 class="text-sm font-semibold mb-1">การเปลี่ยนแปลง (Before / After):</h5>
            <div class="bg-ground p-2 rounded text-xs mono">
              <div><strong>ก่อนหน้า (Before):</strong></div>
              <pre>{{ e.changes.before | json }}</pre>
              <div class="mt-1"><strong>หลังจากนี้ (After):</strong></div>
              <pre>{{ e.changes.after | json }}</pre>
            </div>
          </div>
          @if (e.remark) {
            <div class="mt-2 text-sm"><span class="text-secondary">หมายเหตุ:</span> {{ e.remark }}</div>
          }
          @if (e.rejectionReason) {
            <div class="mt-2 text-sm text-red"><span class="font-bold">เหตุผลที่ปฏิเสธ:</span> {{ e.rejectionReason }}</div>
          }
        </div>
      }
      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ปิด" (onClick)="viewDialogVisible.set(false)" />
        </div>
      </ng-template>
    </ui-dialog>

    <!-- Reject Dialog -->
    <ui-dialog
      header="ปฏิเสธคำขอสลักหลัง"
      [visible]="rejectDialogVisible()"
      [modal]="true"
      [style]="{ width: '450px' }"
      (onHide)="rejectDialogVisible.set(false)"
    >
      <div class="form-container">
        <div class="field">
          <label>ระบุเหตุผลในการปฏิเสธ *</label>
          <textarea uiInput rows="3" [(ngModel)]="rejectReason" class="w-full"></textarea>
        </div>
      </div>
      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ยกเลิก" [text]="true" (onClick)="rejectDialogVisible.set(false)" />
          <ui-button
            label="ยืนยันปฏิเสธ"
            severity="danger"
            [disabled]="!rejectReason.trim()"
            [loading]="submitting()"
            (onClick)="confirmReject()"
          />
        </div>
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .endorsements-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .section-title { font-size: 0.95rem; font-weight: 600; color: var(--primary-color); margin: 0; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .actions { display: flex; gap: 0.35rem; align-items: center; }
    .mono { font-family: monospace; }
    .font-bold { font-weight: 600; }
    .text-green { color: #16a34a; }
    .text-red { color: #dc2626; }
    .form-container { display: flex; flex-direction: column; gap: 0.85rem; padding-top: 0.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.85rem; font-weight: 500; }
    .diff-box { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .info-row { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px dashed var(--surface-border); font-size: 0.875rem; }
    .lbl { color: var(--text-color-secondary); }
    .bg-ground { background: var(--surface-ground); }
    .p-3 { padding: 0.75rem; }
    .p-2 { padding: 0.5rem; }
    .border { border: 1px solid var(--surface-border); }
    .rounded { border-radius: 6px; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mt-3 { margin-top: 0.75rem; }
    .mt-2 { margin-top: 0.5rem; }
    .mt-1 { margin-top: 0.25rem; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: 1fr 1fr; }
    .gap-2 { gap: 0.5rem; }
  `],
})
export class PolicyEndorsementsComponent implements OnInit {
  private readonly api = inject(PoliciesExtendedApi);
  private readonly toast = inject(MessageService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly policy = input.required<PolicyResponse>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly endorsements = signal<EndorsementResponse[]>([]);
  readonly createDialogVisible = signal(false);
  readonly viewDialogVisible = signal(false);
  readonly rejectDialogVisible = signal(false);
  readonly selectedEndorsement = signal<EndorsementResponse | null>(null);

  readonly submitting = signal(false);
  readonly calculatingProRata = signal(false);
  readonly dialogError = signal<string | null>(null);

  // Form Fields
  newType: EndorsementType = 'CHANGE_SUM_INSURED';
  newEffectiveDate = new Date().toISOString().slice(0, 10);
  /** Values typed for the fields of the chosen type (see FIELD_SPECS). */
  fieldValues: Record<string, string> = {};

  newPremiumAdjType: PremiumAdjustmentType = 'NO_CHANGE';
  annualChange = '';
  newNetAdj = '';
  newStamp = '';
  newVat = '';
  newTotalAdj = '0.00';
  newRemark = '';

  rejectReason = '';
  rejectingEndorsementId = '';

  readonly endorsementTypeOptions = ENDORSEMENT_TYPE_OPTIONS;

  readonly premiumAdjOptions = [
    { label: 'ไม่มีการปรับเบี้ย', value: 'NO_CHANGE' },
    { label: 'เรียกเก็บเบี้ยเพิ่ม', value: 'ADDITIONAL_PREMIUM' },
    { label: 'คืนเบี้ยประกัน', value: 'REFUND_PREMIUM' },
  ];

  fieldSpecs(): FieldSpec[] {
    return FIELD_SPECS[this.newType] ?? [];
  }

  ngOnInit(): void {
    this.loadEndorsements();
  }

  loadEndorsements(): void {
    this.state.set('loading');
    this.api.getPolicyEndorsements(this.policy().id).subscribe({
      next: (list) => {
        this.endorsements.set(list);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  getTypeName(type: EndorsementType): string {
    const opt = this.endorsementTypeOptions.find((o) => o.value === type);
    return opt ? opt.label : type;
  }

  isAdditional(e: EndorsementResponse): boolean {
    return e.premiumAdjustmentType === 'ADDITIONAL_PREMIUM';
  }

  isReturn(e: EndorsementResponse): boolean {
    return e.premiumAdjustmentType === 'REFUND_PREMIUM';
  }

  openCreateDialog(): void {
    this.dialogError.set(null);
    this.newType = 'CHANGE_SUM_INSURED';
    this.newEffectiveDate = new Date().toISOString().slice(0, 10);
    this.fieldValues = {};
    this.newPremiumAdjType = 'NO_CHANGE';
    this.annualChange = '';
    this.newNetAdj = '';
    this.newStamp = '';
    this.newVat = '';
    this.newTotalAdj = '0.00';
    this.newRemark = '';
    this.createDialogVisible.set(true);
  }

  calcProRata(): void {
    this.calculatingProRata.set(true);
    this.api.calculateProRata(this.policy().id, {
      endorsementDate: this.newEffectiveDate,
      ...(this.annualChange.trim() ? { annualNetPremium: this.annualChange.trim() } : {}),
    }).subscribe({
      next: (res) => {
        this.calculatingProRata.set(false);
        this.newNetAdj = res.proRataNet;
        this.newStamp = res.stampDuty;
        this.newVat = res.vat;
        this.newTotalAdj = res.totalAdjustment;
        this.cdr.markForCheck(); // OnPush: these are plain fields, set outside a template event
        this.toast.add({ severity: 'info', summary: 'คำนวณ Pro-rata สำเร็จ', detail: `คงเหลือ ${res.remainingDays}/${res.totalDays} วัน` });
      },
      error: (e: HttpErrorResponse) => {
        this.calculatingProRata.set(false);
        this.toast.add({ severity: 'error', summary: 'คำนวณไม่สำเร็จ', detail: e.error?.message });
      },
    });
  }

  /** Total = net + stamp duty + VAT, added in whole satang so no float ever touches the money. */
  recalcTotal(): void {
    this.newTotalAdj = formatSatang(toSatang(this.newNetAdj) + toSatang(this.newStamp) + toSatang(this.newVat));
  }

  createEndorsement(): void {
    this.dialogError.set(null);

    const after: Record<string, unknown> = {};
    for (const f of this.fieldSpecs()) {
      const v = (this.fieldValues[f.key] ?? '').trim();
      if (v) after[f.key] = v;
    }
    if (Object.keys(after).length === 0) {
      this.dialogError.set('กรุณากรอกข้อมูลที่ต้องการเปลี่ยนอย่างน้อย 1 รายการ');
      return;
    }
    const before: Record<string, unknown> = this.newType === 'CHANGE_SUM_INSURED' && this.policy().sumInsured ? { sumInsured: this.policy().sumInsured } : {};

    const withPremium = this.newPremiumAdjType !== 'NO_CHANGE';
    if (withPremium && toSatang(this.newNetAdj) <= 0) {
      this.dialogError.set('กรุณาระบุเบี้ยสุทธิที่ปรับปรุง (หรือกด "คำนวณอัตโนมัติ")');
      return;
    }

    const payload: CreateEndorsementDto = {
      type: this.newType,
      effectiveDate: this.newEffectiveDate,
      changes: { before, after },
      premiumAdjustmentType: this.newPremiumAdjType,
      ...(withPremium
        ? {
            netAdjustment: formatSatang(toSatang(this.newNetAdj)),
            stampDuty: formatSatang(toSatang(this.newStamp)),
            vat: formatSatang(toSatang(this.newVat)),
            totalAdjustment: this.newTotalAdj,
          }
        : {}),
      remark: this.newRemark || undefined,
    };

    this.submitting.set(true);
    this.api.createEndorsement(this.policy().id, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.createDialogVisible.set(false);
        this.toast.add({ severity: 'success', summary: 'สร้างคำขอสลักหลังสำเร็จ' });
        this.loadEndorsements();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.dialogError.set(e.error?.message ?? 'เกิดข้อผิดพลาดในการสร้างสลักหลัง');
      },
    });
  }

  submit(id: string): void {
    this.api.submitEndorsement(id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'ส่งขออนุมัติแล้ว' });
        this.loadEndorsements();
      },
      error: (e: HttpErrorResponse) => {
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: e.error?.message });
      },
    });
  }

  startReview(id: string): void {
    this.api.startReview(id).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'เริ่มตรวจสอบแล้ว' }); this.loadEndorsements(); },
      error: (e: HttpErrorResponse) => this.toast.add({ severity: 'error', summary: (e.error as { message?: string } | null)?.message ?? 'ไม่สามารถดำเนินการได้' }),
    });
  }

  approve(id: string): void {
    this.api.approveEndorsement(id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'อนุมัติสลักหลังแล้ว' });
        this.loadEndorsements();
      },
      error: (e: HttpErrorResponse) => {
        this.toast.add({ severity: 'error', summary: 'อนุมัติไม่สำเร็จ', detail: e.error?.message });
      },
    });
  }

  openRejectDialog(e: EndorsementResponse): void {
    this.rejectingEndorsementId = e.id;
    this.rejectReason = '';
    this.rejectDialogVisible.set(true);
  }

  confirmReject(): void {
    this.submitting.set(true);
    this.api.rejectEndorsement(this.rejectingEndorsementId, this.rejectReason).subscribe({
      next: () => {
        this.submitting.set(false);
        this.rejectDialogVisible.set(false);
        this.toast.add({ severity: 'warn', summary: 'ปฏิเสธสลักหลังแล้ว' });
        this.loadEndorsements();
      },
      error: (e: HttpErrorResponse) => {
        this.submitting.set(false);
        this.toast.add({ severity: 'error', summary: 'เกิดข้อผิดพลาด', detail: e.error?.message });
      },
    });
  }

  issue(id: string): void {
    this.api.issueEndorsement(id).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'ออกสลักหลังเรียบร้อยแล้ว' });
        this.loadEndorsements();
      },
      error: (e: HttpErrorResponse) => {
        this.toast.add({ severity: 'error', summary: 'ออกสลักหลังไม่สำเร็จ', detail: e.error?.message });
      },
    });
  }

  viewDetails(e: EndorsementResponse): void {
    this.selectedEndorsement.set(e);
    this.viewDialogVisible.set(true);
  }
}


import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import {
  JobsApi,
  type Job,
  type JobAction,
  type ActivityItem,
  type JobRisk,
  type RiskFieldDef,
  type JobCoverage,
  type JobDocument,
  type DocumentChecklist,
  type AddCoverageDto,
  type Quotation,
  type ComparisonResponse,
  type CompanyColumn,
  type ProposalResponse,
  type ApprovalInProposal,
  type PreconditionCheck,
  type BindingResponse,
  type PolicyResponse,
  type PaymentListResponse,
  type CreatePaymentDto,
  type PaymentRecord,
  type CommissionListResponse,
  type CreateCommissionDto,
  type CommissionType,
  type TaskRecord,
  type TaskType,
  type TaskPriority,
  type PaymentMethod,
  type RenewalReference,
} from '../data/jobs.api';
import { MasterApi, type InsuranceCoverage, type InsuranceCompany } from '../../master/data/master.api';
import { MessageService, UiButton, UiDialog, UiInput, UiMessage, UiSelect, UiTab, UiTabList, UiTabPanel, UiTabPanels, UiTabs, UiTimeline } from '../../../shared/ui';
import { MatTooltip } from '@angular/material/tooltip';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';

const ACTION_LABELS: Record<JobAction, string> = {
  submit: 'ส่งงาน (Submit)',
  requestInfo: 'ขอข้อมูลเพิ่มเติม',
  resume: 'ดำเนินการต่อ',
  cancel: 'ยกเลิกงาน',
  close: 'ปิดงาน',
  requestQuotation: 'ขอใบเสนอราคา',
  recordQuotation: 'บันทึกราคา',
  selectQuotation: 'เลือกราคา',
  sendProposal: 'ส่งใบเสนอ',
  acceptProposal: 'ยอมรับข้อเสนอ',
  rejectProposal: 'ปฏิเสธข้อเสนอ',
  approve: 'อนุมัติ',
  bind: 'ออกกรมธรรม์',
  issuePolicy: 'ยืนยันกรมธรรม์',
};

const ACTION_ICONS: Record<JobAction, string> = {
  submit: 'pi pi-send',
  requestInfo: 'pi pi-question-circle',
  resume: 'pi pi-play',
  cancel: 'pi pi-times',
  close: 'pi pi-check-circle',
  requestQuotation: 'pi pi-plus',
  recordQuotation: 'pi pi-pencil',
  selectQuotation: 'pi pi-check',
  sendProposal: 'pi pi-send',
  acceptProposal: 'pi pi-check',
  rejectProposal: 'pi pi-times',
  approve: 'pi pi-check',
  bind: 'pi pi-file',
  issuePolicy: 'pi pi-verified',
};

const ACTIONS_REQUIRING_REASON: JobAction[] = ['cancel'];

const DOC_TYPE_OPTIONS = [
  { label: 'บัตรประชาชน', value: 'ID_CARD' },
  { label: 'หนังสือจดทะเบียนบริษัท', value: 'COMPANY_REGISTRATION' },
  { label: 'เอกสารภาษี', value: 'TAX_DOCUMENT' },
  { label: 'เล่มทะเบียนรถ', value: 'VEHICLE_BOOK' },
  { label: 'กรมธรรม์เดิม', value: 'PREVIOUS_POLICY' },
  { label: 'ภาพถ่ายรถ', value: 'VEHICLE_PHOTO' },
  { label: 'รายงานสำรวจภัย', value: 'RISK_SURVEY' },
  { label: 'ใบเสนอราคา', value: 'QUOTATION' },
  { label: 'ใบเสนอ', value: 'PROPOSAL' },
  { label: 'กรมธรรม์', value: 'POLICY' },
  { label: 'ใบแจ้งหนี้', value: 'INVOICE' },
  { label: 'ใบเสร็จ', value: 'RECEIPT' },
  { label: 'อื่นๆ', value: 'OTHER' },
];

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPE_OPTIONS.map((o) => [o.value, o.label]));

interface RecordItem {
  coverageName: string;
  sumInsured: string;
  rate: string;
  deductible: string;
  premium: string;
  remark: string;
}

@Component({
  selector: 'app-job-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatTooltip, FormsModule, ReactiveFormsModule, UiButton, UiTabs, UiTabList, UiTab, UiTabPanels, UiTabPanel, UiDialog, UiInput, UiTimeline, UiMessage, UiSelect, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, MoneyPipe, HasPermissionDirective],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (job()) {

      <app-page-header [title]="job()!.jobNo" subtitle="งานประกัน">
        <ui-button label="ย้อนกลับ" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" size="small" (onClick)="goBack()" />
        <app-status-badge [status]="job()!.status" />
      </app-page-header>

      <!-- Job summary card + action bar -->
      <div class="job-header-card">
        <div class="info-row">
          <div class="info-item">
            <span class="info-label">ลูกค้า</span>
            <span class="info-value">{{ job()!.customerName }}</span>
            <span class="info-sub">{{ job()!.customerCode }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">ประเภทประกัน</span>
            <span class="info-value">{{ job()!.insuranceTypeName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">ผลิตภัณฑ์</span>
            <span class="info-value">{{ job()!.productName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">เจ้าหน้าที่</span>
            <span class="info-value">{{ job()!.agentName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">วันเริ่มคุ้มครอง</span>
            <span class="info-value">{{ job()!.effectiveDate | thDate }}</span>
          </div>
          @if (job()!.expiryDate) {
            <div class="info-item">
              <span class="info-label">วันสิ้นสุดคุ้มครอง</span>
              <span class="info-value">{{ job()!.expiryDate | thDate }}</span>
            </div>
          }
        </div>

        @if (job()!.allowedActions.length > 0) {
          <div class="action-bar">
            @for (act of job()!.allowedActions; track act) {
              <ui-button
                [label]="actionLabel(act)"
                [icon]="actionIcon(act)"
                [severity]="act === 'cancel' ? 'danger' : act === 'close' ? 'secondary' : 'primary'"
                [outlined]="act === 'cancel' || act === 'close'"
                size="small"
                [loading]="executing() === act"
                [disabled]="!!executing()"
                (onClick)="onAction(act)"
              />
            }
          </div>
        }

        @if (actionError()) {
          <ui-message severity="error" class="mt-2 block">{{ actionError() }}</ui-message>
        }
      </div>

      <!-- UiTabs -->
      <ui-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
        <ui-tablist>
          <ui-tab [value]="0">ข้อมูลงาน</ui-tab>
          <ui-tab [value]="1">ข้อมูลความเสี่ยง</ui-tab>
          <ui-tab [value]="2">ความคุ้มครอง</ui-tab>
          <ui-tab [value]="3">เอกสาร</ui-tab>
          <ui-tab [value]="4">ประวัติ</ui-tab>
          <ui-tab [value]="5">ใบเสนอราคา</ui-tab>
          <ui-tab [value]="6">เปรียบเทียบ</ui-tab>
          <ui-tab [value]="7">ใบเสนอ</ui-tab>
          <ui-tab [value]="8">อนุมัติ</ui-tab>
          <ui-tab [value]="9">Binding</ui-tab>
          <ui-tab [value]="10">กรมธรรม์</ui-tab>
          <ui-tab [value]="11">การชำระเงิน</ui-tab>
          <ui-tab [value]="12">ค่าคอมมิชชัน</ui-tab>
          <ui-tab [value]="13">งาน</ui-tab>
        </ui-tablist>

        <ui-tabpanels>

          <!-- UiTab 0: Info -->
          <ui-tabpanel [value]="0">
            <div class="info-grid">
              <div class="info-item"><span class="info-label">เลขงาน</span><span class="info-value">{{ job()!.jobNo }}</span></div>
              <div class="info-item"><span class="info-label">สถานะ</span><span class="info-value"><app-status-badge [status]="job()!.status" /></span></div>
              <div class="info-item"><span class="info-label">ความสำคัญ</span><span class="info-value">{{ priorityLabel(job()!.priority) }}</span></div>
              @if (job()!.source) {
                <div class="info-item"><span class="info-label">แหล่งที่มา</span><span class="info-value">{{ job()!.source }}</span></div>
              }
              <div class="info-item"><span class="info-label">วันที่สร้าง</span><span class="info-value">{{ job()!.createdAt | thDate }}</span></div>
              <div class="info-item"><span class="info-label">แก้ไขล่าสุด</span><span class="info-value">{{ job()!.updatedAt | thDate }}</span></div>
              @if (job()!.remark) {
                <div class="info-item info-item-full"><span class="info-label">หมายเหตุ</span><span class="info-value">{{ job()!.remark }}</span></div>
              }
            </div>

            @if (renewalRef(); as ref) {
              <div class="renewal-ref">
                <div class="renewal-ref-title"><i class="pi pi-refresh"></i> ต่ออายุจากกรมธรรม์เดิม (ข้อมูลอ้างอิง)</div>
                <div class="info-grid">
                  <div class="info-item"><span class="info-label">กรมธรรม์เดิม</span><span class="info-value"><a [routerLink]="['/jobs', ref.previousJobId]">{{ ref.previousPolicyNo }}</a> ({{ ref.previousJobNo }})</span></div>
                  <div class="info-item"><span class="info-label">บริษัทประกันเดิม</span><span class="info-value">{{ ref.insuranceCompanyName }}</span></div>
                  <div class="info-item"><span class="info-label">เบี้ยรวมเดิม</span><span class="info-value">{{ ref.totalPremium | money }} บาท</span></div>
                  <div class="info-item"><span class="info-label">ระยะเวลาเดิม</span><span class="info-value">{{ ref.effectiveDate | thDate }} – {{ ref.expiryDate | thDate }}</span></div>
                </div>
              </div>
            }
          </ui-tabpanel>

          <!-- UiTab 1: Risk -->
          <ui-tabpanel [value]="1">
            @if (riskState() === 'loading') {
              <app-state state="loading" />
            } @else if (risk()) {
              @if (risk()!.fieldDefs.length === 0) {
                <app-state state="empty" emptyMessage="ผลิตภัณฑ์นี้ไม่มีข้อมูลความเสี่ยง" />
              } @else {
                @if (riskError()) {
                  <ui-message severity="error" class="mb-3 block">{{ riskError() }}</ui-message>
                }
                <div class="risk-form">
                  @for (field of risk()!.fieldDefs; track field.fieldCode) {
                    <div class="field">
                      <label [for]="'risk-' + field.fieldCode">
                        {{ field.fieldName }}
                        @if (field.isRequired) { <span class="required">*</span> }
                      </label>

                      @if (field.fieldType === 'SELECT') {
                        <ui-select class="w-full"
                          [inputId]="'risk-' + field.fieldCode"
                          [options]="getSelectOptions(field)"
                          [(ngModel)]="riskValues[field.fieldCode]"
                          [disabled]="!canEditRisk()"
                          placeholder="เลือก..."
                         
                        />
                      } @else if (field.fieldType === 'BOOLEAN') {
                        <ui-select class="w-full"
                          [inputId]="'risk-' + field.fieldCode"
                          [options]="boolOptions"
                          optionLabel="label"
                          optionValue="value"
                          [(ngModel)]="riskValues[field.fieldCode]"
                          [disabled]="!canEditRisk()"
                         
                        />
                      } @else if (field.fieldType === 'DATE') {
                        <input
                          uiInput
                          [id]="'risk-' + field.fieldCode"
                          type="date"
                          [(ngModel)]="riskValues[field.fieldCode]"
                          [disabled]="!canEditRisk()"
                          class="w-full"
                        />
                      } @else if (field.fieldType === 'NUMBER') {
                        <input
                          uiInput
                          [id]="'risk-' + field.fieldCode"
                          type="number"
                          [(ngModel)]="riskValues[field.fieldCode]"
                          [disabled]="!canEditRisk()"
                          class="w-full"
                        />
                      } @else {
                        <input
                          uiInput
                          [id]="'risk-' + field.fieldCode"
                          [(ngModel)]="riskValues[field.fieldCode]"
                          [disabled]="!canEditRisk()"
                          class="w-full"
                        />
                      }
                    </div>
                  }
                </div>
                @if (canEditRisk()) {
                  <div class="form-actions">
                    <ui-button label="บันทึกข้อมูลความเสี่ยง" icon="pi pi-save" [loading]="savingRisk()" [disabled]="savingRisk()" (onClick)="saveRisk()" />
                  </div>
                }
              }
            }
          </ui-tabpanel>

          <!-- UiTab 2: Coverage -->
          <ui-tabpanel [value]="2">
            @if (coverageState() === 'loading') {
              <app-state state="loading" />
            } @else {
              @if (canEditRisk()) {
                <div class="tab-action-bar">
                  <ui-button label="เพิ่มความคุ้มครอง" icon="pi pi-plus" size="small" (onClick)="openAddCoverage()" />
                </div>
              }
              @if (coverages().length === 0) {
                <app-state state="empty" emptyMessage="ยังไม่มีความคุ้มครอง" />
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>รหัส</th>
                      <th>ชื่อความคุ้มครอง</th>
                      <th style="width:140px;text-align:right">วงเงินคุ้มครอง</th>
                      <th style="width:120px;text-align:right">ค่าลดหย่อน</th>
                      <th>หมายเหตุ</th>
                      <th style="width:80px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (cov of coverages(); track cov.id) {
                      <tr>
                        @if (editingCoverageId() === cov.id) {
                          <td>{{ cov.coverageCode }}</td>
                          <td>{{ cov.coverageName }}</td>
                          <td><input uiInput [(ngModel)]="editCovSumInsured" class="w-full" placeholder="0.00" /></td>
                          <td><input uiInput [(ngModel)]="editCovDeductible" class="w-full" placeholder="0.00" /></td>
                          <td><input uiInput [(ngModel)]="editCovRemark" class="w-full" /></td>
                          <td>
                            <div class="row-actions">
                              <ui-button icon="pi pi-check" severity="success" [text]="true" size="small" [loading]="savingCoverage()" (onClick)="saveCoverage(cov)" />
                              <ui-button icon="pi pi-times" severity="danger" [text]="true" size="small" (onClick)="cancelEditCoverage()" />
                            </div>
                          </td>
                        } @else {
                          <td>{{ cov.coverageCode }}</td>
                          <td>{{ cov.coverageName }}</td>
                          <td style="text-align:right">{{ cov.sumInsured | money }}</td>
                          <td style="text-align:right">{{ cov.deductible | money }}</td>
                          <td>{{ cov.remark ?? '-' }}</td>
                          <td>
                            @if (canEditRisk()) {
                              <div class="row-actions">
                                <ui-button icon="pi pi-pencil" severity="secondary" [text]="true" size="small" (onClick)="startEditCoverage(cov)" />
                                <ui-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="removeCoverage(cov)" />
                              </div>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </ui-tabpanel>

          <!-- UiTab 3: Documents -->
          <ui-tabpanel [value]="3">
            @if (docState() === 'loading') {
              <app-state state="loading" />
            } @else {
              <!-- Checklist -->
              @if (checklist()?.required?.length) {
                <div class="checklist-section">
                  <h4 class="section-title">รายการเอกสารที่ต้องใช้</h4>
                  <div class="checklist-grid">
                    @for (item of checklist()!.required; track item.documentType) {
                      @if (item.isRequired) {
                        <div class="checklist-item" [class.uploaded]="isDocUploaded(item.documentType)" [class.missing]="!isDocUploaded(item.documentType)">
                          <i [class]="isDocUploaded(item.documentType) ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
                          <span>{{ docTypeLabel(item.documentType) }}</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              }

              <!-- Upload area -->
              @if (canManageDocs()) {
                <div class="upload-section">
                  <h4 class="section-title">อัปโหลดเอกสาร</h4>
                  <div class="upload-row">
                    <ui-select
                      [(ngModel)]="uploadDocType"
                      [options]="docTypeOptions"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="เลือกประเภทเอกสาร"
                      style="width:220px"
                    />
                    <ui-button label="เลือกไฟล์" icon="pi pi-upload" severity="secondary" size="small" (onClick)="fileInput.click()" />
                    <input #fileInput type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" (change)="onFileSelected($event)" />
                    @if (uploading()) {
                      <span class="upload-status"><i class="pi pi-spin pi-spinner"></i> กำลังอัปโหลด...</span>
                    }
                  </div>
                </div>
              }

              <!-- Document list -->
              @if (documents().length === 0) {
                <app-state state="empty" emptyMessage="ยังไม่มีเอกสาร" />
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ประเภท</th>
                      <th>ชื่อไฟล์</th>
                      <th style="width:80px">ขนาด</th>
                      <th style="width:50px">รุ่น</th>
                      <th style="width:130px">อัปโหลดเมื่อ</th>
                      <th style="width:130px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (doc of documents(); track doc.id) {
                      <tr>
                        <td>{{ docTypeLabel(doc.documentType) }}</td>
                        <td>
                          <button type="button" class="doc-name-btn" (click)="openPreview(doc)" matTooltip="คลิกเพื่อดูตัวอย่าง">
                            <i [class]="getDocIcon(doc.mimeType, doc.originalName)" class="doc-type-icon"></i>
                            <span class="doc-name-text">{{ doc.originalName }}</span>
                          </button>
                        </td>
                        <td>{{ formatSize(doc.size) }}</td>
                        <td>{{ doc.version }}</td>
                        <td>{{ doc.createdAt | thDate }}</td>
                        <td>
                          <div class="row-actions">
                            <ui-button icon="pi pi-eye" severity="secondary" [text]="true" size="small" matTooltip="ดูตัวอย่างเอกสาร" (onClick)="openPreview(doc)" />
                            <ui-button icon="pi pi-download" severity="secondary" [text]="true" size="small" matTooltip="ดาวน์โหลด" (onClick)="downloadDoc(doc)" />
                            @if (canManageDocs()) {
                              <ui-button icon="pi pi-trash" severity="danger" [text]="true" size="small" matTooltip="ลบเอกสาร" (onClick)="deleteDoc(doc)" />
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </ui-tabpanel>

          <!-- UiTab 4: UiTimeline -->
          <ui-tabpanel [value]="4">
            @if (activitiesState() === 'loading') {
              <app-state state="loading" />
            } @else if (activities().length === 0) {
              <app-state state="empty" emptyMessage="ยังไม่มีประวัติการดำเนินงาน" />
            } @else {
              <ui-timeline [value]="activities()" styleClass="pt-2">
                <ng-template #content let-item>
                  <div class="activity-item">
                    <div class="activity-time">{{ item.occurredAt | thDate }}</div>
                    <div class="activity-text">{{ activityLabel(item) }}</div>
                  </div>
                </ng-template>
                <ng-template #marker let-item>
                  <span class="tl-marker" [class.status-change]="item.type === 'STATUS_CHANGE'">
                    <i [class]="item.type === 'STATUS_CHANGE' ? 'pi pi-refresh' : 'pi pi-circle-fill'"></i>
                  </span>
                </ng-template>
              </ui-timeline>
            }
          </ui-tabpanel>

          <!-- UiTab 5: Quotations -->
          <ui-tabpanel [value]="5">
            @if (quotationState() === 'loading') {
              <app-state state="loading" />
            } @else {
              @if (hasDuplicateCompanies()) {
                <ui-message severity="warn" class="mb-3">
                  พบใบเสนอราคาที่มีบริษัทประกันภัยซ้ำกันในงานนี้ คุณสามารถกดปุ่ม "ลบ" เพื่อลบใบที่ซ้ำออกได้
                </ui-message>
              }
              @if (canManageQuotation()) {
                <div class="tab-action-bar">
                  <ui-button label="ขอราคา" icon="pi pi-plus" size="small" (onClick)="openRequestQuotation()" />
                </div>
              }
              @if (quotations().length === 0) {
                <app-state state="empty" emptyMessage="ยังไม่มีใบเสนอราคา" />
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>บริษัทประกัน</th>
                      <th>เลขที่ใบเสนอ</th>
                      <th>สถานะ</th>
                      <th style="text-align:right">เบี้ยสุทธิ</th>
                      <th style="text-align:right">รวมทั้งสิ้น</th>
                      <th>วันหมดอายุ</th>
                      <th style="width:160px;text-align:right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (q of quotations(); track q.id) {
                      <tr [class.quo-selected]="q.status === 'SELECTED'" [class.quo-duplicate]="isDuplicateQuotation(q)">
                        <td>
                          <div class="quo-company-cell">
                            <span>{{ q.insuranceCompanyName }}</span>
                            @if (isDuplicateQuotation(q)) {
                              <span class="badge-duplicate" title="มีบริษัทประกันนี้ซ้ำในงานนี้">
                                <i class="pi pi-exclamation-triangle"></i> ซ้ำ
                              </span>
                            }
                          </div>
                        </td>
                        <td>{{ q.quotationNo }}</td>
                        <td><app-status-badge [status]="q.status" /></td>
                        <td style="text-align:right">{{ q.netPremium | money }}</td>
                        <td style="text-align:right">{{ q.totalAmount | money }}</td>
                        <td>{{ q.validUntil ? (q.validUntil | thDate) : '-' }}</td>
                        <td style="text-align:right;white-space:nowrap">
                          <div class="quo-action-btns">
                            @if (q.status === 'REQUESTED' && canManageQuotation()) {
                              <ui-button label="บันทึกราคา" icon="pi pi-pencil" size="small" severity="secondary" [outlined]="true" (onClick)="openRecordPrice(q)" />
                            }
                            @if (canDeleteQuotation(q)) {
                              <ui-button
                                label="ลบ"
                                icon="pi pi-trash"
                                size="small"
                                severity="danger"
                                [outlined]="true"
                                [loading]="deletingQuoTarget()?.id === q.id && isDeletingQuo()"
                                [disabled]="isDeletingQuo()"
                                (onClick)="openDeleteQuotation(q)"
                              />
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </ui-tabpanel>

          <!-- UiTab 6: Comparison -->
          <ui-tabpanel [value]="6">
            @if (comparisonState() === 'loading') {
              <app-state state="loading" />
            } @else if (!comparison() || comparison()!.companies.length === 0) {
              <app-state state="empty" emptyMessage="ยังไม่มีข้อมูลราคาที่บันทึกแล้ว" />
            } @else {
              <div class="comparison-wrapper">
                <table class="comparison-table">
                  <thead>
                    <tr>
                      <th class="cov-col">ความคุ้มครอง</th>
                      @for (c of comparison()!.companies; track c.quotationId) {
                        <th [class.cheapest-col]="isCheapest(c.quotationId)">
                          <div class="comp-company">{{ c.insuranceCompanyName }}</div>
                          <div class="comp-quo-no">{{ c.quotationNo }}</div>
                          <div class="comp-total">รวม {{ c.totalAmount | money }}</div>
                          <app-status-badge [status]="c.status" />
                          @if (c.status === 'RECEIVED' && canManageQuotation()) {
                            <ui-button label="เลือก" size="small" icon="pi pi-check" styleClass="mt-1 w-full" (onClick)="openSelectQuotation(c)" />
                          }
                          @if (c.status === 'SELECTED') {
                            <div class="selected-mark"><i class="pi pi-check-circle"></i> เลือกแล้ว</div>
                          }
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of comparison()!.coverages; track row.coverageName) {
                      <tr>
                        <td>{{ row.coverageName }}</td>
                        @for (cell of row.cells; let i = $index; track i) {
                          <td [class.cheapest-col]="isCheapest(comparison()!.companies[i].quotationId)">
                            @if (cell.premium) {
                              <div class="cell-sum">{{ cell.sumInsured | money }}</div>
                              <div class="cell-premium">฿{{ cell.premium | money }}</div>
                              @if (cell.deductible) {
                                <div class="cell-ded">ลดหย่อน {{ cell.deductible | money }}</div>
                              }
                            } @else {
                              <span class="text-secondary">-</span>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ui-tabpanel>

          <!-- UiTab 7: Proposal -->
          <ui-tabpanel [value]="7">
            @if (proposalState() === 'loading') {
              <app-state state="loading" />
            } @else {
              @if (job()!.allowedActions.includes('sendProposal') && proposals().length === 0) {
                <div class="tab-action-bar">
                  <ui-button label="สร้างใบเสนอ" icon="pi pi-plus" size="small" (onClick)="openCreateProposal()" />
                </div>
              }
              @if (proposals().length === 0) {
                <app-state state="empty" emptyMessage="ยังไม่มีใบเสนอ" />
              } @else {
                @for (prop of proposals(); track prop.id) {
                  <div class="proposal-card">
                    <div class="proposal-header">
                      <div class="proposal-info">
                        <span class="proposal-no">{{ prop.proposalNo }}</span>
                        <app-status-badge [status]="prop.status" />
                      </div>
                      <div class="proposal-actions">
                        <ui-button *appHasPermission="'proposal.view'" [label]="prop.status === 'DRAFT' ? 'ดาวน์โหลด PDF (ฉบับร่าง)' : 'ดาวน์โหลด PDF'"
                          size="small" icon="pi pi-file-pdf" severity="secondary" [outlined]="true"
                          [loading]="downloadingProposalId() === prop.id" (onClick)="downloadProposalPdf(prop)" />
                        @if (prop.status === 'DRAFT' && job()!.allowedActions.includes('sendProposal')) {
                          <ui-button label="ส่งใบเสนอ" size="small" icon="pi pi-send" [loading]="sendingProposal()" (onClick)="doSendProposal(prop)" />
                        }
                        @if (prop.status === 'SENT' || prop.status === 'VIEWED') {
                          @if (job()!.allowedActions.includes('acceptProposal')) {
                            <ui-button label="ยอมรับ" size="small" severity="success" icon="pi pi-check" [loading]="acceptingProposal()" (onClick)="doAcceptProposal(prop)" />
                          }
                          @if (job()!.allowedActions.includes('rejectProposal')) {
                            <ui-button label="ปฏิเสธ" size="small" severity="danger" [outlined]="true" icon="pi pi-times" (onClick)="openRejectProposal(prop)" />
                          }
                        }
                      </div>
                    </div>
                    <div class="proposal-meta">
                      @if (prop.validUntil) {
                        <span class="meta-item"><i class="pi pi-calendar"></i> ถึงวันที่ {{ prop.validUntil | thDate }}</span>
                      }
                      @if (prop.sentAt) {
                        <span class="meta-item"><i class="pi pi-send"></i> ส่งเมื่อ {{ prop.sentAt | thDate }}</span>
                      }
                      @if (prop.acceptedAt) {
                        <span class="meta-item text-success"><i class="pi pi-check-circle"></i> ยอมรับเมื่อ {{ prop.acceptedAt | thDate }}</span>
                      }
                      @if (prop.rejectedAt) {
                        <span class="meta-item text-danger"><i class="pi pi-times-circle"></i> ปฏิเสธเมื่อ {{ prop.rejectedAt | thDate }}</span>
                      }
                      @if (prop.rejectReason) {
                        <span class="meta-item text-danger">เหตุผล: {{ prop.rejectReason }}</span>
                      }
                    </div>
                    @if (proposalError()) {
                      <ui-message severity="error" class="mt-2 block">{{ proposalError() }}</ui-message>
                    }
                  </div>
                }
              }
            }
          </ui-tabpanel>

          <!-- UiTab 8: Approval -->
          <ui-tabpanel [value]="8">
            @if (proposalState() === 'loading') {
              <app-state state="loading" />
            } @else {
              @let appr = currentApprovals();
              @if (appr.length === 0) {
                <app-state state="empty" emptyMessage="ไม่มีรายการอนุมัติสำหรับงานนี้" />
              } @else {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ประเภทอนุมัติ</th>
                      <th>สถานะ</th>
                      <th>วันที่ขอ</th>
                      <th>วันที่อนุมัติ/ปฏิเสธ</th>
                      <th>เหตุผล</th>
                      <th style="width:120px"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of appr; track a.id) {
                      <tr>
                        <td>{{ a.approvalType }}</td>
                        <td><app-status-badge [status]="a.status" /></td>
                        <td>{{ a.requestedAt | thDate }}</td>
                        <td>{{ (a.approvedAt ?? a.rejectedAt) ? ((a.approvedAt ?? a.rejectedAt)! | thDate) : '-' }}</td>
                        <td>{{ a.reason ?? '-' }}</td>
                        <td>
                          @if (a.canDecide && job()!.allowedActions.includes('approve')) {
                            <div class="row-actions">
                              <ui-button label="อนุมัติ" icon="pi pi-check" size="small" severity="success" [loading]="approvingId() === a.id" (onClick)="doApprove(a)" />
                              <ui-button label="ปฏิเสธ" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="openRejectApproval(a)" />
                            </div>
                          } @else if (a.status === 'PENDING') {
                            <small class="text-secondary">รอผู้อนุมัติท่านอื่น</small>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                @if (approvalError()) {
                  <ui-message severity="error" class="mt-2 block">{{ approvalError() }}</ui-message>
                }
              }
            }
          </ui-tabpanel>

          <!-- UiTab 9: Binding -->
          <ui-tabpanel [value]="9">
            @if (preconditionState() === 'loading') {
              <app-state state="loading" />
            } @else {
              <div class="binding-section">
                <h4 class="section-title">เงื่อนไขก่อนออกกรมธรรม์</h4>
                @if (preconditions().length > 0) {
                  <div class="checklist-grid">
                    @for (c of preconditions(); track c.code) {
                      <div class="checklist-item" [class.uploaded]="c.met" [class.missing]="!c.met">
                        <i [class]="c.met ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
                        <span>{{ c.label }}</span>
                        @if (c.details) { <span class="meta-text">({{ c.details }})</span> }
                      </div>
                    }
                  </div>
                }
                @if (binding()) {
                  <div class="binding-result">
                    <ui-message severity="success">Binding สำเร็จ — {{ binding()!.bindingDate | thDate }}</ui-message>
                  </div>
                } @else if (job()!.allowedActions.includes('bind')) {
                  <div class="form-actions" style="margin-top:1rem">
                    <div class="field" style="max-width:320px">
                      <label for="bind-remark">หมายเหตุ (ไม่บังคับ)</label>
                      <input uiInput id="bind-remark" [(ngModel)]="bindRemark" class="w-full" />
                    </div>
                    @if (bindError()) {
                      <ui-message severity="error" class="my-2 block">{{ bindError() }}</ui-message>
                    }
                    <ui-button
                      label="ออกกรมธรรม์ (Bind)"
                      icon="pi pi-shield"
                      [loading]="binding_() "
                      [disabled]="binding_()"
                      (onClick)="doBind()"
                      styleClass="mt-2"
                    />
                  </div>
                }
              </div>
            }
          </ui-tabpanel>

          <!-- UiTab 10: Policy -->
          <ui-tabpanel [value]="10">
            @if (policyState() === 'loading') {
              <app-state state="loading" />
            } @else if (!policy()) {
              @if (job()!.allowedActions.includes('issuePolicy')) {
                <div class="form-actions">
                  <div class="field" style="max-width:320px">
                    <label for="policy-remark">หมายเหตุ (ไม่บังคับ)</label>
                    <input uiInput id="policy-remark" [(ngModel)]="issuePolicyRemark" class="w-full" />
                  </div>
                  @if (policyError()) {
                    <ui-message severity="error" class="my-2 block">{{ policyError() }}</ui-message>
                  }
                  <ui-button
                    label="ยืนยันกรมธรรม์"
                    icon="pi pi-check-circle"
                    [loading]="issuingPolicy()"
                    [disabled]="issuingPolicy()"
                    (onClick)="doIssuePolicy()"
                    styleClass="mt-2"
                  />
                </div>
              } @else {
                <app-state state="empty" emptyMessage="ยังไม่มีกรมธรรม์" />
              }
            } @else {
              <div class="policy-card">
                <div class="policy-header">
                  <h3 class="policy-no">{{ policy()!.policyNo }}</h3>
                  <app-status-badge [status]="policy()!.status" />
                </div>
                <div class="info-grid" style="margin-top:1rem">
                  <div class="info-item"><span class="info-label">วันเริ่มคุ้มครอง</span><span class="info-value">{{ policy()!.effectiveDate | thDate }}</span></div>
                  @if (policy()!.expiryDate) {
                    <div class="info-item"><span class="info-label">วันสิ้นสุด</span><span class="info-value">{{ policy()!.expiryDate | thDate }}</span></div>
                  }
                  <div class="info-item"><span class="info-label">เบี้ยสุทธิ</span><span class="info-value">{{ policy()!.netPremium | money }}</span></div>
                  <div class="info-item"><span class="info-label">รวมทั้งสิ้น</span><span class="info-value">{{ policy()!.totalPremium | money }}</span></div>
                  @if (policy()!.issuedAt) {
                    <div class="info-item"><span class="info-label">ออกเมื่อ</span><span class="info-value">{{ policy()!.issuedAt | thDate }}</span></div>
                  }
                </div>
                @if (policy()!.coverages.length > 0) {
                  <h4 class="section-title" style="margin-top:1.5rem">ความคุ้มครอง</h4>
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>ความคุ้มครอง</th>
                        <th style="text-align:right">วงเงิน</th>
                        <th style="text-align:right">เบี้ยประกัน</th>
                        <th style="text-align:right">ค่าลดหย่อน</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (c of policy()!.coverages; track c.id) {
                        <tr>
                          <td>{{ c.coverageName }}</td>
                          <td style="text-align:right">{{ c.sumInsured | money }}</td>
                          <td style="text-align:right">{{ c.premium | money }}</td>
                          <td style="text-align:right">{{ c.deductible | money }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
            }
          </ui-tabpanel>

          <!-- UiTab 11: Payment -->
          <ui-tabpanel [value]="11">
            @if (paymentState() === 'loading') {
              <app-state state="loading" />
            } @else if (paymentState() === 'error') {
              <app-state state="error" />
            } @else if (!policy()) {
              <app-state state="empty" emptyMessage="ต้องออกกรมธรรม์ก่อนบันทึกการชำระเงิน" />
            } @else {
              <div class="section-header">
                <div class="payment-summary">
                  <span class="info-label">ยอดชำระแล้ว: </span>
                  <strong>{{ (paymentData()?.totalPaid ?? '0') | money }}</strong>
                  &nbsp;/&nbsp;{{ policy()!.totalPremium | money }}
                  @if (paymentData()?.paymentStatus) {
                    <app-status-badge [status]="paymentData()!.paymentStatus" />
                  }
                </div>
              </div>

              <!-- Add payment form -->
              <div class="add-form">
                <h4 class="section-title">บันทึกการชำระเงิน</h4>
                <div class="form-row">
                  <div class="field">
                    <label>จำนวนเงิน <span class="required">*</span></label>
                    <input uiInput type="text" [(ngModel)]="payAmount" placeholder="0.00" style="max-width:160px" />
                  </div>
                  <div class="field">
                    <label>วิธีชำระ <span class="required">*</span></label>
                    <ui-select class="w-full" [(ngModel)]="payMethod" [options]="payMethodOptions" optionLabel="label" optionValue="value" placeholder="เลือก" style="max-width:180px" />
                  </div>
                  <div class="field">
                    <label>วันที่ชำระ</label>
                    <input uiInput type="date" [(ngModel)]="payDate" style="max-width:160px" />
                  </div>
                  <div class="field">
                    <label>เลขอ้างอิง</label>
                    <input uiInput type="text" [(ngModel)]="payRef" style="max-width:180px" />
                  </div>
                </div>
                @if (payError()) {
                  <ui-message severity="error" class="my-2 block">{{ payError() }}</ui-message>
                }
                <ui-button label="บันทึก" icon="pi pi-plus" [loading]="savingPayment()" [disabled]="savingPayment()" (onClick)="doAddPayment()" styleClass="mt-2" />
              </div>

              <!-- Payment list -->
              @if ((paymentData()?.payments ?? []).length > 0) {
                <table class="data-table" style="margin-top:1rem">
                  <thead>
                    <tr>
                      <th>เลขที่</th>
                      <th>วันที่</th>
                      <th style="text-align:right">จำนวนเงิน</th>
                      <th>วิธีชำระ</th>
                      <th>สถานะ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of paymentData()!.payments; track p.id) {
                      <tr>
                        <td>{{ p.paymentNo }}</td>
                        <td>{{ p.paymentDate | thDate }}</td>
                        <td style="text-align:right">{{ p.amount | money }}</td>
                        <td>{{ p.paymentMethod }}</td>
                        <td><app-status-badge [status]="p.status" /></td>
                        <td>
                          @if (p.status === 'ACTIVE') {
                            <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" size="small" [text]="true" (onClick)="doCancelPayment(p)" />
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <app-state state="empty" emptyMessage="ยังไม่มีการชำระเงิน" />
              }
            }
          </ui-tabpanel>

          <!-- UiTab 12: Commission -->
          <ui-tabpanel [value]="12">
            @if (commissionState() === 'loading') {
              <app-state state="loading" />
            } @else if (commissionState() === 'error') {
              <app-state state="error" />
            } @else if (!policy()) {
              <app-state state="empty" emptyMessage="ต้องออกกรมธรรม์ก่อนคำนวณค่าคอมมิชชัน" />
            } @else {
              <!-- Add commission form -->
              <div class="add-form">
                <h4 class="section-title">คำนวณค่าคอมมิชชัน</h4>
                <div class="form-row">
                  <div class="field">
                    <label>ประเภทคอมมิชชัน <span class="required">*</span></label>
                    <ui-select class="w-full" [(ngModel)]="commType" [options]="commTypeOptions" optionLabel="label" optionValue="value" placeholder="เลือก" style="max-width:200px" />
                  </div>
                  <div class="field">
                    <label>ฐานคำนวณ <span class="required">*</span></label>
                    <input uiInput type="text" [(ngModel)]="commBase" placeholder="0.00" style="max-width:160px" />
                  </div>
                  <div class="field">
                    <label>อัตรา (%) <span class="required">*</span></label>
                    <input uiInput type="text" [(ngModel)]="commRate" placeholder="0.00" style="max-width:120px" />
                  </div>
                </div>
                @if (commBase && commRate) {
                  <small class="commission-preview">จำนวนที่คำนวณ: {{ calcCommissionPreview() }}</small>
                }
                @if (commError()) {
                  <ui-message severity="error" class="my-2 block">{{ commError() }}</ui-message>
                }
                <ui-button label="บันทึก" icon="pi pi-calculator" [loading]="savingCommission()" [disabled]="savingCommission()" (onClick)="doAddCommission()" styleClass="mt-2" />
              </div>

              <!-- Commission list -->
              @if ((commissionData()?.items ?? []).length > 0) {
                <table class="data-table" style="margin-top:1rem">
                  <thead>
                    <tr>
                      <th>ประเภท</th>
                      <th style="text-align:right">ฐาน</th>
                      <th style="text-align:right">อัตรา (%)</th>
                      <th style="text-align:right">จำนวน</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of commissionData()!.items; track c.id) {
                      <tr>
                        <td>{{ c.commissionType }}</td>
                        <td style="text-align:right">{{ c.commissionBase | money }}</td>
                        <td style="text-align:right">{{ c.commissionRate | money }}</td>
                        <td style="text-align:right">{{ c.commissionAmount | money }}</td>
                        <td><app-status-badge [status]="c.status" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <app-state state="empty" emptyMessage="ยังไม่มีค่าคอมมิชชัน" />
              }
            }
          </ui-tabpanel>

          <!-- UiTab 13: Tasks -->
          <ui-tabpanel [value]="13">
            @if (taskState() === 'loading') {
              <app-state state="loading" />
            } @else if (taskState() === 'error') {
              <app-state state="error" />
            } @else {
              <!-- Add task form -->
              <div class="add-form">
                <h4 class="section-title">สร้างงาน</h4>
                <div class="form-row">
                  <div class="field">
                    <label>ประเภทงาน <span class="required">*</span></label>
                    <ui-select class="w-full" [(ngModel)]="taskType" [options]="taskTypeOptions" optionLabel="label" optionValue="value" placeholder="เลือก" style="max-width:220px" />
                  </div>
                  <div class="field" style="flex:1">
                    <label>หัวข้อ <span class="required">*</span></label>
                    <input uiInput type="text" [(ngModel)]="taskSubject" placeholder="หัวข้องาน" class="w-full" />
                  </div>
                  <div class="field">
                    <label>กำหนด</label>
                    <input uiInput type="date" [(ngModel)]="taskDueDate" style="max-width:160px" />
                  </div>
                  <div class="field">
                    <label>ความสำคัญ</label>
                    <ui-select class="w-full" [(ngModel)]="taskPriority" [options]="taskPriorityOptions" optionLabel="label" optionValue="value" style="max-width:130px" />
                  </div>
                </div>
                <ui-button label="สร้างงาน" icon="pi pi-plus" size="small" (onClick)="doAddTask()" [loading]="savingTask()" [disabled]="!taskSubject || !taskType" />
                @if (taskError()) { <small class="error-msg">{{ taskError() }}</small> }
              </div>

              @if (taskData().length > 0) {
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>ประเภท</th>
                      <th>หัวข้อ</th>
                      <th>กำหนด</th>
                      <th>ความสำคัญ</th>
                      <th>สถานะ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (task of taskData(); track task.id) {
                      <tr [class.overdue-row]="task.overdue">
                        <td>{{ taskTypeLabel(task.taskType) }}</td>
                        <td>{{ task.subject }}</td>
                        <td>{{ task.dueDate ? (task.dueDate | thDate) : '-' }} @if (task.overdue) { <span class="badge-overdue">เกินกำหนด</span> }</td>
                        <td><app-status-badge [status]="task.priority" /></td>
                        <td><app-status-badge [status]="task.status" /></td>
                        <td>
                          @if (task.status === 'TODO' || task.status === 'IN_PROGRESS') {
                            <ui-button label="เสร็จ" icon="pi pi-check" size="small" severity="success" [outlined]="true" class="mr-1" (onClick)="doCompleteTask(task)" />
                            <ui-button icon="pi pi-times" aria-label="ยกเลิกงาน" size="small" severity="danger" [outlined]="true" (onClick)="doCancelTask(task)" />
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <app-state state="empty" emptyMessage="ยังไม่มีงานในงานนี้" />
              }
            }
          </ui-tabpanel>

        </ui-tabpanels>
      </ui-tabs>
    }

    <!-- Cancel / Reason UiDialog -->
    <ui-dialog
      [(visible)]="showReasonDialog"
      [header]="reasonDialogTitle()"
      icon="pi pi-exclamation-triangle"
      [modal]="true"
      [style]="{ width: '420px' }"
      [closable]="!executing()"
    >
      <div class="reason-form">
        <label for="reason-text">เหตุผล <span class="required">*</span></label>
        <textarea uiInput id="reason-text" [(ngModel)]="reasonText" rows="4" class="w-full" placeholder="กรอกเหตุผล..."></textarea>
        @if (reasonError()) {
          <small class="error-text">{{ reasonError() }}</small>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeReasonDialog()" [disabled]="!!executing()" />
        <ui-button
          [label]="reasonDialogTitle()"
          icon="pi pi-check"
          severity="danger"
          (onClick)="confirmAction()"
          [loading]="!!executing()"
          [disabled]="!!executing()"
        />
      </ng-template>
    </ui-dialog>

    <!-- Add Coverage UiDialog -->
    <ui-dialog
      [(visible)]="showAddCoverageDialog"
      header="เพิ่มความคุ้มครอง"
      icon="pi pi-shield"
      [modal]="true"
      [style]="{ width: '480px' }"
    >
      <div class="add-cov-form">
        <div class="field">
          <label for="add-cov-select">ความคุ้มครอง <span class="required">*</span></label>
          <ui-select class="w-full"
            inputId="add-cov-select"
            [(ngModel)]="addCovId"
            [options]="availableCoverages()"
            optionLabel="name"
            optionValue="id"
            placeholder="เลือกความคุ้มครอง"
           
          />
        </div>
        <div class="field">
          <label for="add-cov-sum">วงเงินคุ้มครอง</label>
          <input uiInput id="add-cov-sum" [(ngModel)]="addCovSumInsured" class="w-full" placeholder="0.00" />
        </div>
        <div class="field">
          <label for="add-cov-ded">ค่าลดหย่อน</label>
          <input uiInput id="add-cov-ded" [(ngModel)]="addCovDeductible" class="w-full" placeholder="0.00" />
        </div>
        <div class="field">
          <label for="add-cov-rem">หมายเหตุ</label>
          <input uiInput id="add-cov-rem" [(ngModel)]="addCovRemark" class="w-full" />
        </div>
        @if (addCovError()) {
          <ui-message severity="error">{{ addCovError() }}</ui-message>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeAddCoverage()" [disabled]="savingCoverage()" />
        <ui-button label="เพิ่ม" icon="pi pi-plus" (onClick)="confirmAddCoverage()" [loading]="savingCoverage()" [disabled]="savingCoverage()" />
      </ng-template>
    </ui-dialog>

    <!-- Request Quotation UiDialog -->
    <ui-dialog
      [(visible)]="showRequestQuoDialog"
      header="ขอใบเสนอราคา"
      icon="pi pi-send"
      [modal]="true"
      [style]="{ width: '480px' }"
    >
      <div class="dialog-form">
        <div class="field">
          <label for="req-company">บริษัทประกัน <span class="required">*</span></label>
          @if (availableCompanies().length === 0 && companies().length > 0) {
            <ui-message severity="info">ขอใบเสนอราคาครบทุกบริษัทประกันแล้ว</ui-message>
          } @else {
            <ui-select class="w-full"
              inputId="req-company"
              [(ngModel)]="reqCompanyId"
              [options]="availableCompanies()"
              optionLabel="name"
              optionValue="id"
              placeholder="เลือกบริษัท"
            />
          }
        </div>
        <div class="field">
          <label for="req-gross">เบี้ยรวม (เริ่มต้น) <span class="required">*</span></label>
          <input uiInput id="req-gross" [(ngModel)]="reqGross" class="w-full" placeholder="0.00" />
        </div>
        <div class="field">
          <label for="req-discount">ส่วนลด</label>
          <input uiInput id="req-discount" [(ngModel)]="reqDiscount" class="w-full" placeholder="0.00" />
        </div>
        <div class="field">
          <label for="req-valid">วันหมดอายุใบเสนอ</label>
          <input uiInput id="req-valid" type="date" [(ngModel)]="reqValidUntil" class="w-full" />
        </div>
        <div class="field">
          <label for="req-remark">หมายเหตุ</label>
          <input uiInput id="req-remark" [(ngModel)]="reqRemark" class="w-full" />
        </div>
        @if (reqError()) {
          <ui-message severity="error">{{ reqError() }}</ui-message>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeRequestQuotation()" [disabled]="savingReqQuo()" />
        <ui-button label="ส่งคำขอ" icon="pi pi-send" (onClick)="confirmRequestQuotation()" [loading]="savingReqQuo()" [disabled]="savingReqQuo() || (availableCompanies().length === 0 && companies().length > 0)" />
      </ng-template>
    </ui-dialog>

    <!-- Record Price UiDialog -->
    <ui-dialog
      [(visible)]="showRecordPriceDialog"
      header="บันทึกราคา"
      icon="pi pi-calculator"
      [modal]="true"
      [style]="{ width: '720px' }"
    >
      <div class="dialog-form">
        <div class="field-row">
          <div class="field">
            <label for="rec-gross">เบี้ยรวม <span class="required">*</span></label>
            <input uiInput id="rec-gross" [(ngModel)]="recGross" class="w-full" placeholder="0.00" />
          </div>
          <div class="field">
            <label for="rec-discount">ส่วนลด</label>
            <input uiInput id="rec-discount" [(ngModel)]="recDiscount" class="w-full" placeholder="0.00" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="rec-quo-date">วันที่ใบเสนอ</label>
            <input uiInput id="rec-quo-date" type="date" [(ngModel)]="recQuoDate" class="w-full" />
          </div>
          <div class="field">
            <label for="rec-valid">วันหมดอายุ</label>
            <input uiInput id="rec-valid" type="date" [(ngModel)]="recValidUntil" class="w-full" />
          </div>
        </div>
        <div class="field">
          <label for="rec-remark">หมายเหตุ</label>
          <input uiInput id="rec-remark" [(ngModel)]="recRemark" class="w-full" />
        </div>

        <!-- Items editor -->
        <div class="items-section">
          <div class="items-header">
            <span class="section-title">รายการความคุ้มครอง</span>
            <ui-button label="เพิ่มรายการ" icon="pi pi-plus" size="small" severity="secondary" (onClick)="addRecordItem()" />
          </div>
          @if (recItems.length > 0) {
            <table class="data-table items-table">
              <thead>
                <tr>
                  <th>ชื่อความคุ้มครอง</th>
                  <th>วงเงิน</th>
                  <th>เบี้ยประกัน</th>
                  <th>ค่าลดหย่อน</th>
                  <th style="width:40px"></th>
                </tr>
              </thead>
              <tbody>
                @for (item of recItems; let i = $index; track i) {
                  <tr>
                    <td><input uiInput [(ngModel)]="item.coverageName" class="w-full" placeholder="ชื่อความคุ้มครอง" /></td>
                    <td><input uiInput [(ngModel)]="item.sumInsured" class="w-full" placeholder="0.00" /></td>
                    <td><input uiInput [(ngModel)]="item.premium" class="w-full" placeholder="0.00" /></td>
                    <td><input uiInput [(ngModel)]="item.deductible" class="w-full" placeholder="0.00" /></td>
                    <td><ui-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="removeRecordItem(i)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        @if (recError()) {
          <ui-message severity="error">{{ recError() }}</ui-message>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeRecordPrice()" [disabled]="savingRecord()" />
        <ui-button label="บันทึกราคา" icon="pi pi-save" (onClick)="confirmRecordPrice()" [loading]="savingRecord()" [disabled]="savingRecord()" />
      </ng-template>
    </ui-dialog>

    <!-- Delete Quotation Confirmation UiDialog -->
    <ui-dialog
      [(visible)]="showDeleteQuoDialog"
      header="ยืนยันการลบใบเสนอราคา"
      icon="pi pi-trash"
      [modal]="true"
      [style]="{ width: '480px' }"
    >
      @if (deletingQuoTarget(); as quo) {
        <div class="dialog-form">
          <div style="padding: 0.75rem 1rem; border-radius: 6px; background-color: #fef2f2; border: 1px solid #fecaca; color: #991b1b; display: flex; flex-direction: column; gap: 0.25rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
              <i class="pi pi-exclamation-triangle" style="color: #dc2626;"></i>
              <span>คุณแน่ใจหรือไม่ว่าต้องการลบใบเสนอราคานี้?</span>
            </div>
            @if (isDuplicateQuotation(quo)) {
              <div style="font-size: 0.8rem; color: #b91c1c; padding-left: 1.5rem;">
                รายการนี้เป็นใบเสนอราคาที่มีบริษัทประกันภัยซ้ำในงานนี้
              </div>
            }
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem; background: var(--surface-ground, #f8fafc); padding: 0.75rem 1rem; border-radius: 6px; border: 1px solid var(--surface-border, #e2e8f0); margin-top: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="text-secondary" style="font-size: 0.875rem;">เลขที่ใบเสนอราคา</span>
              <span style="font-weight: 600;">{{ quo.quotationNo }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="text-secondary" style="font-size: 0.875rem;">บริษัทประกันภัย</span>
              <span style="font-weight: 500;">{{ quo.insuranceCompanyName }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="text-secondary" style="font-size: 0.875rem;">สถานะ</span>
              <app-status-badge [status]="quo.status" />
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="text-secondary" style="font-size: 0.875rem;">เบี้ยรวมทั้งสิ้น</span>
              <span style="font-weight: 600; color: var(--primary-color, #0284c7);">{{ quo.totalAmount | money }}</span>
            </div>
          </div>

          <div style="color: var(--text-color-secondary, #64748b); font-size: 0.8rem; margin-top: 0.25rem;">
            * เมื่อยืนยันการลบแล้ว ข้อมูลใบเสนอราคานี้จะถูกลบออกจากระบบและไม่สามารถกู้คืนได้
          </div>
        </div>
      }
      <ng-template #footer>
        <ui-button
          label="ยกเลิก"
          icon="pi pi-times"
          severity="danger"
          [outlined]="true"
          (onClick)="closeDeleteQuotation()"
          [disabled]="isDeletingQuo()"
        />
        <ui-button
          label="ยืนยันการลบ"
          icon="pi pi-trash"
          severity="danger"
          (onClick)="doDeleteQuotation()"
          [loading]="isDeletingQuo()"
          [disabled]="isDeletingQuo()"
        />
      </ng-template>
    </ui-dialog>

    <!-- UiSelect Quotation UiDialog -->
    <ui-dialog
      [(visible)]="showSelectQuoDialog"
      header="เลือกใบเสนอราคา"
      icon="pi pi-check-circle"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      <div class="dialog-form">
        @if (selectingCompany()) {
          <div class="select-quo-info">
            <div class="info-item"><span class="info-label">บริษัท</span><span class="info-value">{{ selectingCompany()!.insuranceCompanyName }}</span></div>
            <div class="info-item"><span class="info-label">รวมทั้งสิ้น</span><span class="info-value">{{ selectingCompany()!.totalAmount | money }}</span></div>
          </div>
        }
        <div class="field">
          <label for="select-reason">เหตุผลในการเลือก <span class="required">*</span></label>
          <textarea uiInput id="select-reason" [(ngModel)]="selectReason" rows="3" class="w-full" placeholder="กรอกเหตุผล..."></textarea>
        </div>
        @if (selectError()) {
          <ui-message severity="error">{{ selectError() }}</ui-message>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeSelectQuotation()" [disabled]="selectingQuo()" />
        <ui-button label="ยืนยันเลือก" icon="pi pi-check" (onClick)="confirmSelectQuotation()" [loading]="selectingQuo()" [disabled]="selectingQuo()" />
      </ng-template>
    </ui-dialog>

    <!-- Create Proposal UiDialog -->
    <ui-dialog
      [(visible)]="showCreateProposalDialog"
      header="สร้างใบเสนอ"
      icon="pi pi-file-plus"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      <div class="dialog-form">
        <div class="field">
          <label for="prop-valid">วันหมดอายุใบเสนอ</label>
          <input uiInput id="prop-valid" type="date" [(ngModel)]="propValidUntil" class="w-full" />
        </div>
        <div class="field">
          <label for="prop-remark">หมายเหตุ</label>
          <input uiInput id="prop-remark" [(ngModel)]="propRemark" class="w-full" />
        </div>
        @if (createProposalError()) {
          <ui-message severity="error">{{ createProposalError() }}</ui-message>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" (onClick)="closeCreateProposal()" [disabled]="creatingProposal()" />
        <ui-button label="สร้างใบเสนอ" icon="pi pi-check" (onClick)="confirmCreateProposal()" [loading]="creatingProposal()" [disabled]="creatingProposal()" />
      </ng-template>
    </ui-dialog>

    <!-- Reject Proposal UiDialog -->
    <ui-dialog
      [(visible)]="showRejectProposalDialog"
      header="ปฏิเสธใบเสนอ"
      icon="pi pi-times-circle"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      <div class="reason-form">
        <label for="reject-prop-reason">เหตุผล <span class="required">*</span></label>
        <textarea uiInput id="reject-prop-reason" [(ngModel)]="rejectProposalReason" rows="4" class="w-full" placeholder="กรอกเหตุผล..."></textarea>
        @if (rejectProposalError()) {
          <small class="error-text">{{ rejectProposalError() }}</small>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="closeRejectProposal()" [disabled]="rejectingProposal()" />
        <ui-button label="ปฏิเสธ" icon="pi pi-times" severity="danger" (onClick)="confirmRejectProposal()" [loading]="rejectingProposal()" [disabled]="rejectingProposal()" />
      </ng-template>
    </ui-dialog>

    <!-- Reject Approval UiDialog -->
    <ui-dialog
      [(visible)]="showRejectApprovalDialog"
      header="ปฏิเสธการอนุมัติ"
      icon="pi pi-times-circle"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      <div class="reason-form">
        <label for="reject-appr-reason">เหตุผล <span class="required">*</span></label>
        <textarea uiInput id="reject-appr-reason" [(ngModel)]="rejectApprovalReason" rows="4" class="w-full" placeholder="กรอกเหตุผล..."></textarea>
        @if (rejectApprovalError()) {
          <small class="error-text">{{ rejectApprovalError() }}</small>
        }
      </div>
      <ng-template #footer>
        <ui-button label="ยกเลิก" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="closeRejectApproval()" [disabled]="rejectingApproval()" />
        <ui-button label="ปฏิเสธ" icon="pi pi-times" severity="danger" (onClick)="confirmRejectApproval()" [loading]="rejectingApproval()" [disabled]="rejectingApproval()" />
      </ng-template>
    </ui-dialog>

    <!-- Document Preview UiDialog -->
    <ui-dialog
      [(visible)]="showPreviewDialog"
      [header]="previewDialogTitle()"
      icon="pi pi-file"
      [modal]="true"
      [style]="{ width: '900px', maxWidth: '95vw' }"
      (visibleChange)="onPreviewVisibleChange($event)"
    >
      <div class="doc-preview-modal-body">
        @if (previewLoading()) {
          <div class="preview-loading-state">
            <app-state state="loading" loadingMessage="กำลังโหลดเอกสาร..." />
          </div>
        } @else if (previewError()) {
          <div class="preview-error-state">
            <i class="pi pi-exclamation-triangle preview-warn-icon"></i>
            <p class="preview-error-msg">{{ previewError() }}</p>
            <ui-button label="ลองใหม่อีกครั้ง" icon="pi pi-refresh" severity="secondary" size="small" (onClick)="retryPreview()" class="mt-2" />
          </div>
        } @else if (previewingDoc(); as doc) {
          <!-- Document Info Bar -->
          <div class="doc-preview-meta-bar">
            <div class="meta-item">
              <span class="meta-label">ประเภท:</span>
              <span class="meta-value">{{ docTypeLabel(doc.documentType) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">ขนาด:</span>
              <span class="meta-value">{{ formatSize(doc.size) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">เวอร์ชัน:</span>
              <span class="meta-value">v{{ doc.version }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">อัปโหลดเมื่อ:</span>
              <span class="meta-value">{{ doc.createdAt | thDate }}</span>
            </div>
          </div>

          <!-- Document Viewer Area -->
          <div class="doc-preview-content">
            @if (isPdf(doc.mimeType, doc.originalName)) {
              @if (previewSafeUrl) {
                <iframe
                  [src]="previewSafeUrl"
                  class="preview-iframe"
                  title="PDF Preview"
                ></iframe>
              }
            } @else if (isImage(doc.mimeType, doc.originalName)) {
              <div class="preview-image-wrapper">
                <img [src]="currentBlobUrl" [alt]="doc.originalName" class="preview-image" />
              </div>
            } @else {
              <div class="preview-unsupported">
                <i class="pi pi-file preview-unsupported-icon"></i>
                <p class="preview-unsupported-title">ไม่สามารถแสดงตัวอย่างไฟล์ประเภทนี้ในเบราว์เซอร์ได้โดยตรง</p>
                <p class="preview-unsupported-desc">กรุณาดาวน์โหลดไฟล์เพื่อเปิดด้วยโปรแกรมในเครื่องของคุณ</p>
                <ui-button label="ดาวน์โหลดไฟล์" icon="pi pi-download" severity="primary" (onClick)="downloadDoc(doc)" class="mt-2" />
              </div>
            }
          </div>
        }
      </div>
      <ng-template #footer>
        <div class="preview-dialog-footer">
          @if (currentBlobUrl) {
            <ui-button label="เปิดในแท็บใหม่" icon="pi pi-external-link" severity="secondary" [outlined]="true" (onClick)="openInNewTab()" />
          }
          @if (previewingDoc(); as doc) {
            <ui-button label="ดาวน์โหลด" icon="pi pi-download" severity="primary" (onClick)="downloadDoc(doc)" />
          }
          <ui-button label="ปิด" icon="pi pi-times" severity="secondary" (onClick)="closePreview()" />
        </div>
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .job-header-card {
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .info-row { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 0.5rem; }
    .info-item { display: flex; flex-direction: column; gap: 0.2rem; min-width: 130px; }
    .info-item-full { grid-column: 1 / -1; }
    .info-label { font-size: 0.72rem; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
    .info-value { font-size: 0.9rem; font-weight: 500; }
    .info-sub { font-size: 0.78rem; color: var(--text-color-secondary); }
    .action-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--surface-border); }
    .renewal-ref { margin-top: 1rem; padding: 0.75rem 1rem; background: var(--surface-ground); border: 1px solid var(--surface-border); border-radius: 8px; }
    .renewal-ref-title { font-weight: 600; font-size: 0.875rem; }
    .renewal-ref .info-grid { padding: 0.5rem 0 0; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; padding: 1rem 0; }
    .risk-form { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; padding: 1rem 0; max-width: 800px; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .required { color: var(--red-500); }
    .form-actions { margin-top: 1rem; display: flex; justify-content: flex-start; }
    .tab-action-bar { margin-bottom: 1rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.5rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .data-table tr:hover td { background: var(--surface-hover); }
    .row-actions { display: flex; gap: 0.25rem; }
    .checklist-section, .upload-section { margin-bottom: 1.25rem; }
    .section-title { font-size: 0.9rem; font-weight: 600; color: var(--primary-color); margin-bottom: 0.75rem; }
    .checklist-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .checklist-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.875rem; }
    .checklist-item.uploaded { background: var(--green-50); color: var(--green-700); }
    .checklist-item.missing { background: var(--red-50); color: var(--red-700); }
    .upload-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .upload-status { font-size: 0.875rem; color: var(--text-color-secondary); }
    .activity-item { padding: 0.25rem 0; }
    .activity-time { font-size: 0.78rem; color: var(--text-color-secondary); }
    .activity-text { font-size: 0.875rem; }
    .tl-marker { display: flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: var(--surface-border); color: var(--text-color-secondary); font-size: 0.7rem; }
    .tl-marker.status-change { background: var(--primary-color); color: white; }
    .reason-form { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem 0; }
    .error-text { color: var(--red-500); font-size: 0.8rem; }
    .add-cov-form { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0; }
    .dialog-form { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .items-section { margin-top: 0.5rem; }
    .items-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .items-table input { font-size: 0.85rem; padding: 0.25rem 0.5rem; height: 2rem; }
    .select-quo-info { display: flex; gap: 1.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--surface-border); margin-bottom: 0.5rem; }
    .comparison-wrapper { overflow-x: auto; }
    .comparison-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .comparison-table th { padding: 0.75rem; background: var(--surface-ground); border: 1px solid var(--surface-border); text-align: center; vertical-align: top; min-width: 180px; }
    .comparison-table td { padding: 0.5rem 0.75rem; border: 1px solid var(--surface-border); vertical-align: top; }
    .cov-col { text-align: left !important; min-width: 160px; }
    .cheapest-col { background: var(--green-50); }
    .comp-company { font-weight: 600; font-size: 0.9rem; }
    .comp-quo-no { font-size: 0.78rem; color: var(--text-color-secondary); margin-bottom: 0.25rem; }
    .comp-total { font-size: 0.875rem; font-weight: 500; color: var(--primary-color); margin-bottom: 0.25rem; }
    .selected-mark { color: var(--green-600); font-size: 0.875rem; margin-top: 0.25rem; }
    .cell-sum { font-size: 0.78rem; color: var(--text-color-secondary); }
    .cell-premium { font-weight: 500; }
    .cell-ded { font-size: 0.78rem; color: var(--orange-600); }
    .text-secondary { color: var(--text-color-secondary); }
    .proposal-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .proposal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .proposal-info { display: flex; align-items: center; gap: 0.75rem; }
    .proposal-no { font-weight: 600; font-size: 0.95rem; }
    .proposal-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .proposal-meta { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.82rem; color: var(--text-color-secondary); }
    .meta-item { display: flex; align-items: center; gap: 0.35rem; }
    .meta-text { font-size: 0.8rem; color: var(--text-color-secondary); }
    .text-success { color: var(--green-600); }
    .text-danger { color: var(--red-600); }
    .binding-section { padding: 0.5rem 0; }
    .binding-result { margin-top: 1rem; }
    .policy-card { padding: 0.5rem 0; }
    .policy-header { display: flex; align-items: center; gap: 0.75rem; }
    .policy-no { font-size: 1.1rem; font-weight: 600; margin: 0; }
    .my-2 { margin: 0.5rem 0; }
    .mt-2 { margin-top: 0.5rem; }
    .overdue-row td { color: var(--red-700); }
    .badge-overdue { display: inline-block; background: var(--red-100); color: var(--red-700); font-size: 0.7rem; font-weight: 600; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
    /* Document Table & Preview */
    .doc-name-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: none;
      border: none;
      padding: 0;
      color: var(--primary-color, #2563eb);
      cursor: pointer;
      font-size: 0.875rem;
      text-align: left;
      font-weight: 500;
      transition: color 0.15s ease;
    }
    .doc-name-btn:hover {
      text-decoration: underline;
      color: var(--primary-700, #1d4ed8);
    }
    .doc-type-icon {
      font-size: 1.1rem;
      flex-shrink: 0;
    }
    .doc-preview-modal-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 400px;
    }
    .doc-preview-meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      padding: 0.75rem 1rem;
      background: var(--surface-ground, #f8fafc);
      border-radius: 6px;
      font-size: 0.85rem;
      border: 1px solid var(--surface-border, #e2e8f0);
    }
    .doc-preview-meta-bar .meta-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .doc-preview-meta-bar .meta-label {
      color: var(--text-color-secondary, #64748b);
      font-weight: 500;
    }
    .doc-preview-meta-bar .meta-value {
      font-weight: 600;
      color: var(--text-color, #1e293b);
    }
    .doc-preview-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 520px;
      background: var(--surface-50, #f8fafc);
      border: 1px solid var(--surface-border, #e2e8f0);
      border-radius: 6px;
      overflow: hidden;
    }
    .preview-iframe {
      width: 100%;
      height: 70vh;
      min-height: 520px;
      border: none;
      display: block;
    }
    .preview-image-wrapper {
      max-height: 70vh;
      overflow: auto;
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .preview-image {
      max-width: 100%;
      max-height: 68vh;
      object-fit: contain;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }
    .preview-loading-state,
    .preview-error-state,
    .preview-unsupported {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
    }
    .preview-warn-icon {
      font-size: 2.5rem;
      color: var(--red-500, #ef4444);
    }
    .preview-error-msg {
      margin-top: 0.5rem;
      color: var(--red-500, #ef4444);
      font-weight: 500;
    }
    .preview-unsupported-icon {
      font-size: 3rem;
      color: var(--text-color-secondary, #94a3b8);
    }
    .preview-unsupported-title {
      margin-top: 0.5rem;
      font-weight: 500;
      font-size: 1rem;
    }
    .preview-unsupported-desc {
      margin-top: 0.25rem;
      font-size: 0.85rem;
      color: var(--text-color-secondary, #64748b);
    }
    .preview-dialog-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      width: 100%;
    }
  `],
})
export class JobDetailPage implements OnInit, OnDestroy {
  private readonly api = inject(JobsApi);
  private readonly masterApi = inject(MasterApi);
  private readonly toast = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('fileInput') fileInputEl!: ElementRef<HTMLInputElement>;

  readonly id = input.required<string>();

  // ─── Page state ──────────────────────────────────────────────────────────
  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  readonly job = signal<Job | null>(null);
  readonly renewalRef = signal<RenewalReference | null>(null);
  readonly activeTab = signal(0);

  readonly canEditRisk = computed(() => this.job()?.capabilities?.editRisk ?? false);
  readonly canManageDocs = computed(() => this.job()?.capabilities?.manageDocuments ?? false);

  // ─── Workflow actions ─────────────────────────────────────────────────────
  readonly executing = signal<JobAction | null>(null);
  readonly actionError = signal<string | null>(null);
  showReasonDialog = false;
  reasonText = '';
  readonly reasonError = signal<string | null>(null);
  readonly pendingAction = signal<JobAction | null>(null);

  // ─── Risk tab ─────────────────────────────────────────────────────────────
  readonly riskState = signal<'loading' | 'none'>('none');
  readonly risk = signal<JobRisk | null>(null);
  riskValues: Record<string, string | null> = {};
  readonly savingRisk = signal(false);
  readonly riskError = signal<string | null>(null);
  readonly boolOptions = [{ label: 'ใช่', value: 'true' }, { label: 'ไม่ใช่', value: 'false' }];

  // ─── Coverage tab ─────────────────────────────────────────────────────────
  readonly coverageState = signal<'loading' | 'none'>('none');
  readonly coverages = signal<JobCoverage[]>([]);
  readonly availableCoverages = signal<InsuranceCoverage[]>([]);
  readonly editingCoverageId = signal<string | null>(null);
  editCovSumInsured = '';
  editCovDeductible = '';
  editCovRemark = '';
  readonly savingCoverage = signal(false);
  showAddCoverageDialog = false;
  addCovId = '';
  addCovSumInsured = '';
  addCovDeductible = '';
  addCovRemark = '';
  readonly addCovError = signal<string | null>(null);

  // ─── Proposal tab ────────────────────────────────────────────────────────
  readonly proposalState = signal<'loading' | 'none'>('none');
  readonly proposals = signal<ProposalResponse[]>([]);
  showCreateProposalDialog = false;
  propValidUntil = '';
  propRemark = '';
  readonly createProposalError = signal<string | null>(null);
  readonly creatingProposal = signal(false);
  readonly sendingProposal = signal(false);
  readonly downloadingProposalId = signal<string | null>(null);
  readonly acceptingProposal = signal(false);
  showRejectProposalDialog = false;
  rejectingProposalTarget: ProposalResponse | null = null;
  rejectProposalReason = '';
  readonly rejectProposalError = signal<string | null>(null);
  readonly rejectingProposal = signal(false);
  readonly proposalError = signal<string | null>(null);

  // ─── Approval tab ─────────────────────────────────────────────────────────
  readonly currentApprovals = computed<ApprovalInProposal[]>(() => {
    const latestProposal = this.proposals().find((p) => p.approvals.length > 0) ?? this.proposals()[0];
    return latestProposal?.approvals ?? [];
  });
  readonly approvingId = signal<string | null>(null);
  showRejectApprovalDialog = false;
  rejectingApprovalTarget: ApprovalInProposal | null = null;
  rejectApprovalReason = '';
  readonly rejectApprovalError = signal<string | null>(null);
  readonly rejectingApproval = signal(false);
  readonly approvalError = signal<string | null>(null);

  // ─── Binding tab ──────────────────────────────────────────────────────────
  readonly preconditionState = signal<'loading' | 'none'>('none');
  readonly preconditions = signal<PreconditionCheck[]>([]);
  readonly binding = signal<BindingResponse | null>(null);
  readonly binding_ = signal(false);
  bindRemark = '';
  readonly bindError = signal<string | null>(null);

  // ─── Policy tab ───────────────────────────────────────────────────────────
  readonly policyState = signal<'loading' | 'none'>('none');
  readonly policy = signal<PolicyResponse | null>(null);
  readonly issuingPolicy = signal(false);
  issuePolicyRemark = '';
  readonly policyError = signal<string | null>(null);

  // ─── Payment tab ──────────────────────────────────────────────────────────
  readonly paymentState = signal<'loading' | 'error' | 'none'>('none');
  readonly paymentData = signal<PaymentListResponse | null>(null);
  readonly savingPayment = signal(false);
  readonly payError = signal<string | null>(null);
  payAmount = '';
  payMethod: PaymentMethod = 'TRANSFER';
  payDate = '';
  payRef = '';
  readonly payMethodOptions = [
    { label: 'โอนเงิน', value: 'TRANSFER' },
    { label: 'เงินสด', value: 'CASH' },
    { label: 'บัตรเครดิต', value: 'CREDIT_CARD' },
    { label: 'เช็ค', value: 'CHEQUE' },
    { label: 'ออนไลน์', value: 'ONLINE' },
    { label: 'อื่นๆ', value: 'OTHER' },
  ];

  // ─── Commission tab ────────────────────────────────────────────────────────
  readonly commissionState = signal<'loading' | 'error' | 'none'>('none');
  readonly commissionData = signal<CommissionListResponse | null>(null);
  readonly savingCommission = signal(false);
  readonly commError = signal<string | null>(null);
  commType: CommissionType = 'AGENT';
  commBase = '';
  commRate = '';
  readonly commTypeOptions = [
    { label: 'บริษัท', value: 'COMPANY' },
    { label: 'ตัวแทน', value: 'AGENT' },
    { label: 'ทีม', value: 'TEAM' },
    { label: 'ผู้แนะนำ', value: 'REFERRAL' },
    { label: 'อื่นๆ', value: 'OTHER' },
  ];

  // ─── Task tab ─────────────────────────────────────────────────────────────
  readonly taskState = signal<'loading' | 'error' | 'none'>('none');
  readonly taskData = signal<TaskRecord[]>([]);
  readonly savingTask = signal(false);
  readonly taskError = signal<string | null>(null);
  taskType: TaskType = 'OTHER';
  taskSubject = '';
  taskDueDate = '';
  taskPriority: TaskPriority = 'MEDIUM';

  readonly taskTypeOptions = [
    { label: 'โทรติดต่อลูกค้า', value: 'CALL_CUSTOMER' },
    { label: 'ขอเอกสาร', value: 'REQUEST_DOCUMENT' },
    { label: 'ขอใบเสนอราคา', value: 'REQUEST_QUOTATION' },
    { label: 'ติดตามใบเสนอราคา', value: 'FOLLOW_UP_QUOTATION' },
    { label: 'ส่งใบเสนอ', value: 'SEND_PROPOSAL' },
    { label: 'ติดตามลูกค้า', value: 'FOLLOW_UP_CUSTOMER' },
    { label: 'ติดตามการชำระ', value: 'FOLLOW_UP_PAYMENT' },
    { label: 'ติดตามกรมธรรม์', value: 'FOLLOW_UP_POLICY' },
    { label: 'ต่ออายุ', value: 'RENEWAL' },
    { label: 'อื่นๆ', value: 'OTHER' },
  ];

  readonly taskPriorityOptions = [
    { label: 'ต่ำ', value: 'LOW' },
    { label: 'ปกติ', value: 'MEDIUM' },
    { label: 'สูง', value: 'HIGH' },
    { label: 'เร่งด่วน', value: 'URGENT' },
  ];

  private readonly TASK_TYPE_LABELS: Record<string, string> = {
    CALL_CUSTOMER: 'โทรติดต่อลูกค้า', REQUEST_DOCUMENT: 'ขอเอกสาร', REQUEST_QUOTATION: 'ขอใบเสนอราคา',
    FOLLOW_UP_QUOTATION: 'ติดตามใบเสนอราคา', SEND_PROPOSAL: 'ส่งใบเสนอ', FOLLOW_UP_CUSTOMER: 'ติดตามลูกค้า',
    FOLLOW_UP_PAYMENT: 'ติดตามการชำระ', FOLLOW_UP_POLICY: 'ติดตามกรมธรรม์', RENEWAL: 'ต่ออายุ', OTHER: 'อื่นๆ',
  };

  taskTypeLabel(t: string): string { return this.TASK_TYPE_LABELS[t] ?? t; }

  calcCommissionPreview(): string {
    const b = parseFloat(this.commBase);
    const r = parseFloat(this.commRate);
    if (isNaN(b) || isNaN(r)) return '-';
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(b * r / 100);
  }

  // ─── Document tab ─────────────────────────────────────────────────────────
  readonly docState = signal<'loading' | 'none'>('none');
  readonly documents = signal<JobDocument[]>([]);
  readonly checklist = signal<DocumentChecklist | null>(null);
  readonly uploading = signal(false);
  uploadDocType = '';
  readonly docTypeOptions = DOC_TYPE_OPTIONS;

  // Document preview
  showPreviewDialog = false;
  readonly previewingDoc = signal<JobDocument | null>(null);
  readonly previewLoading = signal(false);
  readonly previewError = signal<string | null>(null);
  currentBlobUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;

  // ─── UiTimeline tab ─────────────────────────────────────────────────────────
  readonly activitiesState = signal<'loading' | 'none'>('none');
  readonly activities = signal<ActivityItem[]>([]);

  // ─── Quotation tab ────────────────────────────────────────────────────────
  readonly canManageQuotation = computed(() => this.job()?.capabilities?.manageQuotations ?? false);
  readonly quotationState = signal<'loading' | 'none'>('none');
  readonly quotations = signal<Quotation[]>([]);
  readonly comparisonState = signal<'loading' | 'none'>('none');
  readonly comparison = signal<ComparisonResponse | null>(null);
  readonly companies = signal<InsuranceCompany[]>([]);
  readonly availableCompanies = computed(() => {
    const existingCompanyIds = new Set(this.quotations().map((q) => q.insuranceCompanyId));
    return this.companies().filter((c) => !existingCompanyIds.has(c.id));
  });

  showDeleteQuoDialog = false;
  readonly deletingQuoTarget = signal<Quotation | null>(null);
  readonly isDeletingQuo = signal(false);

  readonly duplicateCompanyIds = computed(() => {
    const counts = new Map<string, number>();
    for (const q of this.quotations()) {
      counts.set(q.insuranceCompanyId, (counts.get(q.insuranceCompanyId) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [companyId, count] of counts.entries()) {
      if (count > 1) dupes.add(companyId);
    }
    return dupes;
  });

  readonly hasDuplicateCompanies = computed(() => this.duplicateCompanyIds().size > 0);

  isDuplicateQuotation(q: Quotation): boolean {
    return this.duplicateCompanyIds().has(q.insuranceCompanyId);
  }

  canDeleteQuotation(q: Quotation): boolean {
    if (!this.canManageQuotation()) return false;
    if (q.status === 'SELECTED' || this.job()?.selectedQuotationId === q.id) return false;
    return true;
  }

  // Request quotation dialog
  showRequestQuoDialog = false;
  reqCompanyId = '';
  reqGross = '';
  reqDiscount = '';
  reqValidUntil = '';
  reqRemark = '';
  readonly reqError = signal<string | null>(null);
  readonly savingReqQuo = signal(false);

  // Record price dialog
  showRecordPriceDialog = false;
  recordingQuo: Quotation | null = null;
  recGross = '';
  recDiscount = '';
  recQuoDate = '';
  recValidUntil = '';
  recRemark = '';
  recItems: RecordItem[] = [];
  readonly recError = signal<string | null>(null);
  readonly savingRecord = signal(false);

  // UiSelect quotation dialog
  showSelectQuoDialog = false;
  readonly selectingCompany = signal<CompanyColumn | null>(null);
  selectReason = '';
  readonly selectError = signal<string | null>(null);
  readonly selectingQuo = signal(false);

  ngOnInit(): void {
    this.loadJob();
  }

  /** Back to the previous page; falls back to the job list when opened directly (no history) */
  goBack(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/jobs']);
  }

  ngOnDestroy(): void {
    this.cleanupBlobUrl();
  }

  onTabChange(tab: number | string | undefined): void {
    const t = Number(tab);
    this.activeTab.set(t);
    if (t === 1 && !this.risk()) this.loadRisk();
    if (t === 2 && this.coverages().length === 0) this.loadCoverages();
    if (t === 3 && this.documents().length === 0 && !this.checklist()) this.loadDocuments();
    if (t === 4 && this.activities().length === 0) this.loadActivities();
    if (t === 5 && this.quotations().length === 0) this.loadQuotations();
    if (t === 6) this.loadComparison();
    if (t === 7 && this.proposals().length === 0) this.loadProposals();
    if (t === 8 && this.proposals().length === 0) this.loadProposals();
    if (t === 9) this.loadPreconditions();
    if (t === 10 && !this.policy()) this.loadPolicy();
    if (t === 11) this.loadPayments();
    if (t === 12) this.loadCommissions();
    if (t === 13) this.loadTasks();
  }

  // ─── Labels ───────────────────────────────────────────────────────────────

  actionLabel(action: JobAction): string { return ACTION_LABELS[action] ?? action; }

  actionIcon(action: JobAction): string { return ACTION_ICONS[action] ?? 'pi pi-cog'; }

  reasonDialogTitle(): string {
    const a = this.pendingAction();
    return a ? ACTION_LABELS[a] : '';
  }

  priorityLabel(p: string): string {
    const m: Record<string, string> = { LOW: 'ต่ำ', NORMAL: 'ปกติ', HIGH: 'สูง', URGENT: 'เร่งด่วน' };
    return m[p] ?? p;
  }

  docTypeLabel(t: string): string { return DOC_TYPE_LABEL[t] ?? t; }

  activityLabel(item: ActivityItem): string {
    if (item.type === 'STATUS_CHANGE') {
      const d = item.data as { from?: string; to?: string; by?: string; reason?: string };
      let s = `เปลี่ยนสถานะ ${d.from ?? ''} → ${d.to ?? ''}`;
      if (d.by) s += ` โดย ${d.by}`;
      if (d.reason) s += ` (${d.reason})`;
      return s;
    }
    const d = item.data as { message?: string; action?: string };
    return d.message ?? d.action ?? JSON.stringify(item.data);
  }

  getSelectOptions(field: RiskFieldDef): string[] {
    if (!field.validationRule) return [];
    try {
      const r = JSON.parse(field.validationRule) as { options?: string[] };
      return r.options ?? [];
    } catch { return []; }
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  isDocUploaded(docType: string): boolean {
    return this.checklist()?.uploaded.some((u) => u.documentType === docType) ?? false;
  }

  downloadUrl(docId: string): string { return this.api.downloadDocumentUrl(docId); }

  // ─── Workflow ─────────────────────────────────────────────────────────────

  onAction(action: JobAction): void {
    this.actionError.set(null);
    // Navigate to the relevant tab for complex actions requiring context
    if (action === 'requestQuotation') {
      // No dedicated endpoint: creating the first quotation moves the job to QUOTATION_REQUESTED
      this.onTabChange(5);
      this.openRequestQuotation();
      return;
    }
    if (action === 'recordQuotation') {
      this.onTabChange(5);
      return;
    }
    if (action === 'selectQuotation') {
      this.onTabChange(6);
      return;
    }
    if (action === 'sendProposal' || action === 'acceptProposal' || action === 'rejectProposal') {
      this.onTabChange(7);
      return;
    }
    if (action === 'approve') {
      this.onTabChange(8);
      return;
    }
    if (action === 'bind') {
      this.onTabChange(9);
      return;
    }
    if (action === 'issuePolicy') {
      this.onTabChange(10);
      return;
    }
    if (ACTIONS_REQUIRING_REASON.includes(action)) {
      this.pendingAction.set(action);
      this.reasonText = '';
      this.reasonError.set(null);
      this.showReasonDialog = true;
      this.cdr.markForCheck();
    } else {
      this.executeAction(action);
    }
  }

  closeReasonDialog(): void {
    this.showReasonDialog = false;
    this.pendingAction.set(null);
    this.cdr.markForCheck();
  }

  confirmAction(): void {
    if (!this.reasonText.trim()) {
      this.reasonError.set('กรุณากรอกเหตุผล');
      return;
    }
    const action = this.pendingAction();
    if (action) {
      this.showReasonDialog = false;
      this.cdr.markForCheck();
      this.executeAction(action, this.reasonText.trim());
    }
  }

  private executeAction(action: JobAction, reason?: string): void {
    this.executing.set(action);
    this.actionError.set(null);

    const body: Record<string, unknown> = {};
    if (reason) body['reason'] = reason;

    this.api.action(this.id(), action, body).subscribe({
      next: (updated) => {
        this.job.set(updated);
        this.executing.set(null);
        this.toast.add({ severity: 'success', summary: 'สำเร็จ', detail: `${ACTION_LABELS[action]}เรียบร้อยแล้ว` });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.executing.set(null);
        const body = e.error as { code?: string; message?: string } | null;
        if (e.status === 409 && body?.code === 'CONCURRENT_MODIFICATION') {
          this.actionError.set('ข้อมูลถูกแก้ไขโดยผู้อื่น กำลังโหลดใหม่...');
          this.loadJob();
        } else {
          this.actionError.set(body?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
      },
    });
  }

  // ─── Risk ─────────────────────────────────────────────────────────────────

  private loadRisk(): void {
    this.riskState.set('loading');
    this.api.getRisk(this.id()).subscribe({
      next: (r) => {
        this.risk.set(r);
        this.riskValues = { ...r.values };
        r.fieldDefs.forEach((f) => {
          if (!(f.fieldCode in this.riskValues)) this.riskValues[f.fieldCode] = null;
        });
        this.riskState.set('none');
      },
      error: () => this.riskState.set('none'),
    });
  }

  saveRisk(): void {
    this.savingRisk.set(true);
    this.riskError.set(null);
    this.api.saveRisk(this.id(), this.riskValues).subscribe({
      next: (r) => {
        this.risk.set(r);
        this.riskValues = { ...r.values };
        this.savingRisk.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกแล้ว', detail: 'ข้อมูลความเสี่ยงบันทึกเรียบร้อย' });
      },
      error: (e: HttpErrorResponse) => {
        this.savingRisk.set(false);
        const body = e.error as { message?: string; errors?: Record<string, string[]> } | null;
        this.riskError.set(body?.message ?? 'ไม่สามารถบันทึกได้');
      },
    });
  }

  // ─── Coverage ─────────────────────────────────────────────────────────────

  private loadCoverages(): void {
    this.coverageState.set('loading');
    this.api.listCoverages(this.id()).subscribe({
      next: (list) => {
        this.coverages.set(list);
        this.coverageState.set('none');
      },
      error: () => this.coverageState.set('none'),
    });
  }

  openAddCoverage(): void {
    this.addCovId = '';
    this.addCovSumInsured = '';
    this.addCovDeductible = '';
    this.addCovRemark = '';
    this.addCovError.set(null);
    const job = this.job();
    if (job && this.availableCoverages().length === 0) {
      this.masterApi.listCoverages(job.productId).subscribe({
        next: (res) => this.availableCoverages.set(res.data),
      });
    }
    this.showAddCoverageDialog = true;
    this.cdr.markForCheck();
  }

  closeAddCoverage(): void {
    this.showAddCoverageDialog = false;
    this.addCovError.set(null);
    this.cdr.markForCheck();
  }

  confirmAddCoverage(): void {
    if (!this.addCovId) { this.addCovError.set('กรุณาเลือกความคุ้มครอง'); return; }
    this.savingCoverage.set(true);
    this.addCovError.set(null);
    const body: AddCoverageDto = {
      coverageId: this.addCovId,
      sumInsured: this.addCovSumInsured || undefined,
      deductible: this.addCovDeductible || undefined,
      remark: this.addCovRemark || undefined,
    };
    this.api.addCoverage(this.id(), body).subscribe({
      next: (cov) => {
        this.coverages.update((list) => [...list, cov]);
        this.savingCoverage.set(false);
        this.showAddCoverageDialog = false;
        this.cdr.markForCheck();
        this.toast.add({ severity: 'success', summary: 'เพิ่มแล้ว', detail: 'เพิ่มความคุ้มครองเรียบร้อย' });
      },
      error: (e: HttpErrorResponse) => {
        this.savingCoverage.set(false);
        const body = e.error as { message?: string } | null;
        this.addCovError.set(body?.message ?? 'ไม่สามารถเพิ่มได้');
      },
    });
  }

  startEditCoverage(cov: JobCoverage): void {
    this.editingCoverageId.set(cov.id);
    this.editCovSumInsured = cov.sumInsured ?? '';
    this.editCovDeductible = cov.deductible ?? '';
    this.editCovRemark = cov.remark ?? '';
  }

  cancelEditCoverage(): void { this.editingCoverageId.set(null); }

  saveCoverage(cov: JobCoverage): void {
    this.savingCoverage.set(true);
    this.api.updateCoverage(this.id(), cov.id, {
      sumInsured: this.editCovSumInsured || undefined,
      deductible: this.editCovDeductible || undefined,
      remark: this.editCovRemark || undefined,
    }).subscribe({
      next: (updated) => {
        this.coverages.update((list) => list.map((c) => c.id === updated.id ? updated : c));
        this.editingCoverageId.set(null);
        this.savingCoverage.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกแล้ว' });
      },
      error: () => { this.savingCoverage.set(false); this.toast.add({ severity: 'error', summary: 'ผิดพลาด' }); },
    });
  }

  removeCoverage(cov: JobCoverage): void {
    if (!confirm(`ลบความคุ้มครอง "${cov.coverageName}" ใช่หรือไม่?`)) return;
    this.api.removeCoverage(this.id(), cov.id).subscribe({
      next: () => {
        this.coverages.update((list) => list.filter((c) => c.id !== cov.id));
        this.toast.add({ severity: 'success', summary: 'ลบแล้ว' });
      },
      error: () => this.toast.add({ severity: 'error', summary: 'ไม่สามารถลบได้' }),
    });
  }

  // ─── Documents ────────────────────────────────────────────────────────────

  private loadDocuments(): void {
    this.docState.set('loading');
    this.api.listDocuments(this.id()).subscribe({
      next: (docs) => {
        this.documents.set(docs);
        this.docState.set('none');
      },
      error: () => this.docState.set('none'),
    });
    this.api.getChecklist(this.id()).subscribe({
      next: (cl) => this.checklist.set(cl),
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.uploadDocType) {
      this.toast.add({ severity: 'warn', summary: 'กรุณาเลือกประเภทเอกสารก่อน' });
      input.value = '';
      return;
    }
    this.uploading.set(true);
    this.api.uploadDocument(this.id(), this.uploadDocType, file).subscribe({
      next: (doc) => {
        this.documents.update((list) => [...list, doc]);
        this.uploading.set(false);
        this.toast.add({ severity: 'success', summary: 'อัปโหลดสำเร็จ', detail: doc.originalName });
        this.api.getChecklist(this.id()).subscribe({ next: (cl) => this.checklist.set(cl) });
        input.value = '';
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        const body = e.error as { message?: string } | null;
        this.toast.add({ severity: 'error', summary: 'อัปโหลดไม่สำเร็จ', detail: body?.message ?? 'เกิดข้อผิดพลาด' });
        input.value = '';
      },
    });
  }

  deleteDoc(doc: JobDocument): void {
    if (!confirm(`ลบเอกสาร "${doc.originalName}" ใช่หรือไม่?`)) return;
    this.api.deleteDocument(doc.id).subscribe({
      next: () => {
        this.documents.update((list) => list.filter((d) => d.id !== doc.id));
        this.toast.add({ severity: 'success', summary: 'ลบแล้ว' });
        this.api.getChecklist(this.id()).subscribe({ next: (cl) => this.checklist.set(cl) });
      },
      error: () => this.toast.add({ severity: 'error', summary: 'ไม่สามารถลบได้' }),
    });
  }

  openPreview(doc: JobDocument): void {
    this.previewingDoc.set(doc);
    this.previewError.set(null);
    this.previewLoading.set(true);
    this.showPreviewDialog = true;
    this.cleanupBlobUrl();
    this.cdr.markForCheck();

    this.api.downloadDocumentBlob(doc.id).subscribe({
      next: (blob) => {
        const mime = blob.type || doc.mimeType || 'application/octet-stream';
        const typedBlob = new Blob([blob], { type: mime });
        const url = URL.createObjectURL(typedBlob);
        this.currentBlobUrl = url;
        this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.previewLoading.set(false);
      },
      error: () => {
        this.previewLoading.set(false);
        this.previewError.set('ไม่สามารถโหลดเอกสารเพื่อแสดงตัวอย่างได้');
      },
    });
  }

  retryPreview(): void {
    const doc = this.previewingDoc();
    if (doc) {
      this.openPreview(doc);
    }
  }

  closePreview(): void {
    this.showPreviewDialog = false;
    this.cleanupBlobUrl();
    this.previewingDoc.set(null);
    this.cdr.markForCheck();
  }

  onPreviewVisibleChange(visible: boolean): void {
    if (!visible) {
      this.cleanupBlobUrl();
      this.previewingDoc.set(null);
      this.cdr.markForCheck();
    }
  }

  private cleanupBlobUrl(): void {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.previewSafeUrl = null;
  }

  openInNewTab(): void {
    if (this.currentBlobUrl) {
      window.open(this.currentBlobUrl, '_blank');
    }
  }

  downloadDoc(doc: JobDocument): void {
    this.api.downloadDocumentBlob(doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalName || `document-${doc.id}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.toast.add({ severity: 'error', summary: 'ไม่สามารถดาวน์โหลดไฟล์ได้' });
      },
    });
  }

  isImage(mimeType?: string, fileName?: string): boolean {
    const m = mimeType?.toLowerCase() ?? '';
    const name = fileName?.toLowerCase() ?? '';
    return m.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name);
  }

  isPdf(mimeType?: string, fileName?: string): boolean {
    const m = mimeType?.toLowerCase() ?? '';
    const name = fileName?.toLowerCase() ?? '';
    return m === 'application/pdf' || name.endsWith('.pdf');
  }

  getDocIcon(mimeType?: string, fileName?: string): string {
    if (this.isPdf(mimeType, fileName)) return 'pi pi-file-pdf text-red-500';
    if (this.isImage(mimeType, fileName)) return 'pi pi-image text-blue-500';
    const name = fileName?.toLowerCase() ?? '';
    if (/\.(doc|docx)$/i.test(name)) return 'pi pi-file-word text-blue-600';
    if (/\.(xls|xlsx|csv)$/i.test(name)) return 'pi pi-file-excel text-green-600';
    return 'pi pi-file text-gray-500';
  }

  previewDialogTitle(): string {
    const doc = this.previewingDoc();
    return doc ? `ตัวอย่างเอกสาร: ${doc.originalName}` : 'ตัวอย่างเอกสาร';
  }

  // ─── UiTimeline ─────────────────────────────────────────────────────────────

  private loadActivities(): void {
    this.activitiesState.set('loading');
    this.api.activities(this.id()).subscribe({
      next: (res) => {
        this.activities.set(res.items);
        this.activitiesState.set('none');
      },
      error: () => this.activitiesState.set('none'),
    });
  }

  // ─── Quotations ───────────────────────────────────────────────────────────

  private loadQuotations(): void {
    this.quotationState.set('loading');
    this.api.listQuotations(this.id()).subscribe({
      next: (list) => { this.quotations.set(list); this.quotationState.set('none'); },
      error: () => this.quotationState.set('none'),
    });
  }

  private loadComparison(): void {
    this.comparisonState.set('loading');
    this.api.quotationComparison(this.id()).subscribe({
      next: (res) => { this.comparison.set(res); this.comparisonState.set('none'); },
      error: () => this.comparisonState.set('none'),
    });
  }

  isCheapest(quotationId: string): boolean {
    const col = this.comparison()?.companies.find((c) => c.quotationId === quotationId);
    return col?.isLowest ?? false;
  }

  openRequestQuotation(): void {
    this.reqCompanyId = '';
    this.reqGross = '';
    this.reqDiscount = '';
    this.reqValidUntil = '';
    this.reqRemark = '';
    this.reqError.set(null);
    if (this.companies().length === 0) {
      this.masterApi.listCompanies().subscribe({ next: (r) => this.companies.set(r.data) });
    }
    this.showRequestQuoDialog = true;
    this.cdr.markForCheck();
  }

  closeRequestQuotation(): void {
    this.showRequestQuoDialog = false;
    this.reqError.set(null);
    this.cdr.markForCheck();
  }

  confirmRequestQuotation(): void {
    if (!this.reqCompanyId) { this.reqError.set('กรุณาเลือกบริษัทประกัน'); return; }
    if (this.quotations().some((q) => q.insuranceCompanyId === this.reqCompanyId)) {
      this.reqError.set('บริษัทประกันนี้มีใบเสนอราคาในงานนี้แล้ว');
      return;
    }
    if (!this.reqGross) { this.reqError.set('กรุณากรอกเบี้ยรวม'); return; }
    this.savingReqQuo.set(true);
    this.reqError.set(null);
    this.api.createQuotation(this.id(), {
      insuranceCompanyId: this.reqCompanyId,
      grossPremium: this.reqGross,
      discount: this.reqDiscount || undefined,
      validUntil: this.reqValidUntil || undefined,
      remark: this.reqRemark || undefined,
    }).subscribe({
      next: (q) => {
        this.quotations.update((list) => [...list, q]);
        this.savingReqQuo.set(false);
        this.showRequestQuoDialog = false;
        this.cdr.markForCheck();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.toast.add({ severity: 'success', summary: 'ส่งคำขอแล้ว', detail: `${q.quotationNo}` });
      },
      error: (e: HttpErrorResponse) => {
        this.savingReqQuo.set(false);
        const body = e.error as { message?: string } | null;
        this.reqError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  openRecordPrice(q: Quotation): void {
    this.recordingQuo = q;
    this.recGross = q.grossPremium;
    this.recDiscount = q.discount;
    this.recQuoDate = q.quotationDate ?? '';
    this.recValidUntil = q.validUntil ?? '';
    this.recRemark = q.remark ?? '';
    this.recItems = (q.items ?? []).map((it) => ({
      coverageName: it.coverageName,
      sumInsured: it.sumInsured,
      rate: it.rate ?? '',
      deductible: it.deductible ?? '',
      premium: it.premium,
      remark: it.remark ?? '',
    }));
    this.recError.set(null);
    this.showRecordPriceDialog = true;
    this.cdr.markForCheck();
  }

  closeRecordPrice(): void {
    this.showRecordPriceDialog = false;
    this.recError.set(null);
    this.recordingQuo = null;
    this.cdr.markForCheck();
  }

  addRecordItem(): void {
    this.recItems = [...this.recItems, { coverageName: '', sumInsured: '', rate: '', deductible: '', premium: '', remark: '' }];
  }

  removeRecordItem(i: number): void {
    this.recItems = this.recItems.filter((_, idx) => idx !== i);
  }

  confirmRecordPrice(): void {
    if (!this.recGross) { this.recError.set('กรุณากรอกเบี้ยรวม'); return; }
    if (!this.recordingQuo) return;
    this.savingRecord.set(true);
    this.recError.set(null);
    this.api.recordQuotation(this.recordingQuo.id, {
      grossPremium: this.recGross,
      discount: this.recDiscount || undefined,
      quotationDate: this.recQuoDate || undefined,
      validUntil: this.recValidUntil || undefined,
      remark: this.recRemark || undefined,
      items: this.recItems.filter((it) => it.coverageName.trim()).map((it) => ({
        coverageName: it.coverageName,
        sumInsured: it.sumInsured || '0',
        rate: it.rate || undefined,
        deductible: it.deductible || undefined,
        premium: it.premium || '0',
        remark: it.remark || undefined,
      })),
    }).subscribe({
      next: (updated) => {
        this.quotations.update((list) => list.map((q) => q.id === updated.id ? updated : q));
        this.savingRecord.set(false);
        this.showRecordPriceDialog = false;
        this.cdr.markForCheck();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.toast.add({ severity: 'success', summary: 'บันทึกแล้ว', detail: `${updated.quotationNo}` });
      },
      error: (e: HttpErrorResponse) => {
        this.savingRecord.set(false);
        const body = e.error as { message?: string; code?: string } | null;
        this.recError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  openSelectQuotation(c: CompanyColumn): void {
    this.selectingCompany.set(c);
    this.selectReason = '';
    this.selectError.set(null);
    this.showSelectQuoDialog = true;
    this.cdr.markForCheck();
  }

  closeSelectQuotation(): void {
    this.showSelectQuoDialog = false;
    this.selectError.set(null);
    this.selectingCompany.set(null);
    this.cdr.markForCheck();
  }

  confirmSelectQuotation(): void {
    if (!this.selectReason.trim()) { this.selectError.set('กรุณากรอกเหตุผล'); return; }
    const col = this.selectingCompany();
    if (!col) return;
    const quo = this.quotations().find((q) => q.id === col.quotationId);
    if (!quo) return;
    this.selectingQuo.set(true);
    this.selectError.set(null);
    this.api.selectQuotation(col.quotationId, { reason: this.selectReason.trim(), version: quo.version }).subscribe({
      next: (updated) => {
        this.quotations.update((list) => list.map((q) => q.id === updated.id ? updated : q));
        this.selectingQuo.set(false);
        this.showSelectQuoDialog = false;
        this.cdr.markForCheck();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadComparison();
        this.toast.add({ severity: 'success', summary: 'เลือกแล้ว', detail: `เลือก ${col.insuranceCompanyName}` });
      },
      error: (e: HttpErrorResponse) => {
        this.selectingQuo.set(false);
        const body = e.error as { message?: string; code?: string } | null;
        if (e.status === 409 && body?.code === 'CONCURRENT_MODIFICATION') {
          this.selectError.set('ข้อมูลถูกแก้ไขโดยผู้อื่น กรุณาโหลดใหม่');
          this.loadQuotations();
        } else {
          this.selectError.set(body?.message ?? 'เกิดข้อผิดพลาด');
        }
      },
    });
  }

  openDeleteQuotation(q: Quotation): void {
    this.deletingQuoTarget.set(q);
    this.showDeleteQuoDialog = true;
    this.cdr.markForCheck();
  }

  closeDeleteQuotation(): void {
    this.showDeleteQuoDialog = false;
    this.deletingQuoTarget.set(null);
    this.cdr.markForCheck();
  }

  doDeleteQuotation(): void {
    const q = this.deletingQuoTarget();
    if (!q) return;

    this.isDeletingQuo.set(true);
    this.api.deleteQuotation(q.id).subscribe({
      next: () => {
        this.quotations.update((list) => list.filter((item) => item.id !== q.id));
        this.isDeletingQuo.set(false);
        this.showDeleteQuoDialog = false;
        this.deletingQuoTarget.set(null);
        this.toast.add({ severity: 'success', summary: 'ลบแล้ว', detail: `ลบใบเสนอราคา ${q.quotationNo} เรียบร้อย` });
        this.loadComparison();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.cdr.markForCheck();
      },
      error: (e: HttpErrorResponse) => {
        this.isDeletingQuo.set(false);
        const body = e.error as { message?: string } | null;
        this.toast.add({
          severity: 'error',
          summary: 'ไม่สามารถลบได้',
          detail: body?.message ?? 'เกิดข้อผิดพลาดในการลบใบเสนอราคา',
        });
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Proposal ─────────────────────────────────────────────────────────────

  private loadProposals(): void {
    this.proposalState.set('loading');
    this.api.listProposals(this.id()).subscribe({
      next: (list) => { this.proposals.set(list); this.proposalState.set('none'); },
      error: () => this.proposalState.set('none'),
    });
  }

  openCreateProposal(): void {
    this.propValidUntil = '';
    this.propRemark = '';
    this.createProposalError.set(null);
    this.showCreateProposalDialog = true;
    this.cdr.markForCheck();
  }

  closeCreateProposal(): void {
    this.showCreateProposalDialog = false;
    this.createProposalError.set(null);
    this.cdr.markForCheck();
  }

  confirmCreateProposal(): void {
    this.creatingProposal.set(true);
    this.createProposalError.set(null);
    this.api.createProposal(this.id(), {
      validUntil: this.propValidUntil || undefined,
      remark: this.propRemark || undefined,
    }).subscribe({
      next: (prop) => {
        this.proposals.update((list) => [...list, prop]);
        this.creatingProposal.set(false);
        this.showCreateProposalDialog = false;
        this.cdr.markForCheck();
        this.toast.add({ severity: 'success', summary: 'สร้างแล้ว', detail: prop.proposalNo });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
      },
      error: (e: HttpErrorResponse) => {
        this.creatingProposal.set(false);
        const body = e.error as { message?: string } | null;
        this.createProposalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  doSendProposal(prop: ProposalResponse): void {
    this.sendingProposal.set(true);
    this.proposalError.set(null);
    this.api.sendProposal(prop.id).subscribe({
      next: (updated) => {
        this.proposals.update((list) => list.map((p) => p.id === updated.id ? updated : p));
        this.sendingProposal.set(false);
        this.toast.add({ severity: 'success', summary: 'ส่งแล้ว', detail: `${updated.proposalNo} — บันทึก PDF ไว้ในแท็บเอกสารแล้ว` });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadDocuments();
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.sendingProposal.set(false);
        const body = e.error as { message?: string } | null;
        this.proposalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  /** DRAFT → rendered live with a watermark; after sending → the stored copy the customer received */
  downloadProposalPdf(prop: ProposalResponse): void {
    this.downloadingProposalId.set(prop.id);
    this.api.downloadProposalPdf(prop.id).subscribe({
      next: (blob) => {
        this.downloadingProposalId.set(null);
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prop.proposalNo}${prop.status === 'DRAFT' ? '-DRAFT' : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.downloadingProposalId.set(null);
        this.toast.add({ severity: 'error', summary: 'ไม่สามารถสร้าง PDF ได้' });
      },
    });
  }

  doAcceptProposal(prop: ProposalResponse): void {
    this.acceptingProposal.set(true);
    this.proposalError.set(null);
    this.api.acceptProposal(prop.id).subscribe({
      next: (updated) => {
        this.proposals.update((list) => list.map((p) => p.id === updated.id ? updated : p));
        this.acceptingProposal.set(false);
        this.toast.add({ severity: 'success', summary: 'ยอมรับแล้ว' });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.acceptingProposal.set(false);
        const body = e.error as { message?: string } | null;
        this.proposalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  openRejectProposal(prop: ProposalResponse): void {
    this.rejectingProposalTarget = prop;
    this.rejectProposalReason = '';
    this.rejectProposalError.set(null);
    this.showRejectProposalDialog = true;
    this.cdr.markForCheck();
  }

  closeRejectProposal(): void {
    this.showRejectProposalDialog = false;
    this.rejectProposalReason = '';
    this.rejectProposalError.set(null);
    this.rejectingProposalTarget = null;
    this.cdr.markForCheck();
  }

  confirmRejectProposal(): void {
    if (!this.rejectProposalReason.trim()) { this.rejectProposalError.set('กรุณากรอกเหตุผล'); return; }
    const prop = this.rejectingProposalTarget;
    if (!prop) return;
    this.rejectingProposal.set(true);
    this.rejectProposalError.set(null);
    this.api.rejectProposal(prop.id, { reason: this.rejectProposalReason.trim() }).subscribe({
      next: (updated) => {
        this.proposals.update((list) => list.map((p) => p.id === updated.id ? updated : p));
        this.rejectingProposal.set(false);
        this.showRejectProposalDialog = false;
        this.cdr.markForCheck();
        this.toast.add({ severity: 'info', summary: 'ปฏิเสธแล้ว' });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.rejectingProposal.set(false);
        const body = e.error as { message?: string } | null;
        this.rejectProposalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  // ─── Approval ─────────────────────────────────────────────────────────────

  doApprove(a: ApprovalInProposal): void {
    this.approvingId.set(a.id);
    this.approvalError.set(null);
    this.api.approveApproval(a.id).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.toast.add({ severity: 'success', summary: 'อนุมัติแล้ว' });
        this.loadProposals();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.approvingId.set(null);
        const body = e.error as { message?: string } | null;
        this.approvalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  openRejectApproval(a: ApprovalInProposal): void {
    this.rejectingApprovalTarget = a;
    this.rejectApprovalReason = '';
    this.rejectApprovalError.set(null);
    this.showRejectApprovalDialog = true;
    this.cdr.markForCheck();
  }

  closeRejectApproval(): void {
    this.showRejectApprovalDialog = false;
    this.rejectApprovalReason = '';
    this.rejectApprovalError.set(null);
    this.rejectingApprovalTarget = null;
    this.cdr.markForCheck();
  }

  confirmRejectApproval(): void {
    if (!this.rejectApprovalReason.trim()) { this.rejectApprovalError.set('กรุณากรอกเหตุผล'); return; }
    const a = this.rejectingApprovalTarget;
    if (!a) return;
    this.rejectingApproval.set(true);
    this.rejectApprovalError.set(null);
    this.api.rejectApproval(a.id, { reason: this.rejectApprovalReason.trim() }).subscribe({
      next: () => {
        this.rejectingApproval.set(false);
        this.showRejectApprovalDialog = false;
        this.cdr.markForCheck();
        this.toast.add({ severity: 'info', summary: 'ปฏิเสธการอนุมัติแล้ว' });
        this.loadProposals();
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.rejectingApproval.set(false);
        const body = e.error as { message?: string } | null;
        this.rejectApprovalError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  // ─── Binding ──────────────────────────────────────────────────────────────

  private loadPreconditions(): void {
    this.preconditionState.set('loading');
    this.api.getBindPreconditions(this.id()).subscribe({
      next: (list) => { this.preconditions.set(list); this.preconditionState.set('none'); },
      error: () => this.preconditionState.set('none'),
    });
  }

  doBind(): void {
    this.binding_.set(true);
    this.bindError.set(null);
    this.api.bind(this.id(), { remark: this.bindRemark || undefined }).subscribe({
      next: (b) => {
        this.binding.set(b);
        this.binding_.set(false);
        this.toast.add({ severity: 'success', summary: 'Binding สำเร็จ' });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.binding_.set(false);
        const body = e.error as { message?: string } | null;
        this.bindError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  // ─── Policy ───────────────────────────────────────────────────────────────

  private loadPolicy(): void {
    this.policyState.set('loading');
    this.api.listPolicies({ jobId: this.id() }).subscribe({
      next: (res) => {
        this.policy.set(res.data[0] ?? null);
        this.policyState.set('none');
        const t = this.activeTab();
        if (t === 11) this.loadPayments();
        if (t === 12) this.loadCommissions();
        if (t === 13) this.loadTasks();
      },
      error: () => this.policyState.set('none'),
    });
  }

  doIssuePolicy(): void {
    this.issuingPolicy.set(true);
    this.policyError.set(null);
    this.api.issuePolicy(this.id(), { remark: this.issuePolicyRemark || undefined }).subscribe({
      next: (pol) => {
        this.policy.set(pol);
        this.issuingPolicy.set(false);
        this.toast.add({ severity: 'success', summary: 'ออกกรมธรรม์แล้ว', detail: pol.policyNo });
        this.api.get(this.id()).subscribe({ next: (job) => this.job.set(job) });
        this.loadActivities();
      },
      error: (e: HttpErrorResponse) => {
        this.issuingPolicy.set(false);
        const body = e.error as { message?: string } | null;
        this.policyError.set(body?.message ?? 'เกิดข้อผิดพลาด');
      },
    });
  }

  // ─── Payment ──────────────────────────────────────────────────────────────

  private loadPayments(): void {
    const pol = this.policy();
    if (!pol) return;
    this.paymentState.set('loading');
    this.api.listPayments(pol.id).subscribe({
      next: (data) => { this.paymentData.set(data); this.paymentState.set('none'); },
      error: () => this.paymentState.set('error'),
    });
  }

  doAddPayment(): void {
    if (!this.payAmount || !this.payMethod) return;
    const pol = this.policy();
    if (!pol) return;
    this.savingPayment.set(true);
    this.payError.set(null);
    const body: CreatePaymentDto = {
      amount: this.payAmount,
      paymentMethod: this.payMethod,
      ...(this.payDate ? { paymentDate: this.payDate } : {}),
      ...(this.payRef ? { referenceNo: this.payRef } : {}),
    };
    this.api.createPayment(pol.id, body).subscribe({
      next: (data) => {
        this.paymentData.set(data);
        this.payAmount = '';
        this.payRef = '';
        this.savingPayment.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกการชำระเงินแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.savingPayment.set(false);
        const b = e.error as { message?: string } | null;
        this.payError.set(b?.message ?? 'ไม่สามารถบันทึกได้');
      },
    });
  }

  doCancelPayment(payment: PaymentRecord): void {
    const pol = this.policy();
    if (!pol) return;
    this.api.cancelPayment(pol.id, payment.id, 'ยกเลิกโดยผู้ใช้').subscribe({
      next: (data) => {
        this.paymentData.set(data);
        this.toast.add({ severity: 'info', summary: 'ยกเลิกการชำระเงินแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        const b = e.error as { message?: string } | null;
        this.toast.add({ severity: 'error', summary: b?.message ?? 'เกิดข้อผิดพลาด' });
      },
    });
  }

  // ─── Commission ────────────────────────────────────────────────────────────

  private loadCommissions(): void {
    const pol = this.policy();
    if (!pol) return;
    this.commissionState.set('loading');
    this.api.listCommissions(pol.id).subscribe({
      next: (data) => { this.commissionData.set(data); this.commissionState.set('none'); },
      error: () => this.commissionState.set('error'),
    });
  }

  doAddCommission(): void {
    if (!this.commType || !this.commBase || !this.commRate) return;
    const pol = this.policy();
    if (!pol) return;
    this.savingCommission.set(true);
    this.commError.set(null);
    const body: CreateCommissionDto = {
      commissionType: this.commType,
      commissionBase: this.commBase,
      commissionRate: this.commRate,
    };
    this.api.createCommission(pol.id, body).subscribe({
      next: (data) => {
        this.commissionData.set(data);
        this.commBase = '';
        this.commRate = '';
        this.savingCommission.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกค่าคอมมิชชันแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.savingCommission.set(false);
        const b = e.error as { message?: string } | null;
        this.commError.set(b?.message ?? 'ไม่สามารถบันทึกได้');
      },
    });
  }

  // ─── Task tab ─────────────────────────────────────────────────────────────

  private loadTasks(): void {
    const jobId = this.id();
    if (!jobId) return;
    this.taskState.set('loading');
    this.api.listTasks(jobId).subscribe({
      next: (data) => { this.taskData.set(data.items); this.taskState.set('none'); },
      error: () => this.taskState.set('error'),
    });
  }

  doAddTask(): void {
    if (!this.taskType || !this.taskSubject) return;
    const jobId = this.id();
    if (!jobId) return;
    this.savingTask.set(true);
    this.taskError.set(null);
    this.api.createTask(jobId, {
      taskType: this.taskType,
      subject: this.taskSubject,
      dueDate: this.taskDueDate || undefined,
      priority: this.taskPriority,
    }).subscribe({
      next: (task) => {
        this.taskData.update((prev) => [...prev, task]);
        this.taskSubject = '';
        this.taskDueDate = '';
        this.savingTask.set(false);
        this.toast.add({ severity: 'success', summary: 'สร้างงานแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.savingTask.set(false);
        const b = e.error as { message?: string } | null;
        this.taskError.set(b?.message ?? 'ไม่สามารถสร้างงานได้');
      },
    });
  }

  doCompleteTask(task: TaskRecord): void {
    this.api.completeTask(task.id).subscribe({
      next: (updated) => {
        this.taskData.update((prev) => prev.map((t) => t.id === updated.id ? updated : t));
        this.toast.add({ severity: 'success', summary: 'งานเสร็จสิ้นและบันทึกลง UiTimeline แล้ว' });
      },
      error: () => this.toast.add({ severity: 'error', summary: 'ไม่สามารถอัปเดตงานได้' }),
    });
  }

  doCancelTask(task: TaskRecord): void {
    this.api.cancelTask(task.id).subscribe({
      next: (updated) => {
        this.taskData.update((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      },
      error: () => this.toast.add({ severity: 'error', summary: 'ไม่สามารถยกเลิกงานได้' }),
    });
  }

  // ─── Job load ─────────────────────────────────────────────────────────────

  private loadJob(): void {
    this.state.set('loading');
    this.api.get(this.id()).subscribe({
      next: (job) => {
        this.job.set(job);
        this.state.set('none');
        // Eagerly load activities (timeline) for fresh state
        this.loadActivities();
        this.loadRenewalReference(job);
      },
      error: () => this.state.set('error'),
    });
  }

  /** Reference card for jobs created by renewing a policy; reference data only, so failures stay silent */
  private loadRenewalReference(job: Job): void {
    this.renewalRef.set(null);
    if (job.source !== 'RENEWAL') return;
    this.api.getRenewalReference(job.id).subscribe({
      next: (ref) => this.renewalRef.set(ref),
      error: () => this.renewalRef.set(null),
    });
  }
}

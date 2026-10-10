import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { PolicyInvoicesComponent } from '../../billing/components/policy-invoices.component';
import { PolicyCommissionsComponent } from '../../commissions/components/policy-commissions.component';
import { PolicyEndorsementsComponent } from '../components/policy-endorsements.component';
import { PolicyVersionsComponent } from '../components/policy-versions.component';
import { PolicyCancellationComponent } from '../components/policy-cancellation.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { JobsApi, type PolicyResponse } from '../../jobs/data/jobs.api';
import { MessageService, UiButton, UiInput, UiMessage, UiTabs, UiTabList, UiTab, UiTabPanels, UiTabPanel } from '../../../shared/ui';

@Component({
  selector: 'app-policy-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FormsModule,
    UiButton,
    UiInput,
    UiMessage,
    UiTabs,
    UiTabList,
    UiTab,
    UiTabPanels,
    UiTabPanel,
    AppPageHeaderComponent,
    AppStateComponent,
    AppStatusBadgeComponent,
    ThDatePipe,
    MoneyPipe,
    PolicyInvoicesComponent,
    PolicyCommissionsComponent,
    PolicyEndorsementsComponent,
    PolicyVersionsComponent,
    PolicyCancellationComponent,
    HasPermissionDirective,
  ],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (policy()) {
      <app-page-header [title]="policy()!.policyNo" subtitle="กรมธรรม์">
        <app-status-badge [status]="policy()!.status" />
      </app-page-header>

      <div class="detail-card">
        <div class="info-grid">
          <div class="info-item"><span class="info-label">เลขกรมธรรม์</span><span class="info-value font-bold">{{ policy()!.policyNo }}</span></div>
          <div class="info-item"><span class="info-label">สถานะ</span><span class="info-value"><app-status-badge [status]="policy()!.status" /></span></div>
          <div class="info-item"><span class="info-label">เวอร์ชันปัจจุบัน</span><span class="info-value">v{{ policy()!.version }}</span></div>
          <div class="info-item"><span class="info-label">วันเริ่มคุ้มครอง</span><span class="info-value">{{ policy()!.effectiveDate | thDate }}</span></div>
          @if (policy()!.expiryDate) {
            <div class="info-item"><span class="info-label">วันสิ้นสุดคุ้มครอง</span><span class="info-value">{{ policy()!.expiryDate | thDate }}</span></div>
          }
          <div class="info-item"><span class="info-label">เบี้ยรวม</span><span class="info-value">{{ policy()!.grossPremium | money }}</span></div>
          <div class="info-item"><span class="info-label">ส่วนลด</span><span class="info-value">{{ policy()!.discount | money }}</span></div>
          <div class="info-item"><span class="info-label">เบี้ยสุทธิ</span><span class="info-value">{{ policy()!.netPremium | money }}</span></div>
          <div class="info-item"><span class="info-label">อากรแสตมป์</span><span class="info-value">{{ policy()!.stampDuty | money }}</span></div>
          <div class="info-item"><span class="info-label">ภาษี</span><span class="info-value">{{ policy()!.tax | money }}</span></div>
          <div class="info-item"><span class="info-label">รวมทั้งสิ้น</span><span class="info-value policy-total">{{ policy()!.totalPremium | money }}</span></div>
          @if (policy()!.paymentDueDate) {
            <div class="info-item"><span class="info-label">วันครบกำหนดชำระ</span><span class="info-value">{{ policy()!.paymentDueDate | thDate }}</span></div>
          }
          @if (policy()!.issuedAt) {
            <div class="info-item"><span class="info-label">ออกกรมธรรม์เมื่อ</span><span class="info-value">{{ policy()!.issuedAt | thDate }}</span></div>
          }
        </div>

        <!-- Policy Cancellation Section (Day 33) -->
        <app-policy-cancellation [policy]="policy()!" (updated)="reload()" />

        <!-- Tabs for Details, Invoices, Commissions, Endorsements, Versions -->
        <div class="mt-4">
          <ui-tabs [value]="activeTab()">
            <ui-tablist>
              <ui-tab value="coverages">ความคุ้มครอง</ui-tab>
              <ui-tab value="invoices">ใบแจ้งหนี้ / ชำระเงิน</ui-tab>
              <ui-tab value="endorsements">สลักหลัง (Endorsements)</ui-tab>
              <ui-tab value="versions">ประวัติเวอร์ชัน (Versions)</ui-tab>
              <ng-container *appHasPermission="'commission.view'">
                <ui-tab value="commissions">ค่าคอมมิชชัน</ui-tab>
              </ng-container>
            </ui-tablist>

            <ui-tabpanels>
              <ui-tabpanel value="coverages">
                <div class="pt-3">
                  @if (policy()!.coverages.length > 0) {
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>ความคุ้มครอง</th>
                          <th style="text-align:right">วงเงินคุ้มครอง</th>
                          <th style="text-align:right">เบี้ยประกัน</th>
                          <th style="text-align:right">ค่าลดหย่อน</th>
                          <th style="text-align:right">อัตรา</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (c of policy()!.coverages; track c.id) {
                          <tr>
                            <td>{{ c.coverageName }}</td>
                            <td style="text-align:right">{{ c.sumInsured | money }}</td>
                            <td style="text-align:right">{{ c.premium | money }}</td>
                            <td style="text-align:right">{{ c.deductible | money }}</td>
                            <td style="text-align:right">{{ c.rate ? (c.rate | money) : '-' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  } @else {
                    <div class="p-3 text-secondary text-sm">ไม่มีรายการความคุ้มครองย่อย</div>
                  }
                </div>
              </ui-tabpanel>

              <ui-tabpanel value="invoices">
                <div class="pt-3">
                  <app-policy-invoices [policyId]="policy()!.id" />
                </div>
              </ui-tabpanel>

              <ui-tabpanel value="endorsements">
                <div class="pt-3">
                  <app-policy-endorsements [policy]="policy()!" />
                </div>
              </ui-tabpanel>

              <ui-tabpanel value="versions">
                <div class="pt-3">
                  <app-policy-versions [policyId]="policy()!.id" />
                </div>
              </ui-tabpanel>

              <ui-tabpanel value="commissions">
                <div class="pt-3">
                  <app-policy-commissions [policyId]="policy()!.id" />
                </div>
              </ui-tabpanel>
            </ui-tabpanels>
          </ui-tabs>
        </div>

        <!-- Edit payment due date -->
        <div class="edit-section mt-4">
          <h4 class="section-title">อัปเดตข้อมูล</h4>
          <div class="edit-form">
            <div class="field">
              <label for="pay-due">วันครบกำหนดชำระ</label>
              <input uiInput id="pay-due" type="date" [(ngModel)]="editPaymentDue" class="w-full" style="max-width:220px" />
            </div>
            <div class="field">
              <label for="edit-remark">หมายเหตุ</label>
              <input uiInput id="edit-remark" [(ngModel)]="editRemark" class="w-full" style="max-width:400px" />
            </div>
            @if (saveError()) {
              <ui-message severity="error" class="block mb-2">{{ saveError() }}</ui-message>
            }
            <ui-button label="บันทึก" icon="pi pi-save" [loading]="saving()" [disabled]="saving()" (onClick)="save()" />
          </div>
        </div>
      </div>

      <div class="back-link">
        <a routerLink="/policies" class="link">← กลับไปรายการกรมธรรม์</a>
      </div>
    }
  `,
  styles: [`
    .detail-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .info-item { display: flex; flex-direction: column; gap: 0.2rem; }
    .info-label { font-size: 0.72rem; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
    .info-value { font-size: 0.9rem; font-weight: 500; }
    .policy-total { font-size: 1rem; font-weight: 700; color: var(--primary-color); }
    .section-title { font-size: 0.9rem; font-weight: 600; color: var(--primary-color); margin: 0 0 0.75rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 1px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); vertical-align: middle; }
    .edit-section { border-top: 1px solid var(--surface-border); padding-top: 1.25rem; }
    .edit-form { display: flex; flex-direction: column; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    label { font-size: 0.875rem; font-weight: 500; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mt-4 { margin-top: 1.25rem; }
    .pt-3 { padding-top: 0.75rem; }
    .font-bold { font-weight: 600; }
    .back-link { margin-top: 1.25rem; }
    .link { color: var(--primary-color); text-decoration: none; font-size: 0.875rem; }
    .link:hover { text-decoration: underline; }
  `],
})
export class PolicyDetailPage implements OnInit {
  private readonly api = inject(JobsApi);
  private readonly toast = inject(MessageService);

  readonly id = input.required<string>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly policy = signal<PolicyResponse | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly activeTab = signal<string>('coverages');

  editPaymentDue = '';
  editRemark = '';

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.getPolicy(this.id()).subscribe({
      next: (p) => {
        this.policy.set(p);
        this.editPaymentDue = p.paymentDueDate ?? '';
        this.editRemark = p.remark ?? '';
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.api.updatePolicy(this.id(), {
      paymentDueDate: this.editPaymentDue || undefined,
      remark: this.editRemark || undefined,
    }).subscribe({
      next: (updated) => {
        this.policy.set(updated);
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'บันทึกแล้ว' });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        const body = e.error as { message?: string } | null;
        this.saveError.set(body?.message ?? 'ไม่สามารถบันทึกได้');
      },
    });
  }
}

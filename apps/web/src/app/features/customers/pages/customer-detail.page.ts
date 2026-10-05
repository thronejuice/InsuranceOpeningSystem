import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { CustomersApi, type Customer } from '../data/customers.api';
import { JobsApi, type Job } from '../../jobs/data/jobs.api';
import { UiButton, UiTab, UiTabList, UiTabPanel, UiTabPanels, UiTabs, UiTag } from '../../../shared/ui';

@Component({
  selector: 'app-customer-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiTabs, UiTabList, UiTab, UiTabPanels, UiTabPanel, UiTag, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, HasPermissionDirective, ThDatePipe],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (customer()) {
      <app-page-header
        [title]="displayName()"
        [subtitle]="customer()!.customerCode"
      >
        <app-status-badge [status]="customer()!.status" />
        <ui-button
          *appHasPermission="'customer.update'"
          label="แก้ไข"
          icon="pi pi-pencil"
          severity="secondary"
          [link]="['/customers', id(), 'edit']"
        />
      </app-page-header>

      <ui-tabs [value]="0" (valueChange)="onTabChange($event)">
        <ui-tablist>
          <ui-tab [value]="0">ข้อมูลพื้นฐาน</ui-tab>
          <ui-tab [value]="1">ผู้ติดต่อ ({{ customer()!.contacts?.length ?? 0 }})</ui-tab>
          <ui-tab [value]="2">ที่อยู่ ({{ customer()!.addresses?.length ?? 0 }})</ui-tab>
          <ui-tab [value]="3">งานประกัน ({{ customerJobs().length }})</ui-tab>
        </ui-tablist>

        <ui-tabpanels>
          <ui-tabpanel [value]="0">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">รหัสลูกค้า</span>
                <span class="info-value">{{ customer()!.customerCode }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">ประเภท</span>
                <span class="info-value">
                  {{ customer()!.customerType === 'INDIVIDUAL' ? 'บุคคลธรรมดา' : 'นิติบุคคล' }}
                </span>
              </div>

              @if (customer()!.customerType === 'INDIVIDUAL') {
                <div class="info-item">
                  <span class="info-label">ชื่อ-นามสกุล</span>
                  <span class="info-value">{{ displayName() }}</span>
                </div>
                @if (customer()!.citizenId) {
                  <div class="info-item">
                    <span class="info-label">เลขบัตรประชาชน</span>
                    <span class="info-value">{{ customer()!.citizenId }}</span>
                  </div>
                }
              } @else {
                <div class="info-item">
                  <span class="info-label">ชื่อบริษัท</span>
                  <span class="info-value">{{ customer()!.companyName }}</span>
                </div>
                @if (customer()!.taxId) {
                  <div class="info-item">
                    <span class="info-label">เลขประจำตัวผู้เสียภาษี</span>
                    <span class="info-value">{{ customer()!.taxId }}</span>
                  </div>
                }
              }

              @if (customer()!.phone) {
                <div class="info-item">
                  <span class="info-label">โทรศัพท์</span>
                  <span class="info-value">{{ customer()!.phone }}</span>
                </div>
              }
              @if (customer()!.mobile) {
                <div class="info-item">
                  <span class="info-label">มือถือ</span>
                  <span class="info-value">{{ customer()!.mobile }}</span>
                </div>
              }
              @if (customer()!.email) {
                <div class="info-item">
                  <span class="info-label">อีเมล</span>
                  <span class="info-value">{{ customer()!.email }}</span>
                </div>
              }

              <div class="info-item">
                <span class="info-label">สถานะ</span>
                <span class="info-value">
                  <app-status-badge [status]="customer()!.status" />
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">วันที่สร้าง</span>
                <span class="info-value">{{ customer()!.createdAt | thDate }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">แก้ไขล่าสุด</span>
                <span class="info-value">{{ customer()!.updatedAt | thDate }}</span>
              </div>

              @if (customer()!.remark) {
                <div class="info-item info-item-full">
                  <span class="info-label">หมายเหตุ</span>
                  <span class="info-value">{{ customer()!.remark }}</span>
                </div>
              }
            </div>
          </ui-tabpanel>

          <ui-tabpanel [value]="1">
            @if (!customer()!.contacts?.length) {
              <app-state state="empty" emptyMessage="ไม่มีผู้ติดต่อ" />
            } @else {
              <div class="contact-list">
                @for (contact of customer()!.contacts; track contact.id) {
                  <div class="contact-card">
                    <div class="contact-header">
                      <span class="contact-name">{{ contact.contactName }}</span>
                      @if (contact.isPrimary) {
                        <ui-tag value="หลัก" severity="info" />
                      }
                    </div>
                    <div class="contact-details">
                      @if (contact.position) {
                        <span>{{ contact.position }}</span>
                      }
                      @if (contact.department) {
                        <span>{{ contact.department }}</span>
                      }
                      @if (contact.phone) {
                        <span><i class="pi pi-phone"></i> {{ contact.phone }}</span>
                      }
                      @if (contact.mobile) {
                        <span><i class="pi pi-mobile"></i> {{ contact.mobile }}</span>
                      }
                      @if (contact.email) {
                        <span><i class="pi pi-envelope"></i> {{ contact.email }}</span>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </ui-tabpanel>

          <ui-tabpanel [value]="2">
            @if (!customer()!.addresses?.length) {
              <app-state state="empty" emptyMessage="ไม่มีที่อยู่" />
            } @else {
              <div class="address-list">
                @for (addr of customer()!.addresses; track addr.id) {
                  <div class="address-card">
                    <div class="address-header">
                      <span class="address-type">{{ addressTypeLabel(addr.addressType) }}</span>
                      @if (addr.isPrimary) {
                        <ui-tag value="หลัก" severity="info" />
                      }
                    </div>
                    <div class="address-text">
                      {{ formatAddress(addr) }}
                    </div>
                  </div>
                }
              </div>
            }
          </ui-tabpanel>

          <ui-tabpanel [value]="3">
            @if (jobsState() === 'loading') {
              <app-state state="loading" />
            } @else if (customerJobs().length === 0) {
              <app-state state="empty" emptyMessage="ยังไม่มีงานประกัน" />
            } @else {
              <div class="jobs-list">
                @for (job of customerJobs(); track job.id) {
                  <a [routerLink]="['/jobs', job.id]" class="job-card">
                    <div class="job-card-header">
                      <span class="job-no">{{ job.jobNo }}</span>
                      <app-status-badge [status]="job.status" />
                    </div>
                    <div class="job-card-body">
                      <span>{{ job.insuranceTypeName }} — {{ job.productName }}</span>
                      <span class="sub-text">{{ job.effectiveDate | thDate }}</span>
                    </div>
                  </a>
                }
              </div>
              <div style="margin-top:0.75rem">
                <a routerLink="/jobs" [queryParams]="{ customerId: id() }" class="link-more">
                  ดูงานทั้งหมด →
                </a>
              </div>
            }
          </ui-tabpanel>
        </ui-tabpanels>
      </ui-tabs>
    }
  `,
  styles: [`
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      padding: 1rem 0;
    }
    .info-item { display: flex; flex-direction: column; gap: 0.25rem; }
    .info-item-full { grid-column: 1 / -1; }
    .info-label { font-size: 0.8rem; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .info-value { font-size: 0.95rem; }
    .contact-list, .address-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
      padding: 1rem 0;
    }
    .contact-card, .address-card {
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      padding: 1rem;
    }
    .contact-header, .address-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .contact-name { font-weight: 600; }
    .address-type { font-weight: 600; }
    .contact-details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.875rem;
      color: var(--text-color-secondary);
    }
    .contact-details i { margin-right: 0.25rem; }
    .address-text { font-size: 0.875rem; color: var(--text-color-secondary); }
    .jobs-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
    .job-card { display: block; border: 1px solid var(--surface-border); border-radius: 8px; padding: 0.75rem 1rem; text-decoration: none; color: inherit; transition: background 0.15s; }
    .job-card:hover { background: var(--surface-hover); }
    .job-card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; }
    .job-no { font-weight: 600; color: var(--primary-color); }
    .job-card-body { display: flex; gap: 1rem; font-size: 0.875rem; color: var(--text-color-secondary); }
    .sub-text { font-size: 0.8rem; color: var(--text-color-secondary); }
    .link-more { color: var(--primary-color); font-size: 0.875rem; text-decoration: none; }
    .link-more:hover { text-decoration: underline; }
  `],
})
export class CustomerDetailPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly jobsApi = inject(JobsApi);

  readonly id = input.required<string>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly customer = signal<Customer | null>(null);
  readonly customerJobs = signal<Job[]>([]);
  readonly jobsState = signal<'loading' | 'none'>('none');

  ngOnInit(): void {
    this.api.get(this.id()).subscribe({
      next: (c) => {
        this.customer.set(c);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  onTabChange(tab: number | string | undefined): void {
    if (Number(tab) === 3 && this.customerJobs().length === 0) {
      this.jobsState.set('loading');
      this.jobsApi.list({ customerId: this.id(), perPage: 20, sort: '-createdAt' }).subscribe({
        next: (res) => {
          this.customerJobs.set(res.data);
          this.jobsState.set('none');
        },
        error: () => this.jobsState.set('none'),
      });
    }
  }

  displayName(): string {
    const c = this.customer();
    if (!c) return '';
    if (c.customerType === 'INDIVIDUAL') {
      return [c.firstName, c.lastName].filter(Boolean).join(' ') || '-';
    }
    return c.companyName || '-';
  }

  addressTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      HOME: 'บ้าน',
      OFFICE: 'สำนักงาน',
      BILLING: 'ที่อยู่สำหรับวางบิล',
      SHIPPING: 'ที่อยู่จัดส่ง',
      OTHER: 'อื่นๆ',
    };
    return labels[type] ?? type;
  }

  formatAddress(addr: Customer['addresses'] extends (infer T)[] | undefined ? T : never): string {
    return [
      addr.addressLine,
      addr.subDistrict,
      addr.district,
      addr.province,
      addr.postalCode,
    ]
      .filter(Boolean)
      .join(' ');
  }
}

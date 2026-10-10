import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { AppPageHeaderComponent } from '../../../shared/components/app-page-header/app-page-header.component';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ExportService } from '../../../core/api/export.service';
import { RouterLink } from '@angular/router';
import { BillingApi, type BillingPayment } from '../../billing/data/billing.api';
import { UiButton } from '../../../shared/ui';

@Component({
  selector: 'app-payments-list-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AppPageHeaderComponent, AppStateComponent, AppStatusBadgeComponent, ThDatePipe, MoneyPipe, UiButton],
  template: `
    <app-page-header title="การชำระเงิน" subtitle="รายการชำระเงินทั้งหมด">
      <ui-button label="Export Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" (onClick)="export()" />
    </app-page-header>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (payments().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีข้อมูลการชำระเงิน" />
    } @else {
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>วันที่ชำระ</th>
              <th style="text-align:right">จำนวนเงิน</th>
              <th>วิธีชำระ</th>
              <th>สถานะ</th>
              <th>เลขอ้างอิง</th>
              <th>กรมธรรม์</th>
              <th>ใบเสร็จ</th>
            </tr>
          </thead>
          <tbody>
            @for (p of payments(); track p.id) {
              <tr>
                <td class="mono">{{ p.paymentNo }}</td>
                <td>{{ p.paymentDate | thDate }}</td>
                <td style="text-align:right">{{ p.amount | money }}</td>
                <td>{{ methodLabel(p.paymentMethod) }}</td>
                <td><app-status-badge [status]="p.status" /></td>
                <td>{{ p.referenceNo ?? '-' }}</td>
                <td><a class="link" [routerLink]="['/policies', p.policyId]">ดูกรมธรรม์</a></td>
                <td>
                  @if (p.receipt) { <button type="button" class="linkbtn" (click)="receiptPdf(p.receipt.id)">{{ p.receipt.receiptNo }}</button> }
                  @else { <span class="legacy">รายการเดิม (ไม่ผูกใบแจ้งหนี้)</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.5rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th { text-align: left; padding: 0.5rem 0.75rem; background: var(--surface-ground); border-bottom: 2px solid var(--surface-border); font-size: 0.8rem; color: var(--text-color-secondary); white-space: nowrap; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--surface-border); }
    .mono { font-family: monospace; font-size: 0.85rem; }
    .link { color: var(--primary-color); text-decoration: none; }
    .linkbtn { background: none; border: 0; padding: 0; font: inherit; color: var(--primary-color); cursor: pointer; text-decoration: underline; }
    .legacy { color: var(--text-color-secondary); font-size: 0.8rem; }
  `],
})
export class PaymentsListPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly exportSvc = inject(ExportService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly payments = signal<BillingPayment[]>([]);

  private readonly METHOD_LABELS: Record<string, string> = {
    CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CREDIT_CARD: 'บัตรเครดิต',
    CHEQUE: 'เช็ค', ONLINE: 'ออนไลน์', OTHER: 'อื่นๆ',
  };

  methodLabel(m: string): string { return this.METHOD_LABELS[m] ?? m; }

  ngOnInit(): void {
    this.api.listPayments({ perPage: 100 }).subscribe({
      next: (res) => { this.payments.set(res.items); this.state.set('none'); },
      error: () => this.state.set('error'),
    });
  }

  receiptPdf(id: string): void {
    this.api.openPdf('receipts', id);
  }

  export(): void {
    this.exportSvc.download('payments');
  }
}

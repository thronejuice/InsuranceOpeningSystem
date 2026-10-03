import { ChangeDetectionStrategy, Component, inject, OnInit, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { AppStateComponent } from '../../shared/components/app-state/app-state.component';
import { DashboardApi, type AgentDashboard, type ManagerDashboard, type FunnelData } from './data/dashboard.api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ร่าง', OPEN: 'เปิด', WAITING_INFORMATION: 'รอข้อมูล',
  QUOTATION_REQUESTED: 'ขอราคา', QUOTATION_RECEIVED: 'ได้รับราคา', QUOTATION_SELECTED: 'เลือกราคาแล้ว',
  PROPOSAL_SENT: 'ส่งใบเสนอ', WAITING_CUSTOMER: 'รอลูกค้า', CUSTOMER_ACCEPTED: 'ลูกค้ายืนยัน',
  WAITING_APPROVAL: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', BINDING: 'Binding',
  POLICY_PENDING: 'รอกรมธรรม์', POLICY_ISSUED: 'ออกกรมธรรม์', RENEWAL: 'ต่ออายุ',
  CANCELLED: 'ยกเลิก', CLOSED: 'ปิด', EXPIRED: 'หมดอายุ',
};

const ACTIVE_STATUSES = ['DRAFT', 'OPEN', 'WAITING_INFORMATION', 'QUOTATION_REQUESTED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED', 'PROPOSAL_SENT', 'WAITING_CUSTOMER', 'CUSTOMER_ACCEPTED', 'WAITING_APPROVAL', 'APPROVED', 'BINDING', 'POLICY_PENDING', 'POLICY_ISSUED'];

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppStateComponent, RouterLink, DecimalPipe],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <div class="dashboard">
        <div class="dash-header">
          <h2 class="dash-title">Dashboard</h2>
          <p class="dash-sub">ยินดีต้อนรับ, {{ store.user()?.fullName }}</p>
        </div>

        <!-- Agent Dashboard -->
        @if (agentData(); as d) {
          <section class="section">
            <h3 class="section-title">งานของฉัน</h3>
            <div class="card-grid">
              <a class="stat-card" [routerLink]="['/jobs']">
                <div class="stat-label">งานทั้งหมด</div>
                <div class="stat-value">{{ d.myJobs }}</div>
              </a>
              <a class="stat-card accent-blue" [routerLink]="['/jobs']" [queryParams]="{status:'OPEN'}">
                <div class="stat-label">เปิดรับ</div>
                <div class="stat-value">{{ d.openJobs }}</div>
              </a>
              <a class="stat-card" [routerLink]="['/jobs']" [queryParams]="{status:'WAITING_INFORMATION'}">
                <div class="stat-label">รอข้อมูล</div>
                <div class="stat-value">{{ d.waitingInfo }}</div>
              </a>
              <a class="stat-card accent-yellow" [routerLink]="['/jobs']" [queryParams]="{status:'QUOTATION_REQUESTED'}">
                <div class="stat-label">ใบเสนอราคา</div>
                <div class="stat-value">{{ d.quotationJobs }}</div>
              </a>
              <a class="stat-card" [routerLink]="['/jobs']" [queryParams]="{status:'WAITING_CUSTOMER'}">
                <div class="stat-label">รอลูกค้า</div>
                <div class="stat-value">{{ d.waitingCustomer }}</div>
              </a>
              <a class="stat-card" [routerLink]="['/jobs']" [queryParams]="{status:'BINDING'}">
                <div class="stat-label">Binding</div>
                <div class="stat-value">{{ d.bindingJobs }}</div>
              </a>
              <a class="stat-card accent-green" [routerLink]="['/jobs']" [queryParams]="{status:'POLICY_ISSUED'}">
                <div class="stat-label">ออกกรมธรรม์</div>
                <div class="stat-value">{{ d.policyIssued }}</div>
              </a>
              <a class="stat-card accent-purple" [routerLink]="['/jobs']" [queryParams]="{status:'RENEWAL'}">
                <div class="stat-label">ต่ออายุ</div>
                <div class="stat-value">{{ d.renewalJobs }}</div>
              </a>
              <a class="stat-card accent-red" [routerLink]="['/tasks']">
                <div class="stat-label">งานเกินกำหนด</div>
                <div class="stat-value">{{ d.overdueTasks }}</div>
              </a>
            </div>
          </section>
        }

        <!-- Manager Dashboard -->
        @if (managerData(); as m) {
          <section class="section">
            <h3 class="section-title">ภาพรวมทั้งหมด</h3>
            <div class="card-grid">
              <a class="stat-card accent-blue" [routerLink]="['/jobs']">
                <div class="stat-label">งานทั้งหมด</div>
                <div class="stat-value">{{ m.totalJobs }}</div>
              </a>
              <a class="stat-card accent-green" [routerLink]="['/policies']">
                <div class="stat-label">กรมธรรม์</div>
                <div class="stat-value">{{ m.policyCount }}</div>
              </a>
              <div class="stat-card">
                <div class="stat-label">เบี้ยรวม (฿)</div>
                <div class="stat-value stat-money">{{ m.totalPremium | number:'1.2-2' }}</div>
              </div>
              <div class="stat-card accent-yellow">
                <div class="stat-label">คอมมิชชันรวม (฿)</div>
                <div class="stat-value stat-money">{{ m.totalCommission | number:'1.2-2' }}</div>
              </div>
              <div class="stat-card accent-purple">
                <div class="stat-label">Conversion (%)</div>
                <div class="stat-value">{{ m.conversionRate }}%</div>
              </div>
              <a class="stat-card accent-red" [routerLink]="['/tasks']">
                <div class="stat-label">งานเกินกำหนด</div>
                <div class="stat-value">{{ m.overdueCount }}</div>
              </a>
            </div>

            <!-- Bar chart: jobs by status -->
            <div class="chart-card">
              <h4 class="chart-title">งานแยกตามสถานะ</h4>
              <div class="bar-chart">
                @for (s of activeStatusKeys(m); track s) {
                  @if (m.jobsByStatus[s] > 0 || true) {
                    <div class="bar-row">
                      <div class="bar-label">{{ statusLabel(s) }}</div>
                      <div class="bar-track">
                        <a class="bar-fill"
                           [style.width]="barWidth(m.jobsByStatus[s], m) + '%'"
                           [routerLink]="['/jobs']" [queryParams]="{status: s}"
                           title="{{ m.jobsByStatus[s] }}">
                        </a>
                      </div>
                      <div class="bar-count">{{ m.jobsByStatus[s] }}</div>
                    </div>
                  }
                }
              </div>
            </div>
          </section>
        }

        <!-- Sales Funnel -->
        @if (funnelData(); as f) {
          <section class="section">
            <h3 class="section-title">Sales Funnel</h3>
            <div class="funnel-row">
              <div class="funnel-chart">
                @for (stage of funnelStages(f); track stage.key) {
                  <div class="funnel-step">
                    <a class="funnel-bar" [style.width]="stage.width + '%'" [routerLink]="['/jobs']" [queryParams]="stage.routeParams">
                      <span class="funnel-bar-label">{{ stage.label }}</span>
                      <span class="funnel-bar-count">{{ stage.value }}</span>
                    </a>
                    @if (!$last) { <div class="funnel-arrow">↓</div> }
                  </div>
                }
              </div>
              <div class="funnel-metrics">
                <div class="metric-row"><span class="metric-label">Quotation Conversion</span><strong>{{ f.metrics.quotationConversion }}%</strong></div>
                <div class="metric-row"><span class="metric-label">Proposal Conversion</span><strong>{{ f.metrics.proposalConversion }}%</strong></div>
                <div class="metric-row"><span class="metric-label">Policy Conversion</span><strong>{{ f.metrics.policyConversion }}%</strong></div>
                <div class="metric-row"><span class="metric-label">เบี้ยรวม</span><strong>฿{{ f.metrics.totalPremium | number:'1.2-2' }}</strong></div>
                <div class="metric-row"><span class="metric-label">เบี้ยเฉลี่ย</span><strong>฿{{ f.metrics.averagePremium | number:'1.2-2' }}</strong></div>
              </div>
            </div>
          </section>
        }
      </div>
    }
  `,
  styles: [`
    .dashboard { padding: 1.5rem; max-width: 1200px; }
    .dash-header { margin-bottom: 1.5rem; }
    .dash-title { margin: 0 0 0.25rem; font-size: 1.4rem; font-weight: 600; }
    .dash-sub { margin: 0; color: var(--text-color-secondary); font-size: 0.9rem; }

    .section { margin-bottom: 2rem; }
    .section-title { font-size: 1rem; font-weight: 600; color: var(--text-color-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 1rem; }

    .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }
    .stat-card { display: flex; flex-direction: column; gap: 0.4rem; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 1rem 1.25rem; cursor: pointer; text-decoration: none; color: inherit; transition: box-shadow 0.15s; }
    .stat-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    .stat-label { font-size: 0.75rem; color: var(--text-color-secondary); white-space: nowrap; }
    .stat-value { font-size: 1.8rem; font-weight: 700; line-height: 1; }
    .stat-money { font-size: 1.2rem; }

    .accent-blue { border-top: 3px solid var(--blue-500); }
    .accent-green { border-top: 3px solid var(--green-500); }
    .accent-yellow { border-top: 3px solid var(--yellow-500); }
    .accent-purple { border-top: 3px solid var(--purple-500); }
    .accent-red { border-top: 3px solid var(--red-500); }

    .chart-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 1.25rem; margin-top: 1rem; }
    .chart-title { margin: 0 0 1rem; font-size: 0.875rem; font-weight: 600; color: var(--text-color-secondary); }
    .bar-chart { display: flex; flex-direction: column; gap: 0.5rem; }
    .bar-row { display: flex; align-items: center; gap: 0.5rem; }
    .bar-label { width: 140px; font-size: 0.78rem; color: var(--text-color-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { flex: 1; height: 18px; background: var(--surface-ground); border-radius: 4px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; background: var(--blue-400); border-radius: 4px; min-width: 2px; transition: width 0.3s; text-decoration: none; }
    .bar-fill:hover { background: var(--blue-500); }
    .bar-count { width: 32px; text-align: right; font-size: 0.8rem; font-weight: 600; }

    .funnel-row { display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap; }
    .funnel-chart { flex: 1; min-width: 280px; display: flex; flex-direction: column; align-items: center; gap: 0; }
    .funnel-step { width: 100%; display: flex; flex-direction: column; align-items: center; }
    .funnel-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem; background: var(--blue-100); border-radius: 6px; text-decoration: none; color: var(--blue-800); font-size: 0.85rem; font-weight: 500; transition: background 0.15s; min-width: 30%; }
    .funnel-bar:hover { background: var(--blue-200); }
    .funnel-bar-label { flex: 1; }
    .funnel-bar-count { font-weight: 700; font-size: 1rem; }
    .funnel-arrow { color: var(--text-color-secondary); font-size: 1.2rem; padding: 0.15rem 0; }

    .funnel-metrics { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 1.25rem; min-width: 240px; }
    .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--surface-border); font-size: 0.875rem; }
    .metric-row:last-child { border-bottom: none; }
    .metric-label { color: var(--text-color-secondary); }

    @media (max-width: 600px) {
      .dashboard { padding: 1rem; }
      .card-grid { grid-template-columns: repeat(2, 1fr); }
      .bar-label { width: 90px; }
    }
  `],
})
export class DashboardPage implements OnInit {
  protected readonly store = inject(AuthStore);
  private readonly api = inject(DashboardApi);
  private readonly router = inject(Router);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly agentData = signal<AgentDashboard | null>(null);
  readonly managerData = signal<ManagerDashboard | null>(null);
  readonly funnelData = signal<FunnelData | null>(null);

  readonly isManager = computed(() => this.store.hasPermission('dashboard.view_all'));

  ngOnInit(): void {
    const isManager = this.isManager();
    const calls: Promise<void>[] = [];

    // Always load agent dashboard (own jobs)
    calls.push(
      this.api.agentDashboard().toPromise()
        .then((d) => { if (d) this.agentData.set(d); })
        .catch(() => {}),
    );

    if (isManager) {
      calls.push(
        this.api.managerDashboard().toPromise()
          .then((d) => { if (d) this.managerData.set(d); })
          .catch(() => {}),
      );
      calls.push(
        this.api.funnel().toPromise()
          .then((d) => { if (d) this.funnelData.set(d); })
          .catch(() => {}),
      );
    }

    Promise.all(calls)
      .then(() => this.state.set('none'))
      .catch(() => this.state.set('error'));
  }

  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

  activeStatusKeys(m: ManagerDashboard): string[] {
    return ACTIVE_STATUSES.filter((s) => m.jobsByStatus[s] !== undefined);
  }

  barWidth(value: number, m: ManagerDashboard): number {
    const max = Math.max(...ACTIVE_STATUSES.map((s) => m.jobsByStatus[s] ?? 0), 1);
    return Math.round((value / max) * 100);
  }

  funnelStages(f: FunnelData): { key: string; label: string; value: number; width: number; routeParams: Record<string, string> }[] {
    const max = Math.max(f.stages.job, 1);
    return [
      { key: 'job', label: 'Job', value: f.stages.job, width: 100, routeParams: {} },
      { key: 'quotation', label: 'ใบเสนอราคา', value: f.stages.quotation, width: Math.round((f.stages.quotation / max) * 100), routeParams: { status: 'QUOTATION_REQUESTED' } },
      { key: 'proposal', label: 'ใบเสนอ', value: f.stages.proposal, width: Math.round((f.stages.proposal / max) * 100), routeParams: { status: 'PROPOSAL_SENT' } },
      { key: 'accepted', label: 'ลูกค้ายืนยัน', value: f.stages.accepted, width: Math.round((f.stages.accepted / max) * 100), routeParams: { status: 'CUSTOMER_ACCEPTED' } },
      { key: 'policy', label: 'กรมธรรม์', value: f.stages.policy, width: Math.round((f.stages.policy / max) * 100), routeParams: {} },
    ];
  }
}

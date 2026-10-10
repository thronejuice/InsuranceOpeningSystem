import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { ThDatePipe } from '../../../shared/pipes/th-date.pipe';
import { UiButton, UiDialog } from '../../../shared/ui';
import {
  PoliciesExtendedApi,
  type PolicyVersionResponse,
} from '../data/policies-extended.api';

@Component({
  selector: 'app-policy-versions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    AppStateComponent,
    ThDatePipe,
    UiButton,
    UiDialog,
  ],
  template: `
    <h4 class="section-title">ประวัติการปรับปรุงกรมธรรม์ (Version History)</h4>

    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else if (versions().length === 0) {
      <app-state state="empty" emptyMessage="ยังไม่มีบันทึกเวอร์ชันย้อนหลัง (เวอร์ชันปัจจุบันเป็นเวอร์ชันตั้งต้น)" />
    } @else {
      <div class="timeline">
        @for (v of versions(); track v.id) {
          <div class="timeline-item">
            <div class="version-badge">v{{ v.version }}</div>
            <div class="version-content">
              <div class="version-header">
                <span class="version-reason">{{ v.reason ?? 'บันทึกภาพก่อนหน้าการสลักหลัง' }}</span>
                <span class="version-date">{{ v.createdAt | thDate }}</span>
              </div>
              <div class="version-actions">
                <ui-button
                  label="ดูข้อมูลสแนปช็อต (Snapshot)"
                  size="small"
                  [text]="true"
                  icon="pi pi-eye"
                  (onClick)="viewSnapshot(v)"
                />
              </div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Snapshot Viewer Dialog -->
    <ui-dialog
      header="รายละเอียด Snapshot เวอร์ชัน"
      [visible]="dialogVisible()"
      [modal]="true"
      [style]="{ width: '600px' }"
      (onHide)="dialogVisible.set(false)"
    >
      @if (selectedVersion(); as v) {
        <div>
          <div class="mb-2 text-sm text-secondary">
            เวอร์ชัน <strong>v{{ v.version }}</strong> บันทึกเมื่อ {{ v.createdAt | thDate }}
          </div>
          <div class="bg-ground p-3 rounded mono text-xs" style="max-height: 400px; overflow-y: auto;">
            <pre>{{ v.snapshot | json }}</pre>
          </div>
        </div>
      }
      <ng-template #footer>
        <div class="dialog-actions">
          <ui-button label="ปิด" (onClick)="dialogVisible.set(false)" />
        </div>
      </ng-template>
    </ui-dialog>
  `,
  styles: [`
    .section-title { font-size: 0.95rem; font-weight: 600; color: var(--primary-color); margin: 0 0 1rem; }
    .timeline { display: flex; flex-direction: column; gap: 1rem; padding-left: 0.5rem; }
    .timeline-item { display: flex; gap: 1rem; align-items: flex-start; position: relative; }
    .version-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 2.2rem; height: 2.2rem; border-radius: 50%;
      background: var(--primary-color); color: white; font-weight: 700; font-size: 0.85rem;
      flex-shrink: 0;
    }
    .version-content {
      flex: 1; background: var(--surface-card); border: 1px solid var(--surface-border);
      border-radius: 6px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;
    }
    .version-header { display: flex; flex-direction: column; gap: 0.2rem; }
    .version-reason { font-size: 0.9rem; font-weight: 500; }
    .version-date { font-size: 0.75rem; color: var(--text-color-secondary); }
    .dialog-actions { display: flex; justify-content: flex-end; }
    .bg-ground { background: var(--surface-ground); }
    .p-3 { padding: 0.75rem; }
    .rounded { border-radius: 6px; }
    .mono { font-family: monospace; }
    .mb-2 { margin-bottom: 0.5rem; }
  `],
})
export class PolicyVersionsComponent implements OnInit {
  private readonly api = inject(PoliciesExtendedApi);

  readonly policyId = input.required<string>();

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly versions = signal<PolicyVersionResponse[]>([]);
  readonly dialogVisible = signal(false);
  readonly selectedVersion = signal<PolicyVersionResponse | null>(null);

  ngOnInit(): void {
    this.api.getPolicyVersions(this.policyId()).subscribe({
      next: (list) => {
        this.versions.set(list);
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  viewSnapshot(v: PolicyVersionResponse): void {
    this.selectedVersion.set(v);
    this.dialogVisible.set(true);
  }
}


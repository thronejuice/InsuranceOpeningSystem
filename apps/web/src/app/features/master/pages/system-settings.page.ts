import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import { MessageService, UiButton, UiInput, UiMessage } from '../../../shared/ui';
import { CommissionsApi } from '../../commissions/data/commissions.api';

const LABELS: Record<string, string> = {
  'commission.wht_rate': 'อัตราหัก ณ ที่จ่าย (WHT) %',
  'commission.default_agent_share_pct': 'ส่วนแบ่ง Agent เริ่มต้น % ของค่าคอมรวม',
  'commission.override_rate': 'Override หัวหน้าทีม % ของค่าคอมรวม',
};

interface Row {
  key: string;
  label: string;
  description: string;
  saved: string;
  value: string;
  error: string | null;
  saving: boolean;
}

@Component({
  selector: 'app-system-settings-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiButton, UiInput, UiMessage, AppStateComponent],
  template: `
    @if (state() === 'loading') {
      <app-state state="loading" />
    } @else if (state() === 'error') {
      <app-state state="error" />
    } @else {
      <p class="hint">ค่าที่ใช้คำนวณค่าคอมมิชชันของกรมธรรม์ที่ออกหลังจากนี้ (รายการที่คำนวณแล้วไม่เปลี่ยนตาม)</p>
      <div class="card">
        @for (r of rows(); track r.key) {
          <div class="row">
            <div class="meta">
              <label [for]="r.key">{{ r.label }}</label>
              <small>{{ r.description }}</small>
            </div>
            <input uiInput [id]="r.key" [ngModel]="r.value" (ngModelChange)="edit(r.key, $event)" inputmode="decimal" class="val" />
            <ui-button label="บันทึก" size="small" [loading]="r.saving" [disabled]="r.saving || r.value === r.saved" (onClick)="save(r.key)" />
          </div>
          @if (r.error) { <ui-message severity="error">{{ r.error }}</ui-message> }
        }
      </div>
    }
  `,
  styles: [`
    .hint { color: var(--text-color-secondary); font-size: 0.85rem; }
    .card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; max-width: 760px; }
    .row { display: flex; gap: 1rem; align-items: center; }
    .meta { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; }
    .meta label { font-weight: 500; font-size: 0.9rem; }
    .meta small { color: var(--text-color-secondary); }
    .val { width: 110px; text-align: right; }
  `],
})
export class SystemSettingsPage implements OnInit {
  private readonly api = inject(CommissionsApi);
  private readonly toast = inject(MessageService);

  readonly state = signal<'loading' | 'error' | 'none'>('loading');
  readonly rows = signal<Row[]>([]);

  ngOnInit(): void {
    this.api.listSettings().subscribe({
      next: (list) => {
        this.rows.set(
          list.map((s) => ({ key: s.key, label: LABELS[s.key] ?? s.key, description: s.description ?? '', saved: s.value, value: s.value, error: null, saving: false })),
        );
        this.state.set('none');
      },
      error: () => this.state.set('error'),
    });
  }

  edit(key: string, value: string): void {
    this.patch(key, { value, error: null });
  }

  save(key: string): void {
    const row = this.rows().find((r) => r.key === key);
    if (!row) return;
    this.patch(key, { saving: true, error: null });
    this.api.updateSetting(key, row.value.trim()).subscribe({
      next: (s) => {
        this.patch(key, { saving: false, saved: s.value, value: s.value });
        this.toast.add({ severity: 'success', summary: 'บันทึกแล้ว' });
      },
      error: (e: HttpErrorResponse) =>
        this.patch(key, { saving: false, error: (e.error as { message?: string } | null)?.message ?? 'บันทึกไม่สำเร็จ' }),
    });
  }

  private patch(key: string, change: Partial<Row>): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }
}

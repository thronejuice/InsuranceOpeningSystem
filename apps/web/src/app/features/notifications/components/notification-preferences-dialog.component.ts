import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService, UiButton, UiDialog, UiToggleSwitch } from '../../../shared/ui';
import { AppStateComponent } from '../../../shared/components/app-state/app-state.component';
import {
  NotificationsApi,
  type NotificationPreferenceItem,
  type NotificationType,
} from '../data/notifications.api';

interface EventDef {
  type: NotificationType;
  label: string;
  desc: string;
  icon: string;
}

const EVENT_DEFINITIONS: EventDef[] = [
  { type: 'JOB_ASSIGNED', label: 'งานถูกมอบหมาย', desc: 'เมื่อมีงานใหม่ถูกมอบหมายให้คุณรับผิดชอบ', icon: 'pi pi-user-plus' },
  { type: 'DOCUMENT_MISSING', label: 'เอกสารไม่ครบถ้วน', desc: 'เมื่อระบบตรวจพบเอกสารจำเป็นที่ยังขาดอยู่', icon: 'pi pi-file-excel' },
  { type: 'QUOTATION_RECEIVED', label: 'ได้รับใบเสนอราคา', desc: 'เมื่อบริษัทประกันส่งใบเสนอราคากลับมา', icon: 'pi pi-tag' },
  { type: 'APPROVAL_REQUIRED', label: 'ต้องได้รับการอนุมัติ', desc: 'เมื่อใบเสนอราคาของคุณต้องผ่านการอนุมัติ', icon: 'pi pi-exclamation-circle' },
  { type: 'APPROVAL_REQUESTED', label: 'มีคำขออนุมัติใหม่', desc: 'เมื่อมีรายการขออนุมัติส่งถึงคุณ', icon: 'pi pi-check-square' },
  { type: 'PROPOSAL_SENT', label: 'ส่งใบเสนอราคาแล้ว', desc: 'เมื่อมีการส่งใบเสนอราคาให้ลูกค้า', icon: 'pi pi-send' },
  { type: 'CUSTOMER_ACCEPTED', label: 'ลูกค้ายอมรับข้อเสนอ', desc: 'เมื่อลูกค้ายืนยันตกลงทำประกัน', icon: 'pi pi-thumbs-up' },
  { type: 'CUSTOMER_REJECTED', label: 'ลูกค้าปฏิเสธข้อเสนอ', desc: 'เมื่อลูกค้าปฏิเสธข้อเสนอประกันภัย', icon: 'pi pi-thumbs-down' },
  { type: 'POLICY_ISSUED', label: 'ออกกรมธรรม์สำเร็จ', desc: 'เมื่อระบบออกกรมธรรม์และเลขที่กรมธรรม์เสร็จสมบูรณ์', icon: 'pi pi-shield' },
  { type: 'PAYMENT_OVERDUE', label: 'การชำระเงินเกินกำหนด', desc: 'เมื่อยอดชำระเบี้ยประกันเกินกำหนดเวลา', icon: 'pi pi-clock' },
  { type: 'TASK_DUE', label: 'ถึงกำหนดเวลางาน', desc: 'เมื่อมีงานติดตามที่ใกล้ถึงหรือเลยกำหนด', icon: 'pi pi-calendar' },
  { type: 'RENEWAL_DUE', label: 'ถึงกำหนดเวลาต่ออายุ', desc: 'เมื่อกรมธรรม์ใกล้หมดอายุและต้องดำเนินการต่ออายุ', icon: 'pi pi-refresh' },
];

export interface PreferenceFormItem {
  type: NotificationType;
  label: string;
  desc: string;
  icon: string;
  inApp: boolean;
  email: boolean;
}

@Component({
  selector: 'app-notification-preferences-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, UiDialog, UiButton, UiToggleSwitch, AppStateComponent],
  template: `
    <ui-dialog
      [(visible)]="visible"
      header="ตั้งค่าการแจ้งเตือน (Notification Preferences)"
      icon="pi pi-bell"
      [modal]="true"
      [style]="{ width: '640px', maxWidth: '95vw' }"
    >
      @if (loading()) {
        <app-state state="loading" />
      } @else {
        <div class="pref-container">
          <p class="pref-desc">
            เลือกช่องทางที่คุณต้องการรับการแจ้งเตือนสำหรับแต่ละประเภทเหตุการณ์
          </p>

          <div class="pref-table-header">
            <div class="col-event">ประเภทการแจ้งเตือน</div>
            <div class="col-toggle">ในระบบ (In-App)</div>
            <div class="col-toggle">อีเมล (Email)</div>
          </div>

          <div class="pref-list">
            @for (item of items(); track item.type; let idx = $index) {
              <div class="pref-row">
                <div class="col-event">
                  <div class="event-icon">
                    <i [class]="item.icon"></i>
                  </div>
                  <div class="event-info">
                    <span class="event-title">{{ item.label }}</span>
                    <span class="event-desc">{{ item.desc }}</span>
                  </div>
                </div>

                <div class="col-toggle">
                  <ui-toggleswitch
                    [(ngModel)]="item.inApp"
                    (ngModelChange)="onItemChanged(idx, 'inApp', $event)"
                  />
                </div>

                <div class="col-toggle">
                  <ui-toggleswitch
                    [(ngModel)]="item.email"
                    (ngModelChange)="onItemChanged(idx, 'email', $event)"
                  />
                </div>
              </div>
            }
          </div>

          <div class="dialog-actions">
            <ui-button
              label="ยกเลิก"
              icon="pi pi-times"
              severity="secondary"
              [outlined]="true"
              (onClick)="visible.set(false)"
            />
            <ui-button
              label="บันทึกการตั้งค่า"
              icon="pi pi-check"
              [loading]="saving()"
              (onClick)="save()"
            />
          </div>
        </div>
      }
    </ui-dialog>
  `,
  styles: [`
    .pref-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-top: 0.5rem;
    }
    .pref-desc {
      font-size: 0.875rem;
      color: var(--text-color-secondary);
      margin: 0;
    }
    .pref-table-header {
      display: flex;
      align-items: center;
      padding: 0.6rem 0.75rem;
      background: var(--surface-100);
      border-radius: var(--radius-md);
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-color-secondary);
    }
    .col-event {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .col-toggle {
      width: 120px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .pref-list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      max-height: 420px;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .pref-row {
      display: flex;
      align-items: center;
      padding: 0.75rem;
      border-radius: var(--radius-md);
      transition: background 0.15s ease;
      border-bottom: 1px solid var(--surface-border-subtle);
    }
    .pref-row:hover {
      background: var(--surface-hover);
    }
    .event-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--primary-50);
      color: var(--primary-600);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      flex-shrink: 0;
    }
    .event-info {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }
    .event-title {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-color);
    }
    .event-desc {
      font-size: 0.78rem;
      color: var(--text-color-secondary);
      margin-top: 0.15rem;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--surface-border);
    }
  `],
})
export class NotificationPreferencesDialogComponent {
  private readonly api = inject(NotificationsApi);
  private readonly toast = inject(MessageService);

  readonly visible = model<boolean>(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly items = signal<PreferenceFormItem[]>([]);

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.loadPreferences();
      }
    });
  }

  loadPreferences(): void {
    this.loading.set(true);
    this.api.getPreferences().subscribe({
      next: (prefs) => {
        const prefMap = new Map<NotificationType, NotificationPreferenceItem>(
          prefs.map((p) => [p.type, p]),
        );

        const formItems: PreferenceFormItem[] = EVENT_DEFINITIONS.map((def) => {
          const existing = prefMap.get(def.type);
          return {
            ...def,
            inApp: existing ? existing.inApp : true,
            email: existing ? existing.email : true,
          };
        });

        this.items.set(formItems);
        this.loading.set(false);
      },
      error: () => {
        // Fallback with all enabled
        this.items.set(
          EVENT_DEFINITIONS.map((def) => ({
            ...def,
            inApp: true,
            email: true,
          })),
        );
        this.loading.set(false);
      },
    });
  }

  onItemChanged(index: number, field: 'inApp' | 'email', val: boolean): void {
    const current = [...this.items()];
    current[index] = { ...current[index], [field]: val };
    this.items.set(current);
  }

  save(): void {
    this.saving.set(true);
    const payload = {
      preferences: this.items().map((item) => ({
        type: item.type,
        inApp: item.inApp,
        email: item.email,
      })),
    };

    this.api.updatePreferences(payload).subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: 'บันทึกสำเร็จ',
          detail: 'บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว',
        });
        this.saving.set(false);
        this.visible.set(false);
      },
      error: () => {
        this.toast.add({
          severity: 'error',
          summary: 'ผิดพลาด',
          detail: 'ไม่สามารถบันทึกการตั้งค่าได้',
        });
        this.saving.set(false);
      },
    });
  }
}


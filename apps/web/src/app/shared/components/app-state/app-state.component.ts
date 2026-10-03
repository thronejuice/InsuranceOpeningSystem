import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Message } from 'primeng/message';

export type AppStateType = 'loading' | 'empty' | 'error' | 'none';

@Component({
  selector: 'app-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressSpinner, Message],
  template: `
    @if (state === 'loading') {
      <div class="state-center">
        <p-progress-spinner strokeWidth="4" styleClass="w-4rem h-4rem" />
      </div>
    } @else if (state === 'empty') {
      <div class="state-center state-empty">
        <i class="pi pi-inbox text-4xl mb-2" style="color: var(--text-color-secondary)"></i>
        <p>{{ emptyMessage }}</p>
      </div>
    } @else if (state === 'error') {
      <div class="state-center">
        <p-message severity="error">{{ errorMessage }}</p-message>
      </div>
    }
  `,
  styles: [`
    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: var(--text-color-secondary);
    }
    .state-empty p {
      margin: 0;
      font-size: 0.95rem;
    }
  `],
})
export class AppStateComponent {
  @Input() state: AppStateType = 'none';
  @Input() emptyMessage = 'ไม่พบข้อมูล';
  @Input() errorMessage = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

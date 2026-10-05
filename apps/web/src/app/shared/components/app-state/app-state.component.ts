import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { UiMessage, UiProgressSpinner } from '../../ui';

export type AppStateType = 'loading' | 'empty' | 'error' | 'none';

@Component({
  selector: 'app-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiProgressSpinner, UiMessage],
  template: `
    @if (state === 'loading') {
      @if (mode === 'spinner') {
        <div class="state-center">
          <ui-progress-spinner strokeWidth="4" styleClass="w-4rem h-4rem" />
        </div>
      } @else {
        <div class="skeleton-container">
          <div class="skeleton-card modern-card">
            <div class="skeleton-header">
              <div class="skeleton-shimmer skeleton-icon"></div>
              <div class="skeleton-title-col">
                <div class="skeleton-shimmer skeleton-line skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-line skeleton-sub"></div>
              </div>
            </div>
            <div class="skeleton-fields-grid">
              <div class="skeleton-field-block">
                <div class="skeleton-shimmer skeleton-label"></div>
                <div class="skeleton-shimmer skeleton-input"></div>
              </div>
              <div class="skeleton-field-block">
                <div class="skeleton-shimmer skeleton-label"></div>
                <div class="skeleton-shimmer skeleton-input"></div>
              </div>
            </div>
          </div>
          <div class="skeleton-card modern-card">
            <div class="skeleton-header">
              <div class="skeleton-shimmer skeleton-icon"></div>
              <div class="skeleton-title-col">
                <div class="skeleton-shimmer skeleton-line skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-line skeleton-sub"></div>
              </div>
            </div>
            <div class="skeleton-fields-grid trio">
              <div class="skeleton-field-block">
                <div class="skeleton-shimmer skeleton-label"></div>
                <div class="skeleton-shimmer skeleton-input"></div>
              </div>
              <div class="skeleton-field-block">
                <div class="skeleton-shimmer skeleton-label"></div>
                <div class="skeleton-shimmer skeleton-input"></div>
              </div>
              <div class="skeleton-field-block">
                <div class="skeleton-shimmer skeleton-label"></div>
                <div class="skeleton-shimmer skeleton-input"></div>
              </div>
            </div>
          </div>
        </div>
      }
    } @else if (state === 'empty') {
      <div class="state-center state-empty">
        <i class="pi pi-inbox text-4xl mb-2" style="color: var(--text-color-secondary)"></i>
        <p>{{ emptyMessage }}</p>
      </div>
    } @else if (state === 'error') {
      <div class="state-center">
        <ui-message severity="error">{{ errorMessage }}</ui-message>
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
    .skeleton-container {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .skeleton-card {
      padding: 1.5rem;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-lg);
    }
    .skeleton-header {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      margin-bottom: 1.5rem;
    }
    .skeleton-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      flex-shrink: 0;
    }
    .skeleton-title-col {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
    }
    .skeleton-line {
      height: 12px;
      border-radius: 4px;
    }
    .skeleton-title {
      width: 35%;
      height: 18px;
    }
    .skeleton-sub {
      width: 55%;
    }
    .skeleton-fields-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }
    .skeleton-fields-grid.trio {
      grid-template-columns: repeat(3, 1fr);
    }
    .skeleton-field-block {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .skeleton-label {
      width: 40%;
      height: 12px;
      border-radius: 3px;
    }
    .skeleton-input {
      width: 100%;
      height: 40px;
      border-radius: 8px;
    }
    @media (max-width: 640px) {
      .skeleton-fields-grid, .skeleton-fields-grid.trio {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class AppStateComponent {
  @Input() state: AppStateType = 'none';
  @Input() mode: 'skeleton' | 'spinner' = 'skeleton';
  @Input() emptyMessage = 'ไม่พบข้อมูล';
  @Input() errorMessage = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

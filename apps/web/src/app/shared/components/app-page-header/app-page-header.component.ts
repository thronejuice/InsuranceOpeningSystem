import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header-main">
        <div class="title-row">
          @if (icon) {
            <div class="header-icon-pill">
              <i [class]="icon"></i>
            </div>
          }
          <div>
            <div class="title-with-badge">
              <h1 class="page-title">{{ title }}</h1>
              @if (badge) {
                <span class="header-badge">{{ badge }}</span>
              }
            </div>
            @if (subtitle) {
              <p class="page-subtitle">{{ subtitle }}</p>
            }
          </div>
        </div>
      </div>
      <div class="page-header-actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 1.75rem;
      gap: 1rem;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .header-icon-pill {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: var(--primary-50);
      color: var(--primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      border: 1px solid var(--primary-100);
      flex-shrink: 0;
    }
    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .page-title {
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--text-color);
      letter-spacing: -0.02em;
      margin: 0;
    }
    .header-badge {
      padding: 0.2rem 0.6rem;
      background: var(--surface-hover);
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-color-secondary);
    }
    .page-subtitle {
      color: var(--text-color-secondary);
      font-size: 0.88rem;
      margin: 0.2rem 0 0 0;
    }
    .page-header-actions {
      display: flex;
      gap: 0.6rem;
      align-items: center;
    }
  `],
})
export class AppPageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() icon?: string;
  @Input() badge?: string;
}

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <div class="page-header-main">
        <h1 class="page-title">{{ title }}</h1>
        @if (subtitle) {
          <p class="page-subtitle">{{ subtitle }}</p>
        }
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
      margin-bottom: 1.5rem;
    }
    .page-title {
      font-size: 1.4rem;
      font-weight: 600;
      margin: 0 0 0.25rem 0;
    }
    .page-subtitle {
      color: var(--text-color-secondary);
      font-size: 0.9rem;
      margin: 0;
    }
    .page-header-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
  `],
})
export class AppPageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
}

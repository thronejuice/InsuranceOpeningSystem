import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { SidebarService } from './sidebar.service';
import { TopbarComponent } from './topbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="app-shell">
      @if (sidebarService.isMobile() && !sidebarService.isHidden()) {
        <div
          class="sidebar-backdrop"
          (click)="sidebarService.hide()"
          tabindex="-1"
          aria-hidden="true"
        ></div>
      }
      <app-sidebar />
      <div class="app-main">
        <app-topbar />
        <main class="app-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
    .sidebar-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 40;
      backdrop-filter: blur(2px);
      transition: opacity 0.2s ease;
    }
    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }
    .app-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      background: var(--surface-ground);
    }
  `],
})
export class ShellComponent {
  protected readonly sidebarService = inject(SidebarService);
}


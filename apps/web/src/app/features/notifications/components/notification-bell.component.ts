import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { interval, startWith, switchMap } from 'rxjs';
import { NotificationsApi, type NotificationRecord } from '../data/notifications.api';
import { UiButton, UiDivider, UiPopover } from '../../../shared/ui';

const ENTITY_ROUTES: Record<string, string> = {
  JOB: '/jobs',
  POLICY: '/policies',
  PAYMENT: '/payments',
  TASK: '/tasks',
};

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiPopover, UiButton, UiDivider, DatePipe],
  template: `
    <div class="bell-wrapper">
      <ui-button
        icon="pi pi-bell"
        severity="secondary"
        [text]="true"
        [rounded]="true"
        (onClick)="panel.toggle($event)"
        aria-label="Notifications"
      />
      @if (unreadCount() > 0) {
        <span class="notif-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
      }
    </div>

    <ui-popover #panel>
      <div class="notif-header">
        <span class="notif-title">การแจ้งเตือน</span>
        @if (unreadCount() > 0) {
          <ui-button
            label="อ่านทั้งหมด"
            icon="pi pi-check-circle"
            [text]="true"
            size="small"
            (onClick)="markAllRead()"
          />
        }
      </div>

      <ui-divider styleClass="m-0" />

      <div class="notif-list">
        @if (items().length === 0) {
          <div class="notif-empty">ไม่มีการแจ้งเตือน</div>
        }
        @for (n of items(); track n.id) {
          <div
            class="notif-item"
            [class.unread]="!n.isRead"
            (click)="onItemClick(n)"
            (keydown.enter)="onItemClick(n)"
            tabindex="0"
            role="button"
          >
            <div class="notif-dot" [class.visible]="!n.isRead"></div>
            <div class="notif-body">
              <div class="notif-item-title">{{ n.title }}</div>
              <div class="notif-item-msg">{{ n.message }}</div>
              <div class="notif-item-time">{{ n.createdAt | date: 'dd/MM/yy HH:mm' }}</div>
            </div>
          </div>
        }
      </div>
    </ui-popover>
  `,
  styles: [`
    .bell-wrapper { position: relative; display: inline-flex; }
    .notif-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      background: var(--red-500);
      color: white;
      border-radius: 10px;
      font-size: 0.65rem;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .notif-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      min-width: 320px;
    }
    .notif-title { font-weight: 600; font-size: 0.95rem; }
    .notif-list { max-height: 400px; overflow-y: auto; }
    .notif-empty { padding: 2rem; text-align: center; color: var(--text-color-secondary); }
    .notif-item {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.75rem 1rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .notif-item:hover { background: var(--surface-hover); }
    .notif-item.unread { background: var(--blue-50); }
    .notif-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--primary-color);
      margin-top: 5px;
      flex-shrink: 0;
      opacity: 0;
    }
    .notif-dot.visible { opacity: 1; }
    .notif-body { flex: 1; min-width: 0; }
    .notif-item-title { font-weight: 500; font-size: 0.875rem; }
    .notif-item-msg {
      font-size: 0.8rem;
      color: var(--text-color-secondary);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .notif-item-time { font-size: 0.75rem; color: var(--text-color-secondary); margin-top: 4px; }
  `],
})
export class NotificationBellComponent implements OnInit {
  private readonly api = inject(NotificationsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly unreadCount = signal(0);
  protected readonly items = signal<NotificationRecord[]>([]);

  ngOnInit(): void {
    interval(60_000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef), switchMap(() => this.api.list()))
      .subscribe((res) => {
        this.items.set(res.items);
        this.unreadCount.set(res.unreadCount);
      });
  }

  protected onItemClick(n: NotificationRecord): void {
    if (!n.isRead) {
      this.api.markRead(n.id).subscribe(() => {
        this.items.update((list) =>
          list.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      });
    }
    if (n.entityType && n.entityId) {
      const base = ENTITY_ROUTES[n.entityType];
      if (base) void this.router.navigate([base, n.entityId]);
    }
  }

  protected markAllRead(): void {
    this.api.markAllRead().subscribe(() => {
      this.items.update((list) => list.map((n) => ({ ...n, isRead: true })));
      this.unreadCount.set(0);
    });
  }
}

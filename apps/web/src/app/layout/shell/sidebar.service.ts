import { inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private readonly STORAGE_KEY = 'sidebar_hidden';
  private readonly COLLAPSE_KEY = 'sidebar_collapsed';
  private readonly router = inject(Router);

  private getInitialState(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) return stored === 'true';
      return window.innerWidth <= 768;
    } catch {
      return false;
    }
  }

  private getInitialCollapsedState(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(this.COLLAPSE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  }

  readonly isHidden = signal<boolean>(this.getInitialState());
  readonly isCollapsed = signal<boolean>(this.getInitialCollapsedState());
  readonly isMobile = signal<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  );

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.isMobile.set(window.innerWidth <= 768);
      });
    }

    // Auto-close menu on navigation if on mobile
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isMobile() && !this.isHidden()) {
          this.hide();
        }
      });
  }

  toggle(): void {
    this.isHidden.update((v) => {
      const next = !v;
      this.persist(next);
      return next;
    });
  }

  toggleCollapse(): void {
    this.isCollapsed.update((v) => {
      const next = !v;
      this.persistCollapsed(next);
      return next;
    });
  }

  collapse(): void {
    this.isCollapsed.set(true);
    this.persistCollapsed(true);
  }

  expand(): void {
    this.isCollapsed.set(false);
    this.persistCollapsed(false);
  }

  hide(): void {
    this.isHidden.set(true);
    this.persist(true);
  }

  show(): void {
    this.isHidden.set(false);
    this.persist(false);
  }

  private persist(val: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, String(val));
    } catch {
      // ignore storage errors
    }
  }

  private persistCollapsed(val: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.COLLAPSE_KEY, String(val));
    } catch {
      // ignore storage errors
    }
  }
}

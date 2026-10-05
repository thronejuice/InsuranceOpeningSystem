import {
  ChangeDetectionStrategy, Component, ContentChild, Injectable, TemplateRef, ViewChild, effect, inject, input, model,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgTemplateOutlet } from '@angular/common';

// ── Toast (MessageService) ───────────────────────────────────────────────────

export interface ToastMessage {
  severity?: 'success' | 'info' | 'warn' | 'error';
  summary?: string;
  detail?: string;
  life?: number;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly snack = inject(MatSnackBar);

  add(m: ToastMessage): void {
    const text = [m.summary, m.detail].filter(Boolean).join(' — ');
    this.snack.open(text, 'ปิด', {
      duration: m.life ?? (m.severity === 'error' ? 6000 : 3500),
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['ui-toast', `ui-toast--${m.severity ?? 'info'}`],
    });
  }
  clear(): void { this.snack.dismiss(); }
}

/** Kept so templates keep their `<ui-toast />` marker; notifications are shown by MessageService itself. */
@Component({ selector: 'ui-toast', standalone: true, template: '' })
export class UiToast {
  readonly position = input<string>('top-right');
}

// ── Confirm dialog (ConfirmationService) ─────────────────────────────────────

export interface Confirmation {
  message?: string;
  header?: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  accept?: () => void;
  reject?: () => void;
}

@Component({
  selector: 'ui-confirm-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.header || 'ยืนยัน' }}</h2>
    <mat-dialog-content class="ui-confirm-body">
      <i [class]="data.icon || 'pi pi-exclamation-triangle'"></i> <span>{{ data.message }}</span>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false">{{ data.rejectLabel || 'ยกเลิก' }}</button>
      <button matButton="filled" [mat-dialog-close]="true" cdkFocusInitial>{{ data.acceptLabel || 'ตกลง' }}</button>
    </mat-dialog-actions>
  `,
})
export class UiConfirmContent {
  protected readonly data = inject<Confirmation>(MAT_DIALOG_DATA);
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly dialog = inject(MatDialog);

  confirm(c: Confirmation): void {
    const ref = this.dialog.open(UiConfirmContent, { data: c, width: '420px' });
    ref.afterClosed().subscribe((ok: boolean | undefined) => (ok ? c.accept?.() : c.reject?.()));
  }
}

@Component({ selector: 'ui-confirm-dialog', standalone: true, template: '' })
export class UiConfirmDialog {}

// ── Dialog ───────────────────────────────────────────────────────────────────

@Component({
  selector: 'ui-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, NgTemplateOutlet],
  template: `
    <ng-template #tpl>
      <h2 mat-dialog-title>{{ header() }}</h2>
      <mat-dialog-content><ng-content /></mat-dialog-content>
      @if (footer) {
        <mat-dialog-actions align="end"><ng-container *ngTemplateOutlet="footer" /></mat-dialog-actions>
      }
    </ng-template>
  `,
})
export class UiDialog {
  private readonly dialog = inject(MatDialog);
  private ref?: MatDialogRef<unknown>;

  readonly visible = model(false);
  readonly header = input<string>('');
  readonly modal = input(true);
  readonly closable = input(true);
  readonly style = input<Record<string, string> | null>(null);

  @ViewChild('tpl', { static: true }) tpl!: TemplateRef<unknown>;
  @ContentChild('footer') footer?: TemplateRef<unknown>;

  constructor() {
    effect(() => {
      const show = this.visible();
      if (show && !this.ref) this.open();
      else if (!show && this.ref) { this.ref.close(); this.ref = undefined; }
    });
  }

  private open(): void {
    const width = this.style()?.['width'];
    this.ref = this.dialog.open(this.tpl, { width: width ?? '520px', maxWidth: '95vw', disableClose: !this.closable(), autoFocus: 'first-tabbable' });
    this.ref.afterClosed().subscribe(() => { this.ref = undefined; this.visible.set(false); });
  }
}

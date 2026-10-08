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
    <h2 mat-dialog-title class="ui-dialog-title">
      <i [class]="data.icon || 'pi pi-question-circle'"></i>
      <span>{{ data.header || 'ยืนยัน' }}</span>
    </h2>
    <mat-dialog-content class="ui-confirm-body">
      <i [class]="data.icon || 'pi pi-exclamation-triangle'"></i> <span>{{ data.message }}</span>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="outlined" [mat-dialog-close]="false" class="ui-btn ui-btn--danger">
        <i class="pi pi-times mr-1"></i>
        <span>{{ data.rejectLabel || 'ยกเลิก' }}</span>
      </button>
      <button matButton="filled" [mat-dialog-close]="true" cdkFocusInitial>
        <i class="pi pi-check mr-1"></i>
        <span>{{ data.acceptLabel || 'ตกลง' }}</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .ui-dialog-title { display: flex; align-items: center; gap: 0.5rem; }
    .ui-dialog-title .pi { font-size: 1.25rem; color: var(--primary-color, #0284c7); }
    button[matButton] { display: inline-flex; align-items: center; gap: 0.25rem; }
  `],
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
  exportAs: 'uiDialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, NgTemplateOutlet],
  template: `
    <ng-template #tpl>
      <div class="ui-dialog-header">
        <h2 mat-dialog-title class="ui-dialog-title">
          @if (resolvedIcon()) {
            <i [class]="resolvedIcon()"></i>
          }
          <span>{{ header() }}</span>
        </h2>
        @if (closable()) {
          <button type="button" class="ui-dialog-close-btn" (click)="close()" aria-label="ปิด">
            <i class="pi pi-times"></i>
          </button>
        }
      </div>
      <mat-dialog-content><ng-content /></mat-dialog-content>
      @if (footer) {
        <mat-dialog-actions align="end"><ng-container *ngTemplateOutlet="footer; context: { $implicit: this, dialog: this }" /></mat-dialog-actions>
      }
    </ng-template>
  `,
  styles: [`
    .ui-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.25rem 0.5rem;
    }
    .ui-dialog-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0;
      padding: 0 !important;
    }
    .ui-dialog-title .pi {
      font-size: 1.15rem;
      color: var(--primary-color, #0284c7);
    }
    .ui-dialog-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: none;
      background: transparent;
      border-radius: 50%;
      cursor: pointer;
      color: var(--text-color-secondary, #64748b);
      font-size: 1rem;
      transition: background-color 0.15s, color 0.15s;
    }
    .ui-dialog-close-btn:hover {
      background-color: var(--surface-hover, #f1f5f9);
      color: var(--text-color, #0f172a);
    }
  `],
})
export class UiDialog {
  private readonly dialog = inject(MatDialog);
  private ref?: MatDialogRef<unknown>;

  readonly visible = model(false);
  readonly header = input<string>('');
  readonly icon = input<string>('');
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

  close(): void {
    if (this.ref) {
      this.ref.close();
      this.ref = undefined;
    }
    this.visible.set(false);
  }

  resolvedIcon(): string {
    const explicit = this.icon();
    if (explicit) return explicit;
    const h = (this.header() || '').trim().toLowerCase();
    if (!h) return '';
    if (h.includes('ยืนยัน') || h.includes('confirm')) return 'pi pi-question-circle';
    if (h.includes('ปฏิเสธ') || h.includes('ยกเลิก') || h.includes('cancel') || h.includes('reject')) return 'pi pi-times-circle';
    if (h.includes('รหัสผ่าน') || h.includes('password')) return 'pi pi-key';
    if (h.includes('ผู้ใช้') || h.includes('user')) return 'pi pi-user';
    if (h.includes('บริษัท') || h.includes('company')) return 'pi pi-building';
    if (h.includes('เพิ่ม') || h.includes('สร้าง') || h.includes('add') || h.includes('create')) return 'pi pi-plus-circle';
    if (h.includes('แก้ไข') || h.includes('edit')) return 'pi pi-pencil';
    if (h.includes('ราคา') || h.includes('price') || h.includes('คำนวณ')) return 'pi pi-calculator';
    if (h.includes('ความคุ้มครอง') || h.includes('coverage')) return 'pi pi-shield';
    if (h.includes('ใบเสนอ') || h.includes('quotation') || h.includes('proposal')) return 'pi pi-file';
    return 'pi pi-info-circle';
  }

  private open(): void {
    const width = this.style()?.['width'];
    this.ref = this.dialog.open(this.tpl, { width: width ?? '520px', maxWidth: '95vw', disableClose: !this.closable(), autoFocus: 'first-tabbable' });
    this.ref.afterClosed().subscribe(() => { this.ref = undefined; this.visible.set(false); });
  }
}

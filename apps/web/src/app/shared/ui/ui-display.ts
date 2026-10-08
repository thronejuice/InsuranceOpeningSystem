import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ContentChild, TemplateRef, ViewChild, ViewContainerRef, inject, input, output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

export type UiSeverity = 'primary' | 'secondary' | 'success' | 'info' | 'warn' | 'danger' | 'contrast' | null | undefined;

@Component({
  selector: 'ui-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, NgTemplateOutlet, RouterLink, MatTooltipModule],
  host: { '[class.ui-btn-host]': 'true' },
  template: `
    <ng-template #inner>
      <span class="ui-btn-content">
        @if (loading()) { <i class="pi pi-spinner pi-spin"></i> } @else if (resolvedIcon()) { <i [class]="resolvedIcon()"></i> }
        @if (label()) { <span class="ui-btn-label">{{ label() }}</span> }
      </span>
    </ng-template>
    @if (link() !== null && link() !== undefined) {
      <a [matButton]="variant()" [routerLink]="link()" [class]="cls()" [attr.aria-label]="ariaLabel() || null"
        (click)="clicked.emit($event)">
        <ng-container *ngTemplateOutlet="inner" />
      </a>
    } @else {
      <button [matButton]="variant()" [attr.type]="type()" [class]="cls()" [disabled]="disabled() || loading()"
        [attr.aria-label]="ariaLabel() || null" (click)="clicked.emit($event)">
        <ng-container *ngTemplateOutlet="inner" />
      </button>
    }
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .ui-btn-content {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      line-height: 1.2;
      white-space: nowrap;
    }
    .ui-btn-label {
      display: inline-block;
      line-height: 1.2;
      white-space: nowrap;
    }
  `],
})
export class UiButton {
  readonly label = input<string>('');
  readonly icon = input<string>('');
  readonly severity = input<UiSeverity>(null);
  readonly text = input(false);
  readonly outlined = input(false);
  readonly rounded = input(false);
  readonly size = input<'small' | 'large' | undefined>();
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly link = input<string | unknown[] | null>(null);
  readonly styleClass = input<string>('');
  readonly ariaLabel = input<string>('', { alias: 'aria-label' });
  readonly clicked = output<MouseEvent>({ alias: 'onClick' });

  resolvedIcon(): string {
    const explicit = this.icon();
    if (explicit) return explicit;
    const l = (this.label() || '').trim().toLowerCase();
    if (!l) return '';
    if (l.includes('บันทึก') || l.includes('save')) return 'pi pi-save';
    if (l.includes('ยกเลิก') || l.includes('cancel')) return 'pi pi-times';
    if (l.includes('ลบ') || l.includes('delete')) return 'pi pi-trash';
    if (l.includes('เพิ่ม') || l.includes('สร้าง') || l.includes('create') || l.includes('add')) return 'pi pi-plus';
    if (l.includes('ส่ง') || l.includes('send') || l.includes('submit')) return 'pi pi-send';
    if (l.includes('ค้นหา') || l.includes('search')) return 'pi pi-search';
    if (l.includes('ล้าง') || l.includes('clear')) return 'pi pi-times';
    if (l.includes('แก้ไข') || l.includes('edit')) return 'pi pi-pencil';
    if (l.includes('อนุมัติ') || l.includes('approve') || l.includes('ยอมรับ') || l.includes('accept') || l.includes('ตกลง') || l.includes('เลือก') || l.includes('เสร็จ')) return 'pi pi-check';
    if (l.includes('ปฏิเสธ') || l.includes('reject')) return 'pi pi-times';
    if (l.includes('excel') || l.includes('export')) return 'pi pi-file-excel';
    if (l.includes('พิมพ์') || l.includes('print')) return 'pi pi-print';
    if (l.includes('ดาวน์โหลด') || l.includes('download')) return 'pi pi-download';
    if (l.includes('ย้อนกลับ') || l.includes('กลับ') || l.includes('back')) return 'pi pi-arrow-left';
    return '';
  }

  resolvedSeverity(): UiSeverity {
    const explicit = this.severity();
    const l = (this.label() || this.ariaLabel() || '').trim().toLowerCase();
    const isCancel = l === 'ยกเลิก' || l === 'cancel' || l.startsWith('ยกเลิก') || l.startsWith('cancel');
    if (isCancel && (!explicit || explicit === 'secondary')) {
      return 'danger';
    }
    return explicit;
  }

  variant(): 'filled' | 'outlined' | 'text' | 'tonal' {
    if (this.text()) return 'text';
    if (this.outlined()) return 'outlined';
    return this.resolvedSeverity() === 'secondary' ? 'tonal' : 'filled';
  }
  cls(): string {
    return ['ui-btn', `ui-btn--${this.resolvedSeverity() ?? 'primary'}`, this.size() === 'small' ? 'ui-btn--sm' : '', this.styleClass()]
      .filter(Boolean).join(' ');
  }
}

@Component({
  selector: 'ui-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-message ui-message--" + (severity() ?? "info")', role: 'alert' },
  template: `<i class="pi" [class]="iconClass()"></i><span><ng-content /></span>`,
})
export class UiMessage {
  readonly severity = input<'error' | 'info' | 'success' | 'warn' | 'secondary' | 'contrast'>('info');
  iconClass(): string {
    return ({ error: 'pi-times-circle', success: 'pi-check-circle', warn: 'pi-exclamation-triangle' } as Record<string, string>)[this.severity()] ?? 'pi-info-circle';
  }
}

@Component({
  selector: 'ui-tag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"ui-tag ui-tag--" + (severity() ?? "info")' },
  template: `{{ value() }}`,
})
export class UiTag {
  readonly value = input<string | null | undefined>('');
  readonly severity = input<string | null | undefined>('info');
}

@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule],
  template: `
    <mat-card appearance="outlined">
      @if (header()) { <mat-card-header><h2 class="ui-card-title">{{ header() }}</h2></mat-card-header> }
      <mat-card-content><ng-content /></mat-card-content>
    </mat-card>
  `,
})
export class UiCard {
  readonly header = input<string>('');
}

@Component({
  selector: 'ui-divider',
  standalone: true,
  imports: [MatDividerModule],
  host: { class: 'ui-divider-host' },
  template: `<mat-divider />`,
})
export class UiDivider {
  readonly styleClass = input<string>('');
}

@Component({
  selector: 'ui-progress-spinner',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `<mat-progress-spinner mode="indeterminate" [diameter]="48" />`,
})
export class UiProgressSpinner {
  readonly strokeWidth = input<string>('4');
  readonly styleClass = input<string>('');
}

/** Wrapper that positions its child icon inside an input (the old iconfield). */
@Component({
  selector: 'ui-iconfield',
  standalone: true,
  host: { class: 'ui-iconfield' },
  template: `<ng-content />`,
})
export class UiIconField {}

@Component({
  selector: 'ui-timeline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <ol class="ui-timeline">
      @for (item of value(); track $index) {
        <li><span class="ui-timeline-dot"></span>
          <div><ng-container *ngTemplateOutlet="content; context: { $implicit: item }" /></div>
        </li>
      }
    </ol>
  `,
})
export class UiTimeline {
  readonly value = input<unknown[] | null | undefined>([]);
  readonly styleClass = input<string>('');
  @ContentChild('content') content!: TemplateRef<unknown>;
}

@Component({
  selector: 'ui-popover',
  standalone: true,
  template: `<ng-template #tpl><div class="ui-popover"><ng-content /></div></ng-template>`,
})
export class UiPopover {
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private ref?: OverlayRef;
  @ViewChild('tpl', { static: true }) tpl!: TemplateRef<unknown>;

  toggle(event: Event): void {
    if (this.ref?.hasAttached()) return this.hide();
    const origin = (event.currentTarget ?? event.target) as HTMLElement;
    this.ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      positionStrategy: this.overlay.position().flexibleConnectedTo(origin).withPositions([
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
      ]),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
    this.ref.backdropClick().subscribe(() => this.hide());
    this.ref.attach(new TemplatePortal(this.tpl, this.vcr));
  }
  hide(): void { this.ref?.dispose(); this.ref = undefined; }
}

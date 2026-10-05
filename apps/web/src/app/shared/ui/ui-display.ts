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
      @if (loading()) { <i class="pi pi-spinner pi-spin"></i> } @else if (icon()) { <i [class]="icon()"></i> }
      @if (label()) { <span>{{ label() }}</span> }
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

  variant(): 'filled' | 'outlined' | 'text' | 'tonal' {
    if (this.text()) return 'text';
    if (this.outlined()) return 'outlined';
    return this.severity() === 'secondary' ? 'tonal' : 'filled';
  }
  cls(): string {
    return ['ui-btn', `ui-btn--${this.severity() ?? 'primary'}`, this.size() === 'small' ? 'ui-btn--sm' : '', this.styleClass()]
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

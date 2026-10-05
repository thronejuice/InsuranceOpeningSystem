import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ContentChild, Directive, TemplateRef, computed, inject, input, output, signal,
} from '@angular/core';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export interface TableLazyLoadEvent {
  first?: number;
  rows?: number;
  sortField?: string | null;
  sortOrder?: number | null;
}

@Component({
  selector: 'ui-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatPaginatorModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="ui-table-wrap">
      <table class="ui-table" [class]="styleClass()">
        <thead><ng-container *ngTemplateOutlet="header" /></thead>
        <tbody>
          @for (row of value(); track $index) {
            <ng-container *ngTemplateOutlet="body; context: { $implicit: row, rowIndex: $index }" />
          } @empty {
            @if (!loading() && emptymessage) { <ng-container *ngTemplateOutlet="emptymessage" /> }
          }
        </tbody>
      </table>
    </div>
    @if (paginator()) {
      <mat-paginator [length]="totalRecords()" [pageSize]="rows()" [pageIndex]="pageIndex()"
        [pageSizeOptions]="rowsPerPageOptions() ?? [rows()]" [showFirstLastButtons]="true" (page)="onPage($event)" />
    }
  `,
})
export class UiTable {
  readonly value = input<unknown[] | null | undefined>([]);
  readonly lazy = input(false);
  readonly loading = input(false);
  readonly paginator = input(false);
  readonly rows = input(20);
  readonly first = input(0);
  readonly totalRecords = input(0);
  readonly rowsPerPageOptions = input<number[] | undefined>();
  readonly showCurrentPageReport = input(false);
  readonly currentPageReportTemplate = input('');
  readonly styleClass = input('');
  readonly lazyLoad = output<TableLazyLoadEvent>({ alias: 'onLazyLoad' });

  @ContentChild('header') header!: TemplateRef<unknown>;
  @ContentChild('body') body!: TemplateRef<unknown>;
  @ContentChild('emptymessage') emptymessage?: TemplateRef<unknown>;

  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<1 | -1>(1);
  private readonly pageOverride = signal<number | null>(null);
  readonly pageIndex = computed(() => this.pageOverride() ?? Math.floor(this.first() / this.rows()));

  onPage(e: PageEvent): void {
    this.pageOverride.set(e.pageIndex);
    this.emit(e.pageIndex * e.pageSize, e.pageSize);
  }

  sort(field: string): void {
    if (this.sortField() === field) {
      if (this.sortOrder() === 1) this.sortOrder.set(-1);
      else { this.sortField.set(null); this.sortOrder.set(1); }
    } else {
      this.sortField.set(field);
      this.sortOrder.set(1);
    }
    this.pageOverride.set(0);
    this.emit(0, this.rows());
  }

  private emit(first: number, rows: number): void {
    this.lazyLoad.emit({ first, rows, sortField: this.sortField(), sortOrder: this.sortField() ? this.sortOrder() : null });
  }
}

@Directive({
  selector: '[uiSortableColumn]',
  standalone: true,
  host: { class: 'ui-sortable', '(click)': 'table.sort(uiSortableColumn())', tabindex: '0', '(keydown.enter)': 'table.sort(uiSortableColumn())' },
})
export class UiSortableColumn {
  protected readonly table = inject(UiTable);
  readonly uiSortableColumn = input.required<string>();
}

@Component({
  selector: 'ui-sort-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<i class="pi" [class]="icon()"></i>`,
})
export class UiSortIcon {
  private readonly table = inject(UiTable);
  readonly field = input.required<string>();
  icon(): string {
    if (this.table.sortField() !== this.field()) return 'pi-sort-alt';
    return this.table.sortOrder() === 1 ? 'pi-sort-amount-up-alt' : 'pi-sort-amount-down';
  }
}

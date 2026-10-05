import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, forwardRef, inject, input, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

/** Plain text input / textarea styling (see styles.scss `.ui-input`). */
@Directive({ selector: 'input[uiInput], textarea[uiInput]', standalone: true, host: { class: 'ui-input' } })
export class UiInput {}

/** Base class: wires a ControlValueAccessor around a signal-backed value. */
abstract class ValueAccessor<T> implements ControlValueAccessor {
  protected readonly value = signal<T | null>(null);
  readonly isDisabled = signal(false);
  protected onChange: (v: T | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;
  protected readonly cdr = inject(ChangeDetectorRef);

  writeValue(v: T | null): void {
    this.value.set(v ?? null);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (v: T | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void {
    this.isDisabled.set(d);
    this.cdr.markForCheck();
  }

  protected commit(v: T | null): void {
    this.value.set(v);
    this.onChange(v);
    this.cdr.markForCheck();
  }
}

function provideAccessor(cls: () => unknown) {
  return { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(cls as () => never), multi: true };
}

type Opt = Record<string, unknown>;
const labelOf = (o: unknown, key?: string) => String(key && o && typeof o === 'object' ? (o as Opt)[key] : o);
const valueOf = (o: unknown, key?: string) => (key && o && typeof o === 'object' ? (o as Opt)[key] : o);

@Component({
  selector: 'ui-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  providers: [provideAccessor(() => UiSelect)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <mat-select [value]="value()" [placeholder]="placeholder()" [disabled]="isDisabled() || disabled()"
        [id]="inputId()" (selectionChange)="onSelectionChange($event.value)" (closed)="onTouched()">
        @if (showClear()) { <mat-option [value]="null">—</mat-option> }
        @for (o of options(); track $index) {
          <mat-option [value]="val(o)">{{ label(o) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
})
export class UiSelect extends ValueAccessor<unknown> {
  readonly options = input<unknown[] | null | undefined>([]);
  readonly optionLabel = input<string>();
  readonly optionValue = input<string>();
  readonly placeholder = input<string>('');
  readonly inputId = input<string>('');
  readonly showClear = input(false);
  readonly disabled = input(false);
  readonly styleClass = input<string>('');
  readonly selected = output<{ value: unknown }>({ alias: 'onChange' });

  label(o: unknown) { return labelOf(o, this.optionLabel()); }
  val(o: unknown) { return valueOf(o, this.optionValue()); }

  onSelectionChange(v: unknown): void {
    this.commit(v);
    this.selected.emit({ value: v });
  }
}

@Component({
  selector: 'ui-multiselect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  providers: [provideAccessor(() => UiMultiSelect)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <mat-select multiple [value]="value() ?? []" [placeholder]="placeholder()" [disabled]="isDisabled()"
        (selectionChange)="onSelectionChange($event.value)" (closed)="onTouched()">
        @for (o of options(); track $index) {
          <mat-option [value]="val(o)">{{ label(o) }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
})
export class UiMultiSelect extends ValueAccessor<unknown[]> {
  readonly display = input<string>('');
  readonly styleClass = input<string>('');
  readonly options = input<unknown[] | null | undefined>([]);
  readonly optionLabel = input<string>();
  readonly optionValue = input<string>();
  readonly placeholder = input<string>('');
  readonly selected = output<{ value: unknown[] }>({ alias: 'onChange' });

  label(o: unknown) { return labelOf(o, this.optionLabel()); }
  val(o: unknown) { return valueOf(o, this.optionValue()); }

  onSelectionChange(v: unknown[]): void {
    this.commit(v);
    this.selected.emit({ value: v });
  }
}

export interface UiAutocompleteSelectEvent { value: unknown }

@Component({
  selector: 'ui-autocomplete',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatAutocompleteModule],
  providers: [provideAccessor(() => UiAutocomplete)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <input matInput [id]="inputId()" [placeholder]="placeholder()" [matAutocomplete]="auto" [disabled]="isDisabled()"
        [value]="text()" (input)="onType($any($event.target).value)" (blur)="onTouched()" autocomplete="off" />
      <mat-autocomplete #auto="matAutocomplete" [displayWith]="display" (optionSelected)="picked($event)">
        @for (s of suggestions(); track $index) {
          <mat-option [value]="s">{{ display(s) }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
})
export class UiAutocomplete extends ValueAccessor<unknown> {
  readonly suggestions = input<unknown[] | null | undefined>([]);
  readonly field = input<string>();
  readonly placeholder = input<string>('');
  readonly inputId = input<string>('');
  readonly showClear = input(false);
  readonly styleClass = input<string>('');
  readonly completeMethod = output<{ query: string }>();
  readonly selected = output<UiAutocompleteSelectEvent>({ alias: 'onSelect' });
  readonly cleared = output<void>({ alias: 'onClear' });

  readonly display = (o: unknown): string => (o == null ? '' : typeof o === 'string' ? o : labelOf(o, this.field()));
  text() { return this.display(this.value()); }

  onType(q: string): void {
    this.commit(q);
    if (!q) this.cleared.emit();
    this.completeMethod.emit({ query: q });
  }
  picked(e: MatAutocompleteSelectedEvent): void {
    this.commit(e.option.value);
    this.selected.emit({ value: e.option.value });
  }
}

@Component({
  selector: 'ui-datepicker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule],
  providers: [provideAccessor(() => UiDatepicker)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <input matInput [id]="inputId()" [matDatepicker]="dp" [value]="value()" [disabled]="isDisabled()"
        (dateChange)="onDateChange($event.value)" (dateInput)="onDateChange($event.value)" (blur)="onTouched()" placeholder="dd/mm/yyyy" />
      <mat-datepicker-toggle matIconSuffix [for]="dp" />
      <mat-datepicker #dp />
    </mat-form-field>
  `,
})
export class UiDatepicker extends ValueAccessor<Date> {
  readonly inputId = input<string>('');
  readonly showIcon = input(true);
  readonly dateFormat = input<string>('');
  readonly styleClass = input<string>('');
  readonly dateChange = output<{ value: Date | null }>({ alias: 'onChange' });

  onDateChange(val: Date | null): void {
    this.commit(val);
    this.dateChange.emit({ value: val });
  }
}

@Component({
  selector: 'ui-inputnumber',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  providers: [provideAccessor(() => UiInputNumber)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <input matInput type="number" [id]="inputId()" [value]="value() ?? ''" [min]="min() ?? null" [max]="max() ?? null"
        [disabled]="isDisabled()" (input)="onInput($any($event.target).value)" (blur)="onTouched()" />
    </mat-form-field>
  `,
})
export class UiInputNumber extends ValueAccessor<number> {
  readonly min = input<number>();
  readonly max = input<number>();
  readonly inputId = input<string>('');
  onInput(raw: string): void { this.commit(raw === '' ? null : Number(raw)); }
}

@Component({
  selector: 'ui-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule],
  providers: [provideAccessor(() => UiPassword)],
  host: { class: 'ui-field-host' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ui-compact">
      <input matInput [id]="inputId()" [type]="shown() ? 'text' : 'password'" [placeholder]="placeholder()" [value]="value() ?? ''"
        [disabled]="isDisabled()" (input)="commit($any($event.target).value)" (blur)="onTouched()" />
      @if (toggleMask()) {
        <button type="button" matSuffix class="ui-icon-btn" (click)="shown.set(!shown())" [attr.aria-label]="shown() ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'">
          <i class="pi" [class.pi-eye]="!shown()" [class.pi-eye-slash]="shown()"></i>
        </button>
      }
    </mat-form-field>
  `,
})
export class UiPassword extends ValueAccessor<string> {
  readonly toggleMask = input(false);
  readonly feedback = input(true);
  readonly placeholder = input<string>('');
  readonly inputId = input<string>('');
  readonly shown = signal(false);
  readonly inputStyleClass = input<string>('');
  readonly styleClass = input<string>('');
}

@Component({
  selector: 'ui-checkbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCheckboxModule],
  providers: [provideAccessor(() => UiCheckbox)],
  template: `<mat-checkbox [checked]="!!value()" [disabled]="isDisabled()" (change)="commit($event.checked)">{{ label() }}</mat-checkbox>`,
})
export class UiCheckbox extends ValueAccessor<boolean> {
  readonly label = input<string>('');
  readonly binary = input(true);
}

@Component({
  selector: 'ui-toggleswitch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSlideToggleModule],
  providers: [provideAccessor(() => UiToggleSwitch)],
  template: `<mat-slide-toggle [checked]="!!value()" [disabled]="isDisabled()" (change)="commit($event.checked)" />`,
})
export class UiToggleSwitch extends ValueAccessor<boolean> {}

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-field-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (control?.invalid && control?.touched) {
      <small class="p-error">{{ message() }}</small>
    }
  `,
})
export class AppFieldErrorComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) control!: AbstractControl | null;

  private readonly cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['control']) {
      this.sub?.unsubscribe();
      if (this.control) {
        this.sub = this.control.statusChanges.subscribe(() => this.cdr.markForCheck());
      }
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  message(): string {
    const errors = this.control?.errors;
    if (!errors) return '';
    if (errors['server']) return errors['server'] as string;
    if (errors['required']) return 'จำเป็นต้องกรอก';
    if (errors['email']) return 'รูปแบบอีเมลไม่ถูกต้อง';
    if (errors['minlength']) return `ต้องมีอย่างน้อย ${(errors['minlength'] as { requiredLength: number }).requiredLength} ตัวอักษร`;
    if (errors['maxlength']) return `ไม่เกิน ${(errors['maxlength'] as { requiredLength: number }).requiredLength} ตัวอักษร`;
    if (errors['pattern']) return 'รูปแบบไม่ถูกต้อง';
    if (errors['isThaiId']) return 'เลขประจำตัวไม่ถูกต้อง';
    return 'ข้อมูลไม่ถูกต้อง';
  }
}

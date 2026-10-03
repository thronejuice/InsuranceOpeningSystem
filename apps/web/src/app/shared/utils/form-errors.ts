import { AbstractControl, FormGroup } from '@angular/forms';

type ServerErrors = Record<string, string[]>;

interface ApiValidationError {
  success: false;
  code?: string;
  errors?: ServerErrors;
}

/**
 * Map server 422 errors onto form controls.
 * Supports dot-notation for nested fields (e.g. "contacts.0.email").
 */
export function applyServerErrors(form: FormGroup, err: ApiValidationError): void {
  const errors = err.errors ?? {};
  for (const [field, messages] of Object.entries(errors)) {
    const control = getControl(form, field);
    if (control) {
      control.setErrors({ server: messages[0] ?? 'ไม่ถูกต้อง' });
      control.markAsTouched();
    }
  }
}

function getControl(form: FormGroup, path: string): AbstractControl | null {
  const parts = path.split('.');
  let ctrl: AbstractControl | null = form;
  for (const part of parts) {
    if (!ctrl) return null;
    ctrl = (ctrl as FormGroup).get(part);
  }
  return ctrl;
}

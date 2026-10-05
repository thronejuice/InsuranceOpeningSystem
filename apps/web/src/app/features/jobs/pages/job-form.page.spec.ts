import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { JobFormPage } from './job-form.page';
import { MessageService } from '../../../shared/ui';

describe('JobFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JobFormPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnimationsAsync(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('should calculate expiryDate as effectiveDate + 1 year', () => {
    const fixture = TestBed.createComponent(JobFormPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const effectiveDate = new Date(2026, 9, 5); // 2026-10-05
    component.form.controls.effectiveDate.setValue(effectiveDate);
    fixture.detectChanges();

    const expiryDate = component.form.controls.expiryDate.value;
    expect(expiryDate).toBeTruthy();
    expect(expiryDate?.getFullYear()).toBe(2027);
    expect(expiryDate?.getMonth()).toBe(9);
    expect(expiryDate?.getDate()).toBe(5);
  });

  it('should handle leap year correctly for February 29', () => {
    const fixture = TestBed.createComponent(JobFormPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const leapDate = new Date(2024, 1, 29); // 2024-02-29
    component.form.controls.effectiveDate.setValue(leapDate);

    const expiryDate = component.form.controls.expiryDate.value;
    expect(expiryDate).toBeTruthy();
    expect(expiryDate?.getFullYear()).toBe(2025);
    expect(expiryDate?.getMonth()).toBe(1); // February
    expect(expiryDate?.getDate()).toBe(28); // 28th
  });
});


import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { UiDatepicker } from './ui-form';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, UiDatepicker],
  template: `
    <ui-datepicker [formControl]="control" inputId="testDate" />
  `,
})
class TestHostComponent {
  control = new FormControl<Date | null>(null);
}

describe('UiDatepicker', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideAnimationsAsync(),
        provideNativeDateAdapter(),
        { provide: MAT_DATE_LOCALE, useValue: 'en-GB' },
      ],
    }).compileComponents();
  });

  it('renders date in input when control value is updated programmatically', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const host = fixture.componentInstance;
    const date = new Date(2027, 9, 5); // 05/10/2027
    host.control.setValue(date);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#testDate') as HTMLInputElement;
    console.log('INPUT VALUE AFTER SETVALUE:', input?.value);
    expect(input.value).toBe('05/10/2027');
  });
});

import { Pipe, PipeTransform } from '@angular/core';

/** แสดงเงิน (รับ string จาก API) โดยไม่แปลงเป็น float */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: string | null | undefined, currency = 'THB'): string {
    if (value == null || value === '') return '-';
    // ใช้ Intl.NumberFormat กับ string จำนวน (parse เป็น number เฉพาะตอนแสดงผล ไม่ใช้คำนวณ)
    const num = Number(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }
}

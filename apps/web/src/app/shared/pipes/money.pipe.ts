import { Pipe, PipeTransform } from '@angular/core';

/**
 * แสดงจำนวนเงิน / วงเงิน พร้อม comma (หลักพัน) และทศนิยม 2 ตำแหน่ง (#,##0.00)
 * ตัวอย่าง:
 *   1234.5 -> "1,234.50"
 *   "500000" -> "500,000.00"
 *   null / undefined / "" / "-" -> "-" (หรือตาม emptyPlaceholder)
 */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: string | number | null | undefined, emptyPlaceholder = '-'): string {
    if (value == null || value === '') return emptyPlaceholder;
    const cleanStr = String(value).replace(/,/g, '').trim();
    if (cleanStr === '' || cleanStr === '-') return emptyPlaceholder;
    const num = Number(cleanStr);
    if (isNaN(num)) return String(value);
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }
}

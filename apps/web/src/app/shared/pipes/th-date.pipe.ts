import { Pipe, PipeTransform } from '@angular/core';

/** แสดงวันที่เป็น `dd/MM/yyyy` ใน timezone Asia/Bangkok (Q7: ค.ศ.) */
@Pipe({ name: 'thDate', standalone: true })
export class ThDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, showTime = false): string {
    if (value == null || value === '') return '-';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return String(value);

    const opts: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    };
    if (showTime) {
      opts.hour = '2-digit';
      opts.minute = '2-digit';
    }

    return new Intl.DateTimeFormat('en-GB', opts).format(date);
  }
}

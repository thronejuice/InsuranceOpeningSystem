import { describe, expect, it } from 'vitest';
import { todayInBangkok } from './bangkok-date.js';

describe('todayInBangkok', () => {
  it('correctly shifts UTC evening time to Bangkok next day', () => {
    // 2026-10-05 18:30:00 UTC is 2026-10-06 01:30:00 in Asia/Bangkok (UTC+7)
    const utcEvening = new Date('2026-10-05T18:30:00Z');
    expect(todayInBangkok(utcEvening)).toBe('2026-10-06');
  });

  it('keeps the same date when time in UTC is early afternoon', () => {
    // 2026-10-05 08:00:00 UTC is 2026-10-05 15:00:00 in Asia/Bangkok (UTC+7)
    const utcDaytime = new Date('2026-10-05T08:00:00Z');
    expect(todayInBangkok(utcDaytime)).toBe('2026-10-05');
  });
});

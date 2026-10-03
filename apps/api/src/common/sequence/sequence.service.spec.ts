import { describe, expect, it, vi } from 'vitest';
import { businessYear, formatDocumentNo } from './document-type.js';
import { SequenceService } from './sequence.service.js';

describe('formatDocumentNo', () => {
  it.each([
    ['JOB', 2026, 1, 'JOB-2026-000001'],
    ['QUOTATION', 2026, 42, 'QT-2026-000042'],
    ['PROPOSAL', 2026, 999999, 'PP-2026-999999'],
    ['PAYMENT', 2027, 7, 'PAY-2027-000007'],
    ['CUSTOMER', 0, 123, 'CUS-000123'],
  ] as const)('%s %i #%i → %s', (type, year, value, expected) => {
    expect(formatDocumentNo(type, year, value)).toBe(expected);
  });

  it('does not truncate past 6 digits', () => {
    expect(formatDocumentNo('JOB', 2026, 1_000_000)).toBe('JOB-2026-1000000');
  });
});

describe('businessYear', () => {
  it('uses the Bangkok calendar (UTC+7)', () => {
    expect(businessYear(new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(businessYear(new Date('2026-12-31T17:00:00Z'))).toBe(2027);
  });
});

describe('SequenceService', () => {
  const setup = (lastValue: number) => {
    const $queryRaw = vi.fn().mockResolvedValue([{ last_value: lastValue }]);
    const service = new SequenceService({ tx: { $queryRaw } } as never);
    return { service, $queryRaw };
  };

  it('keys yearly documents by Bangkok year', async () => {
    const { service, $queryRaw } = setup(5);

    await expect(service.next('JOB', new Date('2026-12-31T18:00:00Z'))).resolves.toBe('JOB-2027-000005');
    expect($queryRaw.mock.calls[0].slice(1)).toEqual(['JOB', 2027]);
  });

  it('keys non-yearly documents with year 0', async () => {
    const { service, $queryRaw } = setup(12);

    await expect(service.next('CUSTOMER')).resolves.toBe('CUS-000012');
    expect($queryRaw.mock.calls[0].slice(1)).toEqual(['CUS', 0]);
  });
});

import { MoneyPipe } from './money.pipe';

describe('MoneyPipe', () => {
  let pipe: MoneyPipe;

  beforeEach(() => {
    pipe = new MoneyPipe();
  });

  it('should return "-" for null, undefined, or empty string by default', () => {
    expect(pipe.transform(null)).toBe('-');
    expect(pipe.transform(undefined)).toBe('-');
    expect(pipe.transform('')).toBe('-');
    expect(pipe.transform('-')).toBe('-');
  });

  it('should return custom emptyPlaceholder when provided', () => {
    expect(pipe.transform(null, '0.00')).toBe('0.00');
    expect(pipe.transform('', 'N/A')).toBe('N/A');
  });

  it('should format 0 and "0" as 0.00', () => {
    expect(pipe.transform(0)).toBe('0.00');
    expect(pipe.transform('0')).toBe('0.00');
    expect(pipe.transform('0.00')).toBe('0.00');
  });

  it('should format numbers with comma and 2 decimal places', () => {
    expect(pipe.transform(100)).toBe('100.00');
    expect(pipe.transform(1000)).toBe('1,000.00');
    expect(pipe.transform(1234567.89)).toBe('1,234,567.89');
    expect(pipe.transform(1234567.8)).toBe('1,234,567.80');
    expect(pipe.transform(1234567)).toBe('1,234,567.00');
  });

  it('should format numeric strings with comma and 2 decimal places', () => {
    expect(pipe.transform('100')).toBe('100.00');
    expect(pipe.transform('1000')).toBe('1,000.00');
    expect(pipe.transform('500000')).toBe('500,000.00');
    expect(pipe.transform('1500000.5')).toBe('1,500,000.50');
    expect(pipe.transform('1,500,000')).toBe('1,500,000.00');
  });

  it('should return original string if value is not a valid number', () => {
    expect(pipe.transform('abc')).toBe('abc');
  });
});

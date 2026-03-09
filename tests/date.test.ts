import { buildDateFormatDescriptor, datePartsToComparable, looksLikeDateWithoutFormat } from '../src/date';

describe('buildDateFormatDescriptor', () => {
  it('parses YYYY-MM-DD correctly', () => {
    const desc = buildDateFormatDescriptor('YYYY-MM-DD');
    expect(desc.regex.test('2024-06-15')).toBe(true);
    expect(desc.regex.test('24-06-15')).toBe(false);
    expect(desc.regex.test('2024-6-15')).toBe(false);

    const parts = desc.parse('2024-06-15');
    expect(parts).toEqual({ year: 2024, month: 6, day: 15 });
  });

  it('parses YYYY-MM-DDTHH:mm:ss correctly', () => {
    const desc = buildDateFormatDescriptor('YYYY-MM-DDTHH:mm:ss');
    expect(desc.regex.test('2024-06-15T14:30:00')).toBe(true);
    expect(desc.regex.test('2024-06-15T14:30')).toBe(false);
  });

  it('emits a specError and returns a non-matching sentinel for duplicate tokens', () => {
    const specErrors: string[] = [];
    const desc = buildDateFormatDescriptor('YYYY-MM-DD-MM', specErrors, 'field');
    expect(specErrors.length).toBeGreaterThan(0);
    expect(specErrors[0]).toContain('duplicate token');
    // Sentinel regex should match nothing.
    expect(desc.regex.test('2024-06-15')).toBe(false);
    expect(desc.parse('anything')).toBeNull();
  });

  it('handles custom separators', () => {
    const desc = buildDateFormatDescriptor('DD/MM/YYYY');
    expect(desc.regex.test('15/06/2024')).toBe(true);
    const parts = desc.parse('15/06/2024');
    expect(parts).toEqual({ year: 2024, month: 6, day: 15 });
  });

  it('handles SSS millisecond token with right-padding', () => {
    const desc = buildDateFormatDescriptor('YYYY-MM-DDTHH:mm:ss.SSS');
    const parts = desc.parse('2024-01-01T00:00:00.1');
    expect(parts?.millisecond).toBe(100);
    const parts2 = desc.parse('2024-01-01T00:00:00.02');
    expect(parts2?.millisecond).toBe(20);
    const parts3 = desc.parse('2024-01-01T00:00:00.123');
    expect(parts3?.millisecond).toBe(123);
  });
});

describe('datePartsToComparable', () => {
  it('produces a 17-character zero-padded string', () => {
    const c = datePartsToComparable({ year: 2024, month: 6, day: 15 });
    expect(c).toHaveLength(17);
    expect(c).toBe('20240615000000000');
  });

  it('orders comparables correctly', () => {
    const earlier = datePartsToComparable({ year: 2023, month: 12, day: 31 });
    const later   = datePartsToComparable({ year: 2024, month: 1, day: 1 });
    expect(earlier < later).toBe(true);
  });

  it('handles missing parts with zero fill', () => {
    const c = datePartsToComparable({});
    expect(c).toBe('00000000000000000');
  });
});

describe('looksLikeDateWithoutFormat', () => {
  it('detects ISO-style prefix', () => {
    expect(looksLikeDateWithoutFormat('2024-01-01')).toBe(true);
    expect(looksLikeDateWithoutFormat('2024-')).toBe(true);
  });

  it('detects compact 8-digit dates', () => {
    expect(looksLikeDateWithoutFormat('20241231')).toBe(true);
  });

  it('does not flag plain integers', () => {
    expect(looksLikeDateWithoutFormat('3')).toBe(false);
    expect(looksLikeDateWithoutFormat('100')).toBe(false);
    expect(looksLikeDateWithoutFormat('-5')).toBe(false);
  });

  it('does not flag negative numbers', () => {
    expect(looksLikeDateWithoutFormat('-12345')).toBe(false);
  });
});

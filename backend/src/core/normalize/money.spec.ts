import { parseDecimalToMinor, formatMinor } from './money';

describe('money (float-free minor units)', () => {
  it('parses fiat decimals to minor units', () => {
    expect(parseDecimalToMinor('12.34', 2)).toBe(1234n);
    expect(parseDecimalToMinor('100', 2)).toBe(10000n);
    expect(parseDecimalToMinor('-0.01', 2)).toBe(-1n);
    expect(parseDecimalToMinor('+5', 0)).toBe(5n);
  });

  it('parses high-precision crypto without float drift', () => {
    expect(parseDecimalToMinor('0.000000000000000001', 18)).toBe(1n);
    // a value that would lose precision as a JS float
    expect(parseDecimalToMinor('1234567890.99', 2)).toBe(123456789099n);
  });

  it('rejects precision loss and bad input', () => {
    expect(() => parseDecimalToMinor('1.234', 2)).toThrow();
    expect(() => parseDecimalToMinor('abc', 2)).toThrow();
    expect(() => parseDecimalToMinor('1,23', 2)).toThrow();
    expect(() => parseDecimalToMinor('1.0', -1)).toThrow();
  });

  it('formats minor units back to fixed decimals', () => {
    expect(formatMinor(1234n, 2)).toBe('12.34');
    expect(formatMinor(-1n, 2)).toBe('-0.01');
    expect(formatMinor(100n, 0)).toBe('100');
    expect(formatMinor(5n, 2)).toBe('0.05');
  });

  it('round-trips parse <-> format exactly', () => {
    const cases: Array<[string, number]> = [
      ['12.34', 2],
      ['1234567890.99', 2],
      ['0.000000000000000001', 18],
      ['-987.65', 2],
    ];
    for (const [value, dec] of cases) {
      expect(formatMinor(parseDecimalToMinor(value, dec), dec)).toBe(value);
    }
  });
});

import { trimTrailingZeroFraction } from './decimal';
import { parseDecimalToMinor } from '../../core/normalize/money';

describe('trimTrailingZeroFraction', () => {
  it('strips trailing zero padding from the fractional part', () => {
    expect(trimTrailingZeroFraction('320.00000000')).toBe('320');
    expect(trimTrailingZeroFraction('150.500000')).toBe('150.5');
    expect(trimTrailingZeroFraction('41.80')).toBe('41.8');
  });

  it('leaves integers and already-tight decimals untouched', () => {
    expect(trimTrailingZeroFraction('100')).toBe('100');
    expect(trimTrailingZeroFraction('12.34')).toBe('12.34');
  });

  it('keeps a single zero for an all-zero fraction crossing the point', () => {
    expect(trimTrailingZeroFraction('0.00000000')).toBe('0');
    expect(trimTrailingZeroFraction('-0.00')).toBe('0');
  });

  it('never introduces or requires float parsing (feeds straight into parseDecimalToMinor)', () => {
    // real precision (non-zero beyond the declared scale) still throws downstream
    expect(() =>
      parseDecimalToMinor(trimTrailingZeroFraction('324.12345678'), 6),
    ).toThrow();
    // zero-padded precision is safely trimmed first
    expect(
      parseDecimalToMinor(trimTrailingZeroFraction('324.12000000'), 6),
    ).toBe(324120000n);
  });
});

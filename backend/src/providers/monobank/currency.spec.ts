import { resolveCurrency } from './currency';

describe('resolveCurrency', () => {
  it('maps known ISO numeric codes', () => {
    expect(resolveCurrency(980)).toEqual({ code: 'UAH', decimals: 2 });
    expect(resolveCurrency(840)).toEqual({ code: 'USD', decimals: 2 });
    expect(resolveCurrency(978)).toEqual({ code: 'EUR', decimals: 2 });
  });

  it('falls back to numeric string with 2 decimals for unknown codes', () => {
    expect(resolveCurrency(123)).toEqual({ code: '123', decimals: 2 });
  });
});

import { resolveAssetDecimals } from './asset';

describe('resolveAssetDecimals', () => {
  it('resolves known assets, case-insensitively', () => {
    expect(resolveAssetDecimals('USDT')).toBe(6);
    expect(resolveAssetDecimals('usdt')).toBe(6);
    expect(resolveAssetDecimals('BTC')).toBe(8);
    expect(resolveAssetDecimals('ETH')).toBe(18);
  });

  it('falls back to 8dp for an unknown asset', () => {
    expect(resolveAssetDecimals('SOMENEWCOIN')).toBe(8);
  });
});

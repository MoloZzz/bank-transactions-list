/**
 * Crypto asset ticker -> minor-unit scale (`decimals`), analogous to
 * `providers/monobank/currency.ts` for fiat. Binance CSVs give us the asset
 * ticker but not its scale, so we keep a small lookup here (ASSUMPTION,
 * documented in the Crypto CSV vault note): USDT/USDC follow their most common
 * on-chain scale (TRC20/ERC20 = 6dp); BTC/ETH use their native chain scale.
 * Unknown assets fall back to 8dp (Binance's typical UI display precision) so
 * an unexpected ticker degrades gracefully instead of crashing the import.
 */
const ASSET_DECIMALS: Record<string, number> = {
  USDT: 6,
  USDC: 6,
  BUSD: 18,
  BTC: 8,
  ETH: 18,
  BNB: 18,
};

const DEFAULT_DECIMALS = 8;

export function resolveAssetDecimals(symbol: string): number {
  return ASSET_DECIMALS[symbol.trim().toUpperCase()] ?? DEFAULT_DECIMALS;
}

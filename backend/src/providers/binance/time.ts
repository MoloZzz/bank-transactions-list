/**
 * Binance CSV timestamps are printed as "YYYY-MM-DD HH:mm:ss" and are already
 * UTC (columns are literally named "Time(UTC)" / "Date(UTC)" in the exports).
 * We only need to make that explicit to `Date` — no timezone math (invariant
 * #2: storage is UTC).
 */
export function parseBinanceUtcDate(raw: string): Date {
  const trimmed = raw.trim();
  const iso = `${trimmed.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid Binance UTC timestamp: "${raw}"`);
  }
  return d;
}

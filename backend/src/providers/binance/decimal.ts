/**
 * Binance CSV exports often print crypto quantities padded to a fixed number
 * of fractional digits (e.g. "320.00000000") regardless of the asset's real
 * scale. `parseDecimalToMinor` (core `money.ts`) rejects any fractional part
 * longer than the declared `decimals` — by design, to catch genuine precision
 * loss (invariant #1). Padding with trailing zeros isn't precision loss, so we
 * strip it here, at the provider boundary, before handing the string to the
 * float-free parser. This is string trimming only — never a float touches the
 * value.
 */
export function trimTrailingZeroFraction(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes('.')) return trimmed;
  const stripped = trimmed.replace(/0+$/, '').replace(/\.$/, '');
  if (['', '-', '+', '-0', '+0'].includes(stripped)) return '0';
  return stripped;
}

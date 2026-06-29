/**
 * Float-free money conversions (invariant #1). Decimal strings from CSVs are
 * parsed into integer minor units as BigInt; nothing ever becomes a JS number.
 * Formatting back to a human string happens only at the display/export layer.
 */

/**
 * Parse a decimal string into signed minor units.
 *  parseDecimalToMinor('12.34', 2)                 -> 1234n
 *  parseDecimalToMinor('-0.01', 2)                 -> -1n
 *  parseDecimalToMinor('0.000000000000000001', 18) -> 1n
 *
 * Throws if the fractional part is longer than `decimals` (silent precision
 * loss is never acceptable for money) or if the input isn't a plain decimal.
 */
export function parseDecimalToMinor(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const trimmed = value.trim();
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!m) throw new Error(`not a decimal number: "${value}"`);

  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2];
  const fracPart = m[3] ?? '';
  if (fracPart.length > decimals) {
    throw new Error(
      `value "${value}" has more fractional digits than scale ${decimals}`,
    );
  }
  const fracPadded = fracPart.padEnd(decimals, '0');
  return sign * BigInt(intPart + fracPadded);
}

/**
 * Format signed minor units back to a fixed-`decimals` decimal string.
 *  formatMinor(1234n, 2) -> '12.34'
 *  formatMinor(-1n, 2)   -> '-0.01'
 *  formatMinor(100n, 0)  -> '100'
 */
export function formatMinor(amount: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const neg = amount < 0n;
  const digits = (neg ? -amount : amount).toString();
  if (decimals === 0) return (neg ? '-' : '') + digits;

  const padded = digits.padStart(decimals + 1, '0');
  const cut = padded.length - decimals;
  return `${neg ? '-' : ''}${padded.slice(0, cut)}.${padded.slice(cut)}`;
}

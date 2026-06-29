import { ValueTransformer } from 'typeorm';

/**
 * Maps a Postgres numeric(38,0) column <-> JS BigInt.
 *
 * Money is ALWAYS stored as an integer number of minor units (kopecks/cents/wei).
 * Postgres returns numeric as a string; we hydrate it into BigInt so arithmetic
 * never touches IEEE-754 floats. Human formatting happens only in the
 * display/export layer using `decimals` (scale) + `currencyCode`.
 */
export const bigintTransformer: ValueTransformer = {
  to(value?: bigint | string | null): string | null | undefined {
    if (value === null || value === undefined) return value;
    return value.toString();
  },
  from(value?: string | null): bigint | null | undefined {
    if (value === null || value === undefined) return value;
    return BigInt(value);
  },
};

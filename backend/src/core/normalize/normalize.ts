import { NormalizedTransaction } from './normalized-transaction';

/**
 * Final gate before a provider's output enters core. Enforces the money/time
 * invariants structurally so a malformed provider can't poison the DB:
 *  - amount must be a BigInt (never a float/number)
 *  - decimals a non-negative integer
 *  - bookedAt a valid Date (treated as the absolute UTC instant)
 *  - source / externalId / currencyCode non-empty
 *
 * Returns a clean object with metadata defaulted to {}. Pure — no I/O, no
 * source awareness.
 */
export function toNormalized(
  input: NormalizedTransaction,
): NormalizedTransaction {
  if (typeof input.amount !== 'bigint') {
    throw new Error('amount must be a BigInt (integer minor units)');
  }
  if (!Number.isInteger(input.decimals) || input.decimals < 0) {
    throw new Error(`invalid decimals: ${input.decimals}`);
  }
  if (
    !(input.bookedAt instanceof Date) ||
    Number.isNaN(input.bookedAt.getTime())
  ) {
    throw new Error('bookedAt must be a valid Date');
  }
  for (const field of ['source', 'externalId', 'currencyCode'] as const) {
    if (!input[field] || input[field].trim() === '') {
      throw new Error(`${field} is required`);
    }
  }
  return {
    source: input.source,
    externalId: input.externalId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    decimals: input.decimals,
    type: input.type,
    bookedAt: input.bookedAt,
    account: input.account,
    metadata: input.metadata ?? {},
  };
}

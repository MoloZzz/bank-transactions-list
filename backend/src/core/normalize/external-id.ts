import { createHash } from 'crypto';

/**
 * Deterministic external id for sources that lack a stable native id (CSV rows).
 * The dedup key is UNIQUE(source, externalId) (invariant #4), so the hash must
 * be stable across re-imports and derived only from immutable row fields chosen
 * by the provider (e.g. timestamp + amount + counterparty).
 *
 * Space-separated parts; providers should include enough fields to make a row
 * unique within their source.
 */
export function buildExternalId(parts: ReadonlyArray<string | number>): string {
  const hash = createHash('sha256');
  hash.update(parts.map((p) => String(p)).join(' '));
  return hash.digest('hex');
}

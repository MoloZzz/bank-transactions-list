/**
 * Source-agnostic account descriptor a provider attaches to a transaction. The
 * sync layer upserts it into the Account table and links the transaction.
 * `externalId` is the native account id within the source; display fields are
 * best-effort and enriched over time.
 */
export interface NormalizedAccount {
  externalId: string;
  name?: string;
  maskedPan?: string;
  currencyCode?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

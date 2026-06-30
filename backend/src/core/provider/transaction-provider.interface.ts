import { NormalizedTransaction } from '../normalize/normalized-transaction';

/**
 * The only contract the sync engine knows about. A new data source = a new
 * implementation under its own folder — core/normalize/sync never branch on
 * `source` (invariant #3).
 *
 * A provider does two things and nothing more: fetch raw rows from its source
 * and map their fields into NormalizedTransaction (using the shared normalize
 * helpers). No business logic, no matching, no side effects.
 */
export interface TransactionProvider {
  /** Stable provider key, e.g. 'monobank', 'binance_p2p_csv'. */
  readonly source: string;

  /**
   * Fetch + field-map the source into canonical transactions.
   *
   * @param sinceSec Optional lower bound (unix seconds). The sync engine passes
   * the watermark (latest already-stored transaction for this source) so a
   * routine run only pulls what's new. When omitted (empty DB), the provider
   * falls back to its own configured floor — a full backfill.
   */
  fetch(sinceSec?: number): Promise<NormalizedTransaction[]>;
}

import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { NormalizedAccount } from './normalized-account';

/**
 * Canonical, source-agnostic transaction. Every provider maps its raw rows into
 * this shape; the sync layer persists it 1:1 into the Transaction entity.
 *
 * Money discipline (invariant #1): `amount` is signed integer minor units as a
 * BigInt — never a float. `currencyCode` (fiat ISO or crypto asset) and
 * `decimals` (scale) travel with it so the value is self-describing.
 *
 * Time (invariant #2): `bookedAt` is an absolute instant (UTC).
 *
 * Source-specific extras (Monobank mcc, P2P rate/fiatCost, raw fields) go in
 * `metadata` — keeps the matching layer fed without leaking source awareness
 * into core.
 */
export interface NormalizedTransaction {
  source: string;
  externalId: string;
  amount: bigint;
  currencyCode: string;
  decimals: number;
  type: TransactionType;
  bookedAt: Date;
  /** Source account/card this transaction belongs to (optional). */
  account?: NormalizedAccount;
  metadata?: Record<string, unknown>;
}

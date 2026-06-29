import { NormalizedTransaction } from '../core/normalize/normalized-transaction';

/** Emitted once per newly persisted transaction (never for dedup hits). */
export const TRANSACTION_CREATED = 'transaction.created';

export type TransactionCreatedPayload = NormalizedTransaction;

/**
 * Minimal event sink the sync engine depends on. Side effects (Google Sheets,
 * future analytics) subscribe to TRANSACTION_CREATED — they never sit on the
 * sync/persist path (invariant #6). In the Nest runtime this is satisfied by
 * EventEmitter2; tests pass a recording fake.
 */
export interface EventBus {
  emit(event: string, payload: unknown): void;
}

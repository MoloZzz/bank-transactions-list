import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { SheetsClient, SheetRow } from './sheets-client.interface';
import { transactionToSheetRow } from './sheet-row';

/**
 * Subscribes to TRANSACTION_CREATED and exports rows to Google Sheets — fully
 * isolated behind the event (invariant #6); it knows nothing about providers
 * or the sync engine, only normalized transactions.
 *
 * It BUFFERS rows as events arrive and writes them in one batch append on
 * flush(). A full-history backfill emits thousands of events; per-event API
 * calls would be slow and hit Sheets rate limits, so the entrypoint calls
 * flush() once after a sync run completes.
 *
 * In the Nest runtime, onTransactionCreated is bound with @OnEvent(
 * TRANSACTION_CREATED) in the app module (kept out of here so this class has no
 * framework dependency and stays trivially testable).
 */
export class SheetsSubscriber {
  private buffer: SheetRow[] = [];

  constructor(private readonly client: SheetsClient) {}

  onTransactionCreated(tx: NormalizedTransaction): void {
    this.buffer.push(transactionToSheetRow(tx));
  }

  /** Write everything buffered so far as a single batch append. */
  async flush(): Promise<number> {
    if (this.buffer.length === 0) return 0;
    const rows = this.buffer;
    this.buffer = [];
    await this.client.appendRows(rows);
    return rows.length;
  }

  pending(): number {
    return this.buffer.length;
  }
}

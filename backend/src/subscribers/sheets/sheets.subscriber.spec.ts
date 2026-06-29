import { SheetsSubscriber } from './sheets.subscriber';
import { SheetsClient, SheetRow } from './sheets-client.interface';
import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';

class FakeSheets implements SheetsClient {
  calls: SheetRow[][] = [];
  async appendRows(rows: SheetRow[]): Promise<void> {
    this.calls.push(rows);
  }
}

function tx(externalId: string): NormalizedTransaction {
  return {
    source: 'monobank',
    externalId,
    amount: -100n,
    currencyCode: 'UAH',
    decimals: 2,
    type: TransactionType.TRANSFER,
    bookedAt: new Date('2026-06-01T10:00:00.000Z'),
    metadata: {},
  };
}

describe('SheetsSubscriber', () => {
  it('buffers events and writes them in a single batch on flush', async () => {
    const client = new FakeSheets();
    const sub = new SheetsSubscriber(client);

    sub.onTransactionCreated(tx('a'));
    sub.onTransactionCreated(tx('b'));
    expect(sub.pending()).toBe(2);
    expect(client.calls).toHaveLength(0); // nothing written until flush

    const written = await sub.flush();
    expect(written).toBe(2);
    expect(client.calls).toHaveLength(1); // one batched append
    expect(client.calls[0]).toHaveLength(2);
    expect(sub.pending()).toBe(0);
  });

  it('flush with an empty buffer is a no-op', async () => {
    const client = new FakeSheets();
    const sub = new SheetsSubscriber(client);
    expect(await sub.flush()).toBe(0);
    expect(client.calls).toHaveLength(0);
  });
});

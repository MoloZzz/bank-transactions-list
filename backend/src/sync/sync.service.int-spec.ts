import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { NormalizedTransaction } from '../core/normalize/normalized-transaction';
import { TransactionProvider } from '../core/provider/transaction-provider.interface';
import { TransactionType } from '../modules/transactions/enums/transaction-type.enum';
import { SyncService } from './sync.service';

class FakeProvider implements TransactionProvider {
  constructor(
    readonly source: string,
    private readonly rows: NormalizedTransaction[],
  ) {}
  async fetch(): Promise<NormalizedTransaction[]> {
    return this.rows;
  }
}

function tx(
  over: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'source' | 'externalId'>,
): NormalizedTransaction {
  return {
    amount: -45000n,
    currencyCode: 'UAH',
    decimals: 2,
    type: TransactionType.TRANSFER,
    bookedAt: new Date('2026-06-01T10:00:00.000Z'),
    metadata: { mcc: 5411 },
    ...over,
  };
}

describe('SyncService (integration)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource(buildDataSourceOptions());
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
    await ds.runMigrations();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  beforeEach(async () => {
    await ds.getRepository(Transaction).clear();
  });

  it('persists fetched transactions and reports created counts', async () => {
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'a' }),
      tx({ source: 'monobank', externalId: 'b', amount: 12345n }),
    ]);
    const sync = new SyncService(ds.getRepository(Transaction), [provider]);

    const res = await sync.sync();

    expect(res.totalReceived).toBe(2);
    expect(res.totalCreated).toBe(2);
    expect(res.bySource['monobank']).toEqual({ received: 2, created: 2 });
    expect(await ds.getRepository(Transaction).count()).toBe(2);
  });

  it('is idempotent: re-running creates no duplicates', async () => {
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'a' }),
      tx({ source: 'monobank', externalId: 'b' }),
    ]);
    const sync = new SyncService(ds.getRepository(Transaction), [provider]);

    const first = await sync.sync();
    const second = await sync.sync();

    expect(first.totalCreated).toBe(2);
    expect(second.totalCreated).toBe(0); // dedup on UNIQUE(source, externalId)
    expect(await ds.getRepository(Transaction).count()).toBe(2);
  });

  it('treats same externalId from a different source as distinct', async () => {
    const sync = new SyncService(ds.getRepository(Transaction), [
      new FakeProvider('monobank', [tx({ source: 'monobank', externalId: 'x' })]),
      new FakeProvider('binance_p2p_csv', [
        tx({ source: 'binance_p2p_csv', externalId: 'x', currencyCode: 'USDT', decimals: 8 }),
      ]),
    ]);

    const res = await sync.sync();
    expect(res.totalCreated).toBe(2);
    expect(await ds.getRepository(Transaction).count()).toBe(2);
  });

  it('round-trips amount as exact BigInt after save', async () => {
    const huge = 1000000000000000000000000000001n;
    const provider = new FakeProvider('binance_deposit_csv', [
      tx({
        source: 'binance_deposit_csv',
        externalId: 'eth-1',
        amount: huge,
        currencyCode: 'ETH',
        decimals: 18,
        type: TransactionType.DEPOSIT,
      }),
    ]);
    const sync = new SyncService(ds.getRepository(Transaction), [provider]);
    await sync.sync();

    const saved = await ds
      .getRepository(Transaction)
      .findOneByOrFail({ source: 'binance_deposit_csv', externalId: 'eth-1' });
    expect(typeof saved.amount).toBe('bigint');
    expect(saved.amount).toBe(huge);
  });
});

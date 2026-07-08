import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { Account } from '../modules/accounts/entities/account.entity';
import { NormalizedTransaction } from '../core/normalize/normalized-transaction';
import { TransactionProvider } from '../core/provider/transaction-provider.interface';
import { TransactionType } from '../modules/transactions/enums/transaction-type.enum';
import { EventBus, TRANSACTION_CREATED } from '../events/events';
import { SyncService } from './sync.service';

class FakeProvider implements TransactionProvider {
  lastSince: number | undefined = -1;
  constructor(
    readonly source: string,
    private readonly rows: NormalizedTransaction[],
  ) {}
  async fetch(sinceSec?: number): Promise<NormalizedTransaction[]> {
    this.lastSince = sinceSec;
    return this.rows;
  }
}

class RecordingBus implements EventBus {
  events: Array<{ event: string; payload: unknown }> = [];
  emit(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

function tx(
  over: Partial<NormalizedTransaction> &
    Pick<NormalizedTransaction, 'source' | 'externalId'>,
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
    await ds.query('TRUNCATE "transactions", "accounts" CASCADE');
  });

  it('persists fetched transactions and reports created counts', async () => {
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'a' }),
      tx({ source: 'monobank', externalId: 'b', amount: 12345n }),
    ]);
    const sync = new SyncService(ds, [provider]);

    const res = await sync.sync();

    expect(res.totalCreated).toBe(2);
    expect(await ds.getRepository(Transaction).count()).toBe(2);
  });

  it('is idempotent: re-running creates no duplicates', async () => {
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'a' }),
      tx({ source: 'monobank', externalId: 'b' }),
    ]);
    const sync = new SyncService(ds, [provider]);

    const first = await sync.sync();
    const second = await sync.sync();

    expect(first.totalCreated).toBe(2);
    expect(second.totalCreated).toBe(0);
    expect(await ds.getRepository(Transaction).count()).toBe(2);
  });

  it('treats same externalId from a different source as distinct', async () => {
    const sync = new SyncService(ds, [
      new FakeProvider('monobank', [
        tx({ source: 'monobank', externalId: 'x' }),
      ]),
      new FakeProvider('binance_p2p_csv', [
        tx({
          source: 'binance_p2p_csv',
          externalId: 'x',
          currencyCode: 'USDT',
          decimals: 8,
        }),
      ]),
    ]);

    const res = await sync.sync();
    expect(res.totalCreated).toBe(2);
  });

  it('round-trips amount as exact BigInt after save', async () => {
    const huge = 1000000000000000000000000000001n;
    const sync = new SyncService(ds, [
      new FakeProvider('binance_deposit_csv', [
        tx({
          source: 'binance_deposit_csv',
          externalId: 'eth-1',
          amount: huge,
          currencyCode: 'ETH',
          decimals: 18,
          type: TransactionType.DEPOSIT,
        }),
      ]),
    ]);
    await sync.sync();

    const saved = await ds
      .getRepository(Transaction)
      .findOneByOrFail({ source: 'binance_deposit_csv', externalId: 'eth-1' });
    expect(typeof saved.amount).toBe('bigint');
    expect(saved.amount).toBe(huge);
  });

  it('emits transaction.created once per created row, never for dedup hits', async () => {
    const bus = new RecordingBus();
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'a' }),
      tx({ source: 'monobank', externalId: 'b' }),
    ]);
    const sync = new SyncService(ds, [provider], bus);

    await sync.sync();
    expect(bus.events).toHaveLength(2);
    await sync.sync();
    expect(bus.events).toHaveLength(2);
  });

  it('passes the per-source watermark (max bookedAt) to the provider', async () => {
    const seed = new FakeProvider('monobank', [
      tx({
        source: 'monobank',
        externalId: 'a',
        bookedAt: new Date('2026-06-10T08:00:00.000Z'),
      }),
      tx({
        source: 'monobank',
        externalId: 'b',
        bookedAt: new Date('2026-06-20T09:30:00.000Z'),
      }),
    ]);
    await new SyncService(ds, [seed]).sync();
    expect(seed.lastSince).toBeUndefined();

    const next = new FakeProvider('monobank', []);
    await new SyncService(ds, [next]).sync();
    expect(next.lastSince).toBe(
      Math.floor(new Date('2026-06-20T09:30:00.000Z').getTime() / 1000),
    );
  });

  it('upserts the account and links the transaction via accountId', async () => {
    const provider = new FakeProvider('monobank', [
      tx({
        source: 'monobank',
        externalId: 't1',
        account: {
          externalId: 'acc-1',
          maskedPan: '537541******1234',
          type: 'black',
          currencyCode: 'UAH',
        },
      }),
    ]);
    await new SyncService(ds, [provider]).sync();

    const accounts = await ds.getRepository(Account).find();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      source: 'monobank',
      externalId: 'acc-1',
      maskedPan: '537541******1234',
      type: 'black',
      currencyCode: 'UAH',
    });

    const t = await ds
      .getRepository(Transaction)
      .findOneByOrFail({ source: 'monobank', externalId: 't1' });
    expect(t.accountId).toBe(accounts[0].id);
  });

  it('enriches an existing account on re-sync without creating a duplicate', async () => {
    const minimal = new FakeProvider('monobank', [
      tx({
        source: 'monobank',
        externalId: 't1',
        account: { externalId: 'acc-1' },
      }),
    ]);
    await new SyncService(ds, [minimal]).sync();

    let accounts = await ds.getRepository(Account).find();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].maskedPan).toBeNull();

    const enriched = new FakeProvider('monobank', [
      tx({
        source: 'monobank',
        externalId: 't2',
        account: {
          externalId: 'acc-1',
          maskedPan: '5375******1234',
          type: 'black',
        },
      }),
    ]);
    await new SyncService(ds, [enriched]).sync();

    accounts = await ds.getRepository(Account).find();
    expect(accounts).toHaveLength(1); // same account, enriched
    expect(accounts[0].maskedPan).toBe('5375******1234');
  });

  it('leaves accountId null when a transaction has no account', async () => {
    const provider = new FakeProvider('monobank', [
      tx({ source: 'monobank', externalId: 'no-acc' }),
    ]);
    await new SyncService(ds, [provider]).sync();

    const t = await ds
      .getRepository(Transaction)
      .findOneByOrFail({ source: 'monobank', externalId: 'no-acc' });
    expect(t.accountId).toBeNull();
    expect(await ds.getRepository(Account).count()).toBe(0);
  });
});

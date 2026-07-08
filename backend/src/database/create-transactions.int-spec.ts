import { DataSource, QueryFailedError } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { TransactionType } from '../modules/transactions/enums/transaction-type.enum';

/**
 * Step-1 integration test. Requires a reachable Postgres (docker-compose.yml or
 * DB_* env). Run with: npm run test:int
 *
 *  - migration applies cleanly and creates `transactions`
 *  - #4 UNIQUE(source, externalId) blocks duplicate sync (idempotency)
 *  - #1 amount survives round-trip as exact BigInt minor units (no float drift),
 *    for both fiat and high-precision crypto
 */
describe('CreateTransactions migration (integration)', () => {
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

  it('creates the transactions table via migration', async () => {
    const rows = await ds.query(
      `SELECT to_regclass('public.transactions') AS t`,
    );
    expect(rows[0].t).toBe('transactions');
  });

  it('enforces UNIQUE(source, externalId) — idempotent sync', async () => {
    const repo = ds.getRepository(Transaction);
    const base = {
      source: 'monobank',
      externalId: 'ext-1',
      amount: -45000n, // -450.00 UAH outflow
      currencyCode: 'UAH',
      decimals: 2,
      type: TransactionType.TRANSFER,
      bookedAt: new Date('2026-06-01T10:00:00.000Z'),
      metadata: { mcc: 4829 },
    };

    await repo.insert(base);

    await expect(repo.insert({ ...base, amount: -1n })).rejects.toBeInstanceOf(
      QueryFailedError,
    );

    const count = await repo.count({
      where: { source: 'monobank', externalId: 'ext-1' },
    });
    expect(count).toBe(1);
  });

  it('round-trips amount as exact BigInt minor units (no float drift)', async () => {
    const repo = ds.getRepository(Transaction);
    const huge = 1000000000000000000000000000001n; // 10^30 + 1, beyond int8/float

    const saved = await repo.save(
      repo.create({
        source: 'binance_deposit_csv',
        externalId: 'crypto-1',
        amount: huge,
        currencyCode: 'ETH',
        decimals: 18,
        type: TransactionType.DEPOSIT,
        bookedAt: new Date('2026-06-02T00:00:00.000Z'),
        metadata: { rateSource: 'NBU', estimate: true },
      }),
    );

    const reloaded = await repo.findOneByOrFail({ id: saved.id });
    expect(typeof reloaded.amount).toBe('bigint');
    expect(reloaded.amount).toBe(huge);
    expect(reloaded.bookedAt.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });
});

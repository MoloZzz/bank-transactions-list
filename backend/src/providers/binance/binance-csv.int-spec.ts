import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../config/database.config';
import { Transaction } from '../../modules/transactions/entities/transaction.entity';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { SyncService } from '../../sync/sync.service';
import { BinanceP2pProvider } from './binance-p2p.provider';
import { BinanceDepositProvider } from './binance-deposit.provider';

const P2P_FIXTURE = join(__dirname, '__fixtures__/p2p-orders.sample.csv');
const DEPOSIT_FIXTURE = join(
  __dirname,
  '__fixtures__/deposit-history.sample.csv',
);

/**
 * End-to-end: real CSV fixtures -> providers -> SyncService -> Postgres.
 * Mirrors sync/sync.service.int-spec.ts but exercises the actual Crypto CSV
 * providers instead of a fake, proving the full import path (parser, scale,
 * hash, idempotent persist) against the real schema.
 */
describe('Binance CSV providers (integration)', () => {
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

  function providers() {
    return [
      new BinanceP2pProvider({ filePath: P2P_FIXTURE }, () =>
        readFileSync(P2P_FIXTURE, 'utf8'),
      ),
      new BinanceDepositProvider({ filePath: DEPOSIT_FIXTURE }, () =>
        readFileSync(DEPOSIT_FIXTURE, 'utf8'),
      ),
    ];
  }

  it('imports both CSV formats into Postgres with correct scale and sign', async () => {
    const sync = new SyncService(ds, providers());
    const res = await sync.sync();

    expect(res.totalCreated).toBe(4); // 2 P2P orders + 2 deposits
    expect(await ds.getRepository(Transaction).count()).toBe(4);

    const repo = ds.getRepository(Transaction);
    const buy = await repo.findOneByOrFail({
      source: 'binance_p2p_csv',
      type: TransactionType.BUY,
    });
    expect(typeof buy.amount).toBe('bigint');
    expect(buy.amount).toBe(320_000000n);
    expect(buy.currencyCode).toBe('USDT');
    expect(buy.decimals).toBe(6);
    expect(buy.metadata).toMatchObject({ tradeRef: '20260601123456789' });

    const sell = await repo.findOneByOrFail({
      source: 'binance_p2p_csv',
      type: TransactionType.SELL,
    });
    expect(sell.amount).toBe(-100_000000n);

    const btcDeposit = await repo.findOneByOrFail({
      source: 'binance_deposit_csv',
      currencyCode: 'BTC',
    });
    expect(btcDeposit.type).toBe(TransactionType.DEPOSIT);
    expect(btcDeposit.amount).toBe(1_234_500n);
    expect(btcDeposit.decimals).toBe(8);
    expect(btcDeposit.accountId).toBeNull(); // no account concept for CSV crypto rows
  });

  it('re-importing the identical files is idempotent (0 new rows)', async () => {
    const first = await new SyncService(ds, providers()).sync();
    const second = await new SyncService(ds, providers()).sync();

    expect(first.totalCreated).toBe(4);
    expect(second.totalCreated).toBe(0);
    expect(await ds.getRepository(Transaction).count()).toBe(4);
  });

  it('keeps binance_p2p_csv and binance_deposit_csv dedup scopes independent from monobank', () => {
    // sanity: distinct `source` values coexist under the shared UNIQUE(source, externalId)
    const sources = new Set(providers().map((p) => p.source));
    expect(sources).toEqual(
      new Set(['binance_p2p_csv', 'binance_deposit_csv']),
    );
  });
});

import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { CryptoPurchase } from '../modules/crypto-purchases/entities/crypto-purchase.entity';
import { TransactionType } from '../modules/transactions/enums/transaction-type.enum';
import { MatchingService } from './matching.service';

const OPTS = { windowSec: 7200, toleranceMinor: 0n };

describe('MatchingService (integration)', () => {
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
    await ds.query(
      'TRUNCATE "crypto_purchases", "transactions", "accounts" CASCADE',
    );
  });

  async function seedDebit(
    over: Partial<Transaction> = {},
  ): Promise<Transaction> {
    return ds.getRepository(Transaction).save(
      ds.getRepository(Transaction).create({
        source: 'monobank',
        externalId: over.externalId ?? 'debit-1',
        amount: -78_000n,
        currencyCode: 'UAH',
        decimals: 2,
        type: TransactionType.TRANSFER,
        bookedAt: new Date('2026-06-01T10:00:00.000Z'),
        metadata: { mcc: 6051 },
        ...over,
      }),
    );
  }

  async function seedP2pBuyLeg(
    over: Partial<Transaction> = {},
  ): Promise<Transaction> {
    return ds.getRepository(Transaction).save(
      ds.getRepository(Transaction).create({
        source: 'binance_p2p_csv',
        externalId: over.externalId ?? 'buy-1',
        amount: 100_000_000n, // 1 USDT at 8dp
        currencyCode: 'USDT',
        decimals: 8,
        type: TransactionType.BUY,
        bookedAt: new Date('2026-06-01T10:30:00.000Z'),
        metadata: {
          orderNumber: over.externalId ?? 'buy-1',
          side: 'BUY',
          fiatCurrencyCode: 'UAH',
          fiatAmountMinor: '78000',
          fiatDecimals: 2,
          rate: '45.0',
          tradeRef: over.externalId ?? 'buy-1',
        },
        ...over,
      }),
    );
  }

  it('matches a P2P BUY leg to the preceding card debit within window', async () => {
    const debit = await seedDebit();
    const leg = await seedP2pBuyLeg();

    const svc = new MatchingService(ds, OPTS);
    const result = await svc.run();

    expect(result).toEqual({ processed: 1, matched: 1, unmatched: 0 });

    const rows = await ds.getRepository(CryptoPurchase).find();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cryptoTxId: leg.id,
      cardTxId: debit.id,
      asset: 'USDT',
      fiatCurrency: 'UAH',
      rateSource: 'CSV',
      matchType: 'p2p',
    });
    expect(rows[0].cryptoAmount).toBe(100_000_000n);
    expect(rows[0].fiatAmount).toBe(78_000n);
    expect(rows[0].confidence).not.toBeNull();
  });

  it('creates a row with cardTxId null when there is no matching debit', async () => {
    const leg = await seedP2pBuyLeg();
    // no debit seeded at all

    const svc = new MatchingService(ds, OPTS);
    const result = await svc.run();

    expect(result).toEqual({ processed: 1, matched: 0, unmatched: 1 });

    const rows = await ds.getRepository(CryptoPurchase).find();
    expect(rows).toHaveLength(1);
    expect(rows[0].cryptoTxId).toBe(leg.id);
    expect(rows[0].cardTxId).toBeNull();
    expect(rows[0].confidence).toBeNull();
  });

  it('leaves cardTxId null when the only debit is outside the time window', async () => {
    await seedDebit({
      bookedAt: new Date('2026-06-01T05:00:00.000Z'), // > 2h before the leg
    });
    await seedP2pBuyLeg();

    const svc = new MatchingService(ds, OPTS);
    const result = await svc.run();

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(1);
  });

  it('is idempotent on re-run and never overwrites a manualOverride row', async () => {
    const debit = await seedDebit();
    const leg = await seedP2pBuyLeg();

    const svc = new MatchingService(ds, OPTS);
    await svc.run();

    const purchaseRepo = ds.getRepository(CryptoPurchase);
    let rows = await purchaseRepo.find();
    expect(rows).toHaveLength(1);

    // Re-run: still exactly one row per leg, same link.
    const second = await svc.run();
    expect(second).toEqual({ processed: 1, matched: 1, unmatched: 0 });
    rows = await purchaseRepo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].cardTxId).toBe(debit.id);

    // User manually overrides: break the link and flag manualOverride.
    await purchaseRepo.update(
      { cryptoTxId: leg.id },
      { cardTxId: null, manualOverride: true, matchType: 'p2p' },
    );

    // Re-run again: manualOverride row must not be clobbered.
    const third = await svc.run();
    expect(third).toEqual({ processed: 1, matched: 0, unmatched: 1 });
    rows = await purchaseRepo.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].cardTxId).toBeNull();
    expect(rows[0].manualOverride).toBe(true);
  });

  it('enforces 1-to-1: two BUY legs never share the same card debit', async () => {
    const debit = await seedDebit();
    const leg1 = await seedP2pBuyLeg({
      externalId: 'buy-1',
      bookedAt: new Date('2026-06-01T10:15:00.000Z'),
    });
    const leg2 = await seedP2pBuyLeg({
      externalId: 'buy-2',
      bookedAt: new Date('2026-06-01T10:45:00.000Z'),
    });

    const svc = new MatchingService(ds, OPTS);
    const result = await svc.run();

    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(1);

    const rows = await ds.getRepository(CryptoPurchase).find();
    const linked = rows.filter((r) => r.cardTxId === debit.id);
    expect(linked).toHaveLength(1);
    // the earlier-processed leg (leg1, booked first) should win the single debit
    expect(linked[0].cryptoTxId).toBe(leg1.id);
    const other = rows.find((r) => r.cryptoTxId === leg2.id);
    expect(other?.cardTxId).toBeNull();
  });
});

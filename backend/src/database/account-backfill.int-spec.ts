import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/database.config';
import { CreateTransactions1719660000000 } from './migrations/1719660000000-CreateTransactions';
import { AddAccounts1719660000001 } from './migrations/1719660000001-AddAccounts';

/**
 * Proves the AddAccounts migration backfills accounts + links for data that was
 * stored before the accounts table existed (from transactions.metadata.accountId).
 */
describe('AddAccounts migration backfill (integration)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource(buildDataSourceOptions());
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE');
    await ds.query('CREATE SCHEMA public');
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('creates accounts from metadata.accountId and links existing rows', async () => {
    const qr = ds.createQueryRunner();

    // 1) only the base table exists (pre-accounts world)
    await new CreateTransactions1719660000000().up(qr);

    // 2) legacy rows carrying the account id only in metadata
    await qr.query(`
      INSERT INTO "transactions"
        ("source","externalId","amount","currencyCode","decimals","type","bookedAt","metadata")
      VALUES
        ('monobank','t1',-45000,'UAH',2,'transfer','2026-06-01T10:00:00Z','{"accountId":"acc-1"}'),
        ('monobank','t2', 12000,'UAH',2,'transfer','2026-06-02T10:00:00Z','{"accountId":"acc-1"}'),
        ('monobank','t3',-9900,'UAH',2,'transfer','2026-06-03T10:00:00Z','{"accountId":"acc-2"}')
    `);

    // 3) run the accounts migration -> should backfill
    await new AddAccounts1719660000001().up(qr);

    const accounts = await qr.query(
      `SELECT "externalId" FROM "accounts" ORDER BY "externalId"`,
    );
    expect(accounts.map((a: { externalId: string }) => a.externalId)).toEqual([
      'acc-1',
      'acc-2',
    ]);

    const linked = await qr.query(`
      SELECT t."externalId" AS tx, a."externalId" AS acc
      FROM "transactions" t JOIN "accounts" a ON a."id" = t."accountId"
      ORDER BY t."externalId"
    `);
    expect(linked).toEqual([
      { tx: 't1', acc: 'acc-1' },
      { tx: 't2', acc: 'acc-1' },
      { tx: 't3', acc: 'acc-2' },
    ]);

    await qr.release();
  });
});

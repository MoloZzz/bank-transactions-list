import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { Account } from '../modules/accounts/entities/account.entity';
import { NormalizedTransaction } from '../core/normalize/normalized-transaction';
import { TransactionProvider } from '../core/provider/transaction-provider.interface';
import { EventBus, TRANSACTION_CREATED } from '../events/events';

export interface SourceSyncResult {
  received: number;
  created: number;
}

export interface SyncResult {
  bySource: Record<string, SourceSyncResult>;
  totalReceived: number;
  totalCreated: number;
}

/**
 * Orchestrates a sync run: for each provider, fetch normalized transactions,
 * upsert their accounts, and persist the transactions idempotently —
 * source-agnostic, it only knows the TransactionProvider contract (invariant
 * #3).
 *
 * Incremental: reads the per-source watermark (max bookedAt) and passes it to
 * the provider so routine runs pull only what's new.
 *
 * Accounts: a transaction may carry an account descriptor; the account is
 * upserted (enriching display fields over time) and the transaction linked via
 * accountId — so "which card" is a first-class, queryable field.
 *
 * Idempotency (invariant #4): bulk INSERT ... ON CONFLICT DO NOTHING. For each
 * genuinely new row TRANSACTION_CREATED is emitted (invariant #6).
 */
export class SyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly providers: TransactionProvider[],
    private readonly events?: EventBus,
  ) {}

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      bySource: {},
      totalReceived: 0,
      totalCreated: 0,
    };

    for (const provider of this.providers) {
      const watermark = await this.latestBookedAtSec(provider.source);
      const rows = await provider.fetch(watermark);
      const accountMap = await this.upsertAccounts(provider.source, rows);
      const created = await this.persist(rows, accountMap);

      for (const tx of created) {
        this.events?.emit(TRANSACTION_CREATED, tx);
      }

      result.bySource[provider.source] = {
        received: rows.length,
        created: created.length,
      };
      result.totalReceived += rows.length;
      result.totalCreated += created.length;
    }
    return result;
  }

  /** Latest stored transaction time for a source (unix seconds), or undefined. */
  private async latestBookedAtSec(source: string): Promise<number | undefined> {
    const row = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .select('MAX(t.bookedAt)', 'max')
      .where('t.source = :source', { source })
      .getRawOne<{ max: string | Date | null }>();

    if (!row?.max) return undefined;
    const ms = row.max instanceof Date ? row.max.getTime() : Date.parse(row.max);
    return Math.floor(ms / 1000);
  }

  /** Upsert the accounts referenced by these rows; return externalId -> id. */
  private async upsertAccounts(
    source: string,
    rows: NormalizedTransaction[],
  ): Promise<Map<string, string>> {
    const repo = this.dataSource.getRepository(Account);
    const byExternalId = new Map<string, NormalizedTransaction['account']>();
    for (const r of rows) {
      if (r.account) byExternalId.set(r.account.externalId, r.account);
    }
    if (byExternalId.size === 0) return new Map();

    const values = [...byExternalId.values()].map((a) => ({
      source,
      externalId: a!.externalId,
      name: a!.name ?? a!.maskedPan ?? a!.type ?? a!.externalId,
      maskedPan: a!.maskedPan ?? null,
      currencyCode: a!.currencyCode ?? null,
      type: a!.type ?? null,
    }));

    await repo.upsert(values, {
      conflictPaths: ['source', 'externalId'],
      skipUpdateIfNoValuesChanged: true,
    });

    const externalIds = [...byExternalId.keys()];
    const saved = await repo
      .createQueryBuilder('a')
      .select(['a.id AS id', 'a.externalId AS "externalId"'])
      .where('a.source = :source', { source })
      .andWhere('a.externalId IN (:...externalIds)', { externalIds })
      .getRawMany<{ id: string; externalId: string }>();

    return new Map(saved.map((a) => [a.externalId, a.id]));
  }

  /** Insert idempotently; return only the rows actually created. */
  async persist(
    rows: NormalizedTransaction[],
    accountMap: Map<string, string> = new Map(),
  ): Promise<NormalizedTransaction[]> {
    if (rows.length === 0) return [];

    const repo = this.dataSource.getRepository(Transaction);
    const entities = rows.map((r) =>
      repo.create({
        source: r.source,
        externalId: r.externalId,
        amount: r.amount,
        currencyCode: r.currencyCode,
        decimals: r.decimals,
        type: r.type,
        bookedAt: r.bookedAt,
        accountId: r.account ? accountMap.get(r.account.externalId) ?? null : null,
        metadata: r.metadata ?? {},
      }),
    );

    const inserted = await repo
      .createQueryBuilder()
      .insert()
      .into(Transaction)
      // cast: TypeORM's QueryDeepPartialEntity over a jsonb `Record<string,
      // unknown>` column rejects entity instances at compile time; the runtime
      // value is correct. Localized to this persistence boundary.
      .values(entities as QueryDeepPartialEntity<Transaction>[])
      .orIgnore() // ON CONFLICT DO NOTHING
      .returning(['source', 'externalId'])
      .execute();

    const createdKeys = new Set(
      (inserted.raw as Array<{ source: string; externalId: string }>).map(
        (x) => `${x.source} ${x.externalId}`,
      ),
    );
    return rows.filter((r) => createdKeys.has(`${r.source} ${r.externalId}`));
  }
}

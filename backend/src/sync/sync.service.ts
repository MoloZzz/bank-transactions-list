import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { NormalizedTransaction } from '../core/normalize/normalized-transaction';
import { TransactionProvider } from '../core/provider/transaction-provider.interface';

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
 * Orchestrates a sync run: for each provider, fetch normalized transactions and
 * persist them idempotently. Source-agnostic — it only knows the
 * TransactionProvider contract, never a concrete source (invariant #3).
 *
 * Idempotency (invariant #4): bulk INSERT ... ON CONFLICT (source, externalId)
 * DO NOTHING. Re-running creates no duplicates; only genuinely new rows are
 * inserted, and they're returned so a later subscriber can react to them
 * (transaction.created) without the sync engine knowing about side effects.
 */
export class SyncService {
  constructor(
    private readonly repo: Repository<Transaction>,
    private readonly providers: TransactionProvider[],
  ) {}

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      bySource: {},
      totalReceived: 0,
      totalCreated: 0,
    };

    for (const provider of this.providers) {
      const rows = await provider.fetch();
      const created = await this.persist(rows);
      result.bySource[provider.source] = {
        received: rows.length,
        created: created.length,
      };
      result.totalReceived += rows.length;
      result.totalCreated += created.length;
    }
    return result;
  }

  /** Insert idempotently; return only the rows actually created. */
  async persist(
    rows: NormalizedTransaction[],
  ): Promise<NormalizedTransaction[]> {
    if (rows.length === 0) return [];

    const entities = rows.map((r) =>
      this.repo.create({
        source: r.source,
        externalId: r.externalId,
        amount: r.amount,
        currencyCode: r.currencyCode,
        decimals: r.decimals,
        type: r.type,
        bookedAt: r.bookedAt,
        metadata: r.metadata ?? {},
      }),
    );

    const inserted = await this.repo
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

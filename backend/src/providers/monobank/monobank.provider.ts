import { TransactionProvider } from '../../core/provider/transaction-provider.interface';
import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { toNormalized } from '../../core/normalize/normalize';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { IMonobankClient, MonobankHttpError } from './monobank.client';
import {
  MonobankAccount,
  MonobankStatementItem,
} from './monobank.types';
import { resolveCurrency } from './currency';
import { generateWindows } from './window';

export interface MonobankProviderOptions {
  /** Backfill start (unix seconds). Full history => a date before the account. */
  sinceSec: number;
  /** Restrict to specific account ids; empty/undefined = all accounts. */
  accountIds?: string[];
  /** Seconds to wait between statement requests (rate limit ~1/60s). */
  rateLimitMs?: number;
  /** Max retries on HTTP 429. */
  maxRetries?: number;
  /** Injectable for tests. */
  wait?: (ms: number) => Promise<void>;
  now?: () => Date;
}

const defaultWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Monobank data source under the TransactionProvider contract. Does fetch +
 * field-mapping only; knows nothing about the DB, events, or matching.
 *
 * Respects the API limits: walks history in <=31-day windows and waits between
 * statement calls (1 req/60s), backing off on 429. Statement amounts are
 * already signed integer minor units (kopecks) -> straight BigInt (invariant
 * #1). Times are unix seconds -> absolute UTC instants (#2). `mcc` and raw
 * context go to metadata for the later matching layer.
 */
export class MonobankProvider implements TransactionProvider {
  readonly source = 'monobank';

  private readonly rateLimitMs: number;
  private readonly maxRetries: number;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly now: () => Date;

  constructor(
    private readonly client: IMonobankClient,
    private readonly opts: MonobankProviderOptions,
  ) {
    this.rateLimitMs = opts.rateLimitMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 5;
    this.wait = opts.wait ?? defaultWait;
    this.now = opts.now ?? (() => new Date());
  }

  async fetch(): Promise<NormalizedTransaction[]> {
    const info = await this.client.getClientInfo();
    const accounts = this.opts.accountIds?.length
      ? info.accounts.filter((a) => this.opts.accountIds!.includes(a.id))
      : info.accounts;

    const nowSec = Math.floor(this.now().getTime() / 1000);
    const out: NormalizedTransaction[] = [];
    const seen = new Set<string>();
    let firstCall = true;

    for (const account of accounts) {
      for (const w of generateWindows(this.opts.sinceSec, nowSec)) {
        if (!firstCall) await this.wait(this.rateLimitMs);
        firstCall = false;

        const items = await this.getStatementWithBackoff(
          account.id,
          w.from,
          w.to,
        );
        for (const item of items) {
          if (seen.has(item.id)) continue; // dedup across overlapping windows
          seen.add(item.id);
          out.push(this.map(item, account));
        }
      }
    }
    return out;
  }

  private async getStatementWithBackoff(
    accountId: string,
    from: number,
    to: number,
  ): Promise<MonobankStatementItem[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.getStatement(accountId, from, to);
      } catch (e) {
        const status = (e as MonobankHttpError).status;
        if (status === 429 && attempt < this.maxRetries) {
          await this.wait(this.rateLimitMs * (attempt + 1));
          continue;
        }
        throw e;
      }
    }
  }

  private map(
    item: MonobankStatementItem,
    account: MonobankAccount,
  ): NormalizedTransaction {
    const { code, decimals } = resolveCurrency(
      item.currencyCode ?? account.currencyCode,
    );
    return toNormalized({
      source: this.source,
      externalId: item.id,
      amount: BigInt(item.amount),
      currencyCode: code,
      decimals,
      type: TransactionType.TRANSFER,
      bookedAt: new Date(item.time * 1000),
      metadata: {
        accountId: account.id,
        mcc: item.mcc,
        originalMcc: item.originalMcc,
        description: item.description,
        comment: item.comment,
        hold: item.hold,
        commissionRate: item.commissionRate,
        cashbackAmount: item.cashbackAmount,
        balance: item.balance,
        operationAmount: item.operationAmount,
        counterName: item.counterName,
        counterIban: item.counterIban,
        counterEdrpou: item.counterEdrpou,
        receiptId: item.receiptId,
      },
    });
  }
}

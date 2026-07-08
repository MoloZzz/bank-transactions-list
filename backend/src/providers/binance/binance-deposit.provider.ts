import { readFileSync } from 'fs';
import { TransactionProvider } from '../../core/provider/transaction-provider.interface';
import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { toNormalized } from '../../core/normalize/normalize';
import { buildExternalId } from '../../core/normalize/external-id';
import { parseDecimalToMinor } from '../../core/normalize/money';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { parseCsvRecords } from './csv';
import { resolveAssetDecimals } from './asset';
import { trimTrailingZeroFraction } from './decimal';
import { parseBinanceUtcDate } from './time';

export interface BinanceDepositProviderOptions {
  /** Path to the exported "Deposit history" (on-chain) CSV. From env/CLI, never hardcoded. */
  filePath: string;
}

/**
 * Binance on-chain deposit history CSV -> crypto inflow rows.
 *
 * ASSUMPTIONS (documented in the Crypto CSV vault note): header
 * `Date(UTC),Coin,Amount,Network,Address,TXID,Status`, one row per completed
 * deposit, `Date(UTC)` already UTC ("YYYY-MM-DD HH:mm:ss").
 *
 * No fiat context here (on-chain deposit, not a trade) — per the vault note,
 * estimating cost basis via NBU rate-on-date is a later step (card<->crypto
 * matching, scenario 2). We only carry on-chain provenance (`txId`, `network`,
 * `address`) in `metadata`. No `account` descriptor: a CSV deposit isn't tied
 * to a "card" concept the way Monobank statements are.
 *
 * `externalId` hashes the on-chain TXID (kept unique per (coin, txId) in case
 * the same hash is reused as a memo/reference on some other network — cheap
 * extra safety, doesn't hurt determinism).
 */
export class BinanceDepositProvider implements TransactionProvider {
  readonly source = 'binance_deposit_csv';

  constructor(
    private readonly opts: BinanceDepositProviderOptions,
    private readonly readFile: (path: string) => string = (p) =>
      readFileSync(p, 'utf8'),
  ) {}

  fetch(sinceSec?: number): Promise<NormalizedTransaction[]> {
    try {
      const content = this.readFile(this.opts.filePath);
      const records = parseCsvRecords(content);
      const out: NormalizedTransaction[] = [];

      for (const rec of records) {
        const tx = this.map(rec);
        if (
          sinceSec !== undefined &&
          Math.floor(tx.bookedAt.getTime() / 1000) <= sinceSec
        ) {
          continue;
        }
        out.push(tx);
      }
      return Promise.resolve(out);
    } catch (e) {
      return Promise.reject(e as Error);
    }
  }

  private map(rec: Record<string, string>): NormalizedTransaction {
    const txId = rec['TXID'];
    if (!txId) {
      throw new Error('binance_deposit_csv row missing "TXID"');
    }

    const coin = rec['Coin'];
    const decimals = resolveAssetDecimals(coin);
    const amount = parseDecimalToMinor(
      trimTrailingZeroFraction(rec['Amount']),
      decimals,
    );

    const bookedAt = parseBinanceUtcDate(rec['Date(UTC)']);
    const externalId = buildExternalId(['binance_deposit_csv', coin, txId]);

    return toNormalized({
      source: this.source,
      externalId,
      amount, // deposits are always an inflow
      currencyCode: coin,
      decimals,
      type: TransactionType.DEPOSIT,
      bookedAt,
      metadata: {
        txId,
        network: rec['Network'],
        address: rec['Address'],
        status: rec['Status'],
      },
    });
  }
}

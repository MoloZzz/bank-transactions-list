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

/** Fiat rails behind Binance P2P (UAH, USD, EUR, ...) are conventionally 2dp. */
const FIAT_DECIMALS = 2;

export interface BinanceP2pProviderOptions {
  /** Path to the exported "P2P order history" CSV. Comes from env/CLI, never hardcoded. */
  filePath: string;
}

/**
 * Binance P2P order history CSV -> crypto leg of each completed order.
 *
 * ASSUMPTIONS (no upstream schema for this export; documented in the Crypto
 * CSV vault note): header `Order Number,Order Type,Asset Type,Fiat Type,
 * Total Price,Price,Quantity,Time(UTC),Counterparty,Status`, one row per
 * completed order, `Order Type` in {BUY, SELL} from the account owner's
 * perspective, `Time(UTC)` already UTC ("YYYY-MM-DD HH:mm:ss").
 *
 * Each row is ONE leg of asset movement (crypto only) — BUY = crypto inflow,
 * SELL = crypto outflow. The fiat side (amount + rate) has no ledger entry of
 * its own here; it travels in `metadata` (fiatAmountMinor/fiatCurrencyCode/
 * rate) so the future card<->crypto matcher (step 5) can use it without this
 * provider knowing anything about matching. `metadata.tradeRef` = the order
 * number, a forward-compatible hook for grouping multi-row trades later.
 *
 * `externalId` is a hash of the order number (not the bare order number)
 * to keep one uniform externalId scheme across every CSV-backed provider,
 * even when the source happens to hand us a native id.
 */
export class BinanceP2pProvider implements TransactionProvider {
  readonly source = 'binance_p2p_csv';

  constructor(
    private readonly opts: BinanceP2pProviderOptions,
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
    const orderNumber = rec['Order Number'];
    if (!orderNumber) {
      throw new Error('binance_p2p_csv row missing "Order Number"');
    }

    const rawSide = rec['Order Type']?.toUpperCase();
    if (rawSide !== 'BUY' && rawSide !== 'SELL') {
      throw new Error(
        `binance_p2p_csv row ${orderNumber}: unknown "Order Type" "${rec['Order Type']}"`,
      );
    }

    const asset = rec['Asset Type'];
    const decimals = resolveAssetDecimals(asset);
    const quantity = parseDecimalToMinor(
      trimTrailingZeroFraction(rec['Quantity']),
      decimals,
    );
    const signedAmount = rawSide === 'BUY' ? quantity : -quantity;

    const fiatAmountMinor = parseDecimalToMinor(
      trimTrailingZeroFraction(rec['Total Price']),
      FIAT_DECIMALS,
    ).toString();

    const bookedAt = parseBinanceUtcDate(rec['Time(UTC)']);
    const externalId = buildExternalId(['binance_p2p_csv', orderNumber]);

    return toNormalized({
      source: this.source,
      externalId,
      amount: signedAmount,
      currencyCode: asset,
      decimals,
      type: rawSide === 'BUY' ? TransactionType.BUY : TransactionType.SELL,
      bookedAt,
      metadata: {
        orderNumber,
        side: rawSide,
        fiatCurrencyCode: rec['Fiat Type'],
        // string, not number/BigInt: jsonb can't hold BigInt, and a string
        // keeps this float-free for a future matcher to BigInt() itself.
        fiatAmountMinor,
        fiatDecimals: FIAT_DECIMALS,
        rate: rec['Price'],
        counterparty: rec['Counterparty'] || undefined,
        status: rec['Status'],
        tradeRef: orderNumber,
      },
    });
  }
}

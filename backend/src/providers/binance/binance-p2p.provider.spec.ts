import { readFileSync } from 'fs';
import { join } from 'path';
import { BinanceP2pProvider } from './binance-p2p.provider';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { buildExternalId } from '../../core/normalize/external-id';

const FIXTURE = join(__dirname, '__fixtures__/p2p-orders.sample.csv');
const csv = readFileSync(FIXTURE, 'utf8');

function provider(content: string = csv) {
  return new BinanceP2pProvider({ filePath: FIXTURE }, () => content);
}

describe('BinanceP2pProvider', () => {
  it('maps a BUY order to a positive crypto inflow with fiat context in metadata', async () => {
    const out = await provider().fetch();
    const buy = out.find((t) => t.metadata?.side === 'BUY')!;

    expect(buy.source).toBe('binance_p2p_csv');
    expect(typeof buy.amount).toBe('bigint');
    expect(buy.amount).toBe(320_000000n); // 320 USDT, 6dp
    expect(buy.currencyCode).toBe('USDT');
    expect(buy.decimals).toBe(6);
    expect(buy.type).toBe(TransactionType.BUY);
    expect(buy.bookedAt.toISOString()).toBe('2026-06-01T10:15:32.000Z');
    expect(buy.metadata).toMatchObject({
      orderNumber: '20260601123456789',
      fiatCurrencyCode: 'UAH',
      fiatAmountMinor: '1338000', // 13380.00 UAH in kopecks
      fiatDecimals: 2,
      rate: '41.80',
      counterparty: 'merchant_ivan',
      status: 'Completed',
      tradeRef: '20260601123456789',
    });
  });

  it('maps a SELL order to a negative (outflow) crypto amount', async () => {
    const out = await provider().fetch();
    const sell = out.find((t) => t.metadata?.side === 'SELL')!;

    expect(sell.amount).toBe(-100_000000n);
    expect(sell.type).toBe(TransactionType.SELL);
    expect(sell.metadata).toMatchObject({
      fiatAmountMinor: '419000',
      tradeRef: '20260603234567890',
    });
  });

  it('derives a deterministic externalId hash from the order number', async () => {
    const out = await provider().fetch();
    expect(out[0].externalId).toBe(
      buildExternalId(['binance_p2p_csv', '20260601123456789']),
    );
    // stable across re-parses of the identical file (idempotent re-import)
    const again = await provider().fetch();
    expect(again[0].externalId).toBe(out[0].externalId);
    expect(again[1].externalId).toBe(out[1].externalId);
  });

  it('filters out rows at/before the watermark (sinceSec)', async () => {
    const out = await provider().fetch();
    const watermark = Math.floor(out[0].bookedAt.getTime() / 1000);
    const filtered = await provider().fetch(watermark);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].metadata?.orderNumber).toBe('20260603234567890');
  });

  it('returns everything when sinceSec is omitted (full backfill)', async () => {
    const out = await provider().fetch();
    expect(out).toHaveLength(2);
  });

  it('throws on an unknown Order Type', async () => {
    const bad =
      'Order Number,Order Type,Asset Type,Fiat Type,Total Price,Price,Quantity,Time(UTC),Counterparty,Status\n' +
      '1,HOLD,USDT,UAH,100.00,40.00,2.50000000,2026-06-01 10:00:00,x,Completed\n';
    await expect(provider(bad).fetch()).rejects.toThrow(/Order Type/);
  });

  it('trims zero-padded quantities that would otherwise exceed the asset scale', async () => {
    // Quantity printed at 8dp, USDT resolves to 6dp -> must not throw.
    const out = await provider().fetch();
    expect(out[0].amount).toBe(320_000000n);
  });
});

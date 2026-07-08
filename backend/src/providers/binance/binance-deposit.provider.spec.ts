import { readFileSync } from 'fs';
import { join } from 'path';
import { BinanceDepositProvider } from './binance-deposit.provider';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';
import { buildExternalId } from '../../core/normalize/external-id';

const FIXTURE = join(__dirname, '__fixtures__/deposit-history.sample.csv');
const csv = readFileSync(FIXTURE, 'utf8');

function provider(content: string = csv) {
  return new BinanceDepositProvider({ filePath: FIXTURE }, () => content);
}

describe('BinanceDepositProvider', () => {
  it('maps a deposit row to a positive inflow with on-chain metadata, no fiat', async () => {
    const out = await provider().fetch();
    const usdt = out.find((t) => t.currencyCode === 'USDT')!;

    expect(usdt.source).toBe('binance_deposit_csv');
    expect(typeof usdt.amount).toBe('bigint');
    expect(usdt.amount).toBe(150_500000n); // 150.5 USDT, 6dp
    expect(usdt.decimals).toBe(6);
    expect(usdt.type).toBe(TransactionType.DEPOSIT);
    expect(usdt.bookedAt.toISOString()).toBe('2026-06-02T08:05:11.000Z');
    expect(usdt.metadata).toMatchObject({
      network: 'TRX',
      status: 'Completed',
    });
    expect(usdt.metadata?.txId).toBeTruthy();
    expect(usdt.metadata?.fiatAmountMinor).toBeUndefined();
    expect(usdt.account).toBeUndefined();
  });

  it('uses the asset-specific scale (BTC = 8dp)', async () => {
    const out = await provider().fetch();
    const btc = out.find((t) => t.currencyCode === 'BTC')!;
    expect(btc.decimals).toBe(8);
    expect(btc.amount).toBe(1_234_500n); // 0.012345 BTC
  });

  it('derives a deterministic externalId hash from coin + TXID', async () => {
    const out = await provider().fetch();
    const usdt = out.find((t) => t.currencyCode === 'USDT')!;
    expect(usdt.externalId).toBe(
      buildExternalId([
        'binance_deposit_csv',
        'USDT',
        'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdef012345',
      ]),
    );
    const again = await provider().fetch();
    expect(again.find((t) => t.currencyCode === 'USDT')!.externalId).toBe(
      usdt.externalId,
    );
  });

  it('filters out rows at/before the watermark (sinceSec)', async () => {
    const out = await provider().fetch();
    const first = Math.floor(out[0].bookedAt.getTime() / 1000);
    const filtered = await provider().fetch(first);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].currencyCode).toBe('BTC');
  });

  it('throws when a row has no TXID', async () => {
    const bad =
      'Date(UTC),Coin,Amount,Network,Address,TXID,Status\n' +
      '2026-06-01 00:00:00,USDT,10.000000,TRX,addr,,Completed\n';
    await expect(provider(bad).fetch()).rejects.toThrow(/TXID/);
  });
});

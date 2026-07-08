import { readFileSync } from 'fs';
import { join } from 'path';
import { MonobankProvider } from './monobank.provider';
import { IMonobankClient } from './monobank.client';
import { MonobankClientInfo, MonobankStatementItem } from './monobank.types';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';

const sample: MonobankStatementItem[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/statement.sample.json'), 'utf8'),
);

const DAY = 86400;

function fakeClient(statementByCall: MonobankStatementItem[][]): {
  client: IMonobankClient;
  calls: Array<[number, number]>;
} {
  const calls: Array<[number, number]> = [];
  let i = 0;
  const client: IMonobankClient = {
    getClientInfo: async (): Promise<MonobankClientInfo> => ({
      clientId: 'c1',
      name: 'Test',
      accounts: [{ id: 'acc-1', currencyCode: 980 }],
    }),
    getStatement: async (_acc, from, to) => {
      calls.push([from, to]);
      return statementByCall[i++] ?? [];
    },
  };
  return { client, calls };
}

describe('MonobankProvider', () => {
  const now = () => new Date('2026-06-01T12:00:00.000Z');
  const nowSec = Math.floor(now().getTime() / 1000);

  it('maps statement items to NormalizedTransaction (kopecks -> BigInt, mcc -> metadata)', async () => {
    const { client } = fakeClient([sample]);
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 5 * DAY, // single window
      wait: async () => {},
      now,
    });

    const out = await provider.fetch();

    expect(out).toHaveLength(2);
    const [t0] = out;
    expect(t0.source).toBe('monobank');
    expect(t0.externalId).toBe('ZuHWzqkKGVo=');
    expect(typeof t0.amount).toBe('bigint');
    expect(t0.amount).toBe(-45000n);
    expect(t0.currencyCode).toBe('UAH');
    expect(t0.decimals).toBe(2);
    expect(t0.type).toBe(TransactionType.TRANSFER);
    expect(t0.bookedAt.toISOString()).toBe('2025-06-01T10:00:00.000Z');
    expect(t0.metadata).toMatchObject({ mcc: 5411, accountId: 'acc-1' });
    expect(t0.account).toMatchObject({
      externalId: 'acc-1',
      currencyCode: 'UAH',
    });
  });

  it('dedups the same item appearing in overlapping windows', async () => {
    const { client } = fakeClient([[sample[0]], [sample[0]]]);
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 45 * DAY, // 2 windows
      wait: async () => {},
      now,
    });

    const out = await provider.fetch();
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe('ZuHWzqkKGVo=');
  });

  it('waits between statement requests (respects rate limit)', async () => {
    const waits: number[] = [];
    const { client, calls } = fakeClient([[], []]);
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 45 * DAY, // 2 windows -> 1 inter-request wait
      rateLimitMs: 60_000,
      wait: async (ms) => {
        waits.push(ms);
      },
      now,
    });

    await provider.fetch();
    expect(calls.length).toBe(2);
    expect(waits).toEqual([60_000]);
  });

  it('retries on HTTP 429 then succeeds', async () => {
    let attempts = 0;
    const client: IMonobankClient = {
      getClientInfo: async () => ({
        clientId: 'c1',
        name: 'Test',
        accounts: [{ id: 'acc-1', currencyCode: 980 }],
      }),
      getStatement: async () => {
        if (attempts++ === 0) {
          const e: Error & { status?: number } = new Error('rate limited');
          e.status = 429;
          throw e;
        }
        return sample;
      },
    };
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 5 * DAY,
      wait: async () => {},
      now,
    });

    const out = await provider.fetch();
    expect(attempts).toBe(2);
    expect(out).toHaveLength(2);
  });

  it('labels amount with the ACCOUNT currency, not the operation currency', async () => {
    // UAH account; a cross-currency operation (operation currency = USD/840).
    const client: IMonobankClient = {
      getClientInfo: async () => ({
        clientId: 'c1',
        name: 'Test',
        accounts: [{ id: 'acc-uah', currencyCode: 980 }], // UAH account
      }),
      getStatement: async () => [
        {
          id: 'xrate-1',
          time: 1748772000,
          description: 'Переказ на картку',
          mcc: 4829,
          hold: false,
          amount: -78000, // -780.00 in ACCOUNT currency (UAH)
          operationAmount: -1732, // -17.32 in OPERATION currency (USD)
          currencyCode: 840, // operation currency = USD
        },
      ],
    };
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 5 * DAY,
      wait: async () => {},
      now,
    });

    const [t] = await provider.fetch();
    expect(t.currencyCode).toBe('UAH'); // account currency, NOT USD
    expect(t.amount).toBe(-78000n);
    expect(t.decimals).toBe(2);
    expect(t.metadata).toMatchObject({
      operationAmount: -1732,
      operationCurrencyCode: 840,
    });
  });

  it('respects an explicit sinceSec, overriding the configured floor', async () => {
    const { client, calls } = fakeClient([sample]);
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 200 * DAY, // wide floor (many windows)...
      wait: async () => {},
      now,
    });

    // ...but the watermark narrows it to a single recent window
    const out = await provider.fetch(nowSec - 5 * DAY);
    expect(calls.length).toBe(1);
    expect(out).toHaveLength(2);
  });

  it('stops walking back on HTTP 400 (start of available history)', async () => {
    let call = 0;
    const client: IMonobankClient = {
      getClientInfo: async () => ({
        clientId: 'c1',
        name: 'Test',
        accounts: [{ id: 'acc-1', currencyCode: 980 }],
      }),
      getStatement: async () => {
        // newest window (1st call) has data; older window (2nd call) is 400
        if (call++ === 0) return sample;
        const e: Error & { status?: number } = new Error('out of range');
        e.status = 400;
        throw e;
      },
    };
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 45 * DAY, // 2 windows
      wait: async () => {},
      now,
    });

    const out = await provider.fetch(); // must not throw
    expect(out).toHaveLength(2); // got the newest window, stopped at the 400
    expect(call).toBe(2);
  });
});

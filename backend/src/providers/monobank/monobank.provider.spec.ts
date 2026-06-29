import { readFileSync } from 'fs';
import { join } from 'path';
import { MonobankProvider } from './monobank.provider';
import { IMonobankClient } from './monobank.client';
import {
  MonobankClientInfo,
  MonobankStatementItem,
} from './monobank.types';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';

const sample: MonobankStatementItem[] = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/statement.sample.json'), 'utf8'),
);

const DAY = 86400;

function fakeClient(
  statementByWindow: MonobankStatementItem[][],
): { client: IMonobankClient; calls: Array<[number, number]> } {
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
      return statementByWindow[i++] ?? [];
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
  });

  it('dedups the same item appearing in overlapping windows', async () => {
    // two windows, both returning the first sample row -> one result
    const { client } = fakeClient([[sample[0]], [sample[0]]]);
    const provider = new MonobankProvider(client, {
      sinceSec: nowSec - 45 * DAY, // forces 2 windows (30-day step)
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
    expect(waits).toEqual([60_000]); // waited once, between the two calls
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
});

import { Logger } from '@nestjs/common';
import { MonobankClientInfo, MonobankStatementItem } from './monobank.types';

export interface MonobankHttpError extends Error {
  status?: number;
  body?: string;
}

/**
 * Thin HTTP wrapper over the Monobank personal API. Holds the token (from env)
 * and does I/O only — no rate-limiting, windowing, or mapping (those live in
 * the provider, which is what we unit-test with a fake client).
 */
export interface IMonobankClient {
  getClientInfo(): Promise<MonobankClientInfo>;
  getStatement(
    account: string,
    fromSec: number,
    toSec: number,
  ): Promise<MonobankStatementItem[]>;
}

export class MonobankClient implements IMonobankClient {
  logger = new Logger('MonobankClient');
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.monobank.ua',
  ) {
    if (!token) throw new Error('MONOBANK_TOKEN is required');
  }

  private async get<T>(path: string): Promise<T> {
    this.logger.log(`GET ${path}`);
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'X-Token': this.token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err: MonobankHttpError = new Error(
        `Monobank ${path} -> ${res.status}${body ? `: ${body}` : ''}`,
      );
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return (await res.json()) as T;
  }

  getClientInfo(): Promise<MonobankClientInfo> {
    return this.get<MonobankClientInfo>('/personal/client-info');
  }

  getStatement(
    account: string,
    fromSec: number,
    toSec: number,
  ): Promise<MonobankStatementItem[]> {
    return this.get<MonobankStatementItem[]>(
      `/personal/statement/${account}/${fromSec}/${toSec}`,
    );
  }
}

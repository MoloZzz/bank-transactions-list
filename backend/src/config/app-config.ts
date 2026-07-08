/**
 * Runtime configuration assembled from env (secrets never live in code).
 * Everything here is optional so the app boots and syncs to the DB even with
 * no credentials — live sources/sinks just stay disabled.
 */
export interface SheetsConfig {
  /** Inline service-account JSON or a path to the JSON file. */
  serviceAccount?: string;
  spreadsheetId?: string;
  tab: string;
}

export interface AppConfig {
  monobankToken?: string;
  /** Backfill start (unix seconds). Full history => before the account opened. */
  monoSinceSec: number;
  /** Path to an exported Binance P2P order history CSV, if configured. */
  binanceP2pCsvPath?: string;
  /** Path to an exported Binance (on-chain) deposit history CSV, if configured. */
  binanceDepositCsvPath?: string;
  sheets: SheetsConfig;
}

function parseSinceSec(env: NodeJS.ProcessEnv): number {
  const raw = env.MONO_SINCE ?? '2017-01-01'; // Monobank predates this
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw new Error(`invalid MONO_SINCE: "${raw}"`);
  return Math.floor(ms / 1000);
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    monobankToken: env.MONOBANK_TOKEN || undefined,
    monoSinceSec: parseSinceSec(env),
    binanceP2pCsvPath: env.BINANCE_P2P_CSV_PATH || undefined,
    binanceDepositCsvPath: env.BINANCE_DEPOSIT_CSV_PATH || undefined,
    sheets: {
      serviceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON || undefined,
      spreadsheetId: env.SHEETS_SPREADSHEET_ID || undefined,
      tab: env.SHEETS_TAB || 'Sheet1',
    },
  };
}

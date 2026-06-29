/** Raw shapes from the Monobank personal API (only the fields we use). */
export interface MonobankAccount {
  id: string;
  /** ISO 4217 numeric, e.g. 980 = UAH. */
  currencyCode: number;
  type?: string;
  maskedPan?: string[];
}

export interface MonobankClientInfo {
  clientId: string;
  name: string;
  accounts: MonobankAccount[];
}

export interface MonobankStatementItem {
  id: string;
  /** Unix seconds. */
  time: number;
  description?: string;
  mcc?: number;
  originalMcc?: number;
  hold?: boolean;
  /** Signed minor units in the ACCOUNT currency (already integer kopecks). */
  amount: number;
  /** Signed minor units in the operation's original currency. */
  operationAmount?: number;
  /** ISO 4217 numeric of the operation. */
  currencyCode?: number;
  commissionRate?: number;
  cashbackAmount?: number;
  balance?: number;
  comment?: string;
  receiptId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
}

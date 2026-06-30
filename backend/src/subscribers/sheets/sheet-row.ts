import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { formatMinor } from '../../core/normalize/money';
import { SheetRow } from './sheets-client.interface';

/** Header row for the export sheet (written once when the sheet is empty). */
export const SHEET_HEADERS: SheetRow = [
  'bookedAt (UTC)',
  'source',
  'account',
  'type',
  'amount',
  'currency',
  'externalId',
  'mcc',
  'description',
];

/**
 * Display/export projection of a transaction (invariant #1: human-readable
 * money formatting happens ONLY here, never in storage). Amount is rendered
 * from integer minor units via formatMinor; the time is the UTC ISO instant.
 * The account cell shows the card (maskedPan) when known, else the account id.
 */
export function transactionToSheetRow(tx: NormalizedTransaction): SheetRow {
  const md = tx.metadata ?? {};
  const account = tx.account?.maskedPan ?? tx.account?.externalId ?? '';
  return [
    tx.bookedAt.toISOString(),
    tx.source,
    account,
    tx.type,
    formatMinor(tx.amount, tx.decimals),
    tx.currencyCode,
    tx.externalId,
    md.mcc != null ? String(md.mcc) : '',
    md.description != null ? String(md.description) : '',
  ];
}

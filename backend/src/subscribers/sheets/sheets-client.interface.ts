/** A single spreadsheet row: ordered cell values. */
export type SheetRow = Array<string | number>;

/**
 * The only Sheets capability the subscriber needs: append a batch of rows.
 * The live implementation (googleapis) is wired in the app module; tests use a
 * fake. Keeping this narrow stops Google specifics from leaking into core.
 */
export interface SheetsClient {
  appendRows(rows: SheetRow[]): Promise<void>;
}

import { Logger } from '@nestjs/common';
import { SheetsClient, SheetRow } from './sheets-client.interface';

/**
 * No-op SheetsClient used when no Google credentials are configured. The sync
 * still runs and persists to the DB; the export is simply skipped (logged), so
 * the app is useful before Sheets is wired up.
 */
export class NullSheetsClient implements SheetsClient {
  private readonly logger = new Logger('NullSheetsClient');
  async appendRows(rows: SheetRow[]): Promise<void> {
    this.logger.log(
      `Sheets export disabled (no credentials); skipped ${rows.length} row(s)`,
    );
  }
}

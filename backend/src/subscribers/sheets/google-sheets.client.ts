import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';
import { SheetsClient, SheetRow } from './sheets-client.interface';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8');
  const json = JSON.parse(text) as ServiceAccount;
  if (!json.client_email || !json.private_key) {
    throw new Error('service account JSON missing client_email/private_key');
  }
  return json;
}

/**
 * Appends rows to a Google Sheet via the Sheets REST API, authenticating with a
 * service account (JWT). Thin on purpose — it only knows how to append, so no
 * Google specifics leak past the SheetsClient contract.
 */
export class GoogleSheetsClient implements SheetsClient {
  private readonly auth: JWT;

  constructor(
    serviceAccountRaw: string,
    private readonly spreadsheetId: string,
    private readonly tab: string,
  ) {
    const sa = loadServiceAccount(serviceAccountRaw);
    this.auth = new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: SCOPES,
    });
  }

  async appendRows(rows: SheetRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new Error('failed to obtain Google access token');

    const range = `${encodeURIComponent(this.tab)}!A1`;
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}` +
      `/values/${range}:append?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    });
    if (!res.ok) {
      throw new Error(`Sheets append -> ${res.status}: ${await res.text()}`);
    }
  }
}

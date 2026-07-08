/**
 * Minimal RFC4180-ish CSV parser (no dependency). Handles quoted fields
 * (commas/newlines/escaped quotes inside `"..."`), CRLF and LF line endings,
 * and a UTF-8 BOM (Binance exports are UTF-8, sometimes BOM-prefixed).
 *
 * Deliberately generic/side-code under this provider — if Bank CSV (step 7)
 * needs the same shape it can import this module or fork it; core stays
 * source-agnostic either way (invariant #3).
 */
export function parseCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    sawAny = true;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      pushField();
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      pushRow();
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  if (!sawAny) return [];

  // drop fully-blank trailing/embedded lines (e.g. trailing newline at EOF)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parse CSV text into header-keyed records; keys/values are trimmed. */
export function parseCsvRecords(content: string): Record<string, string>[] {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  const keys = header.map((h) => h.trim());
  return rest.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, idx) => {
      rec[k] = (r[idx] ?? '').trim();
    });
    return rec;
  });
}

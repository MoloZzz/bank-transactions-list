/**
 * Minimal ISO 4217 numeric -> { code (alpha-3), decimals } lookup for the
 * currencies a personal Ukrainian account realistically sees. Unknown codes
 * fall back to the numeric string with 2 decimals (the common minor-unit
 * scale), so an unexpected currency degrades gracefully rather than crashing.
 */
const TABLE: Record<number, { code: string; decimals: number }> = {
  980: { code: 'UAH', decimals: 2 },
  840: { code: 'USD', decimals: 2 },
  978: { code: 'EUR', decimals: 2 },
  826: { code: 'GBP', decimals: 2 },
  985: { code: 'PLN', decimals: 2 },
};

export function resolveCurrency(numeric: number): {
  code: string;
  decimals: number;
} {
  return TABLE[numeric] ?? { code: String(numeric), decimals: 2 };
}

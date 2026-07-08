import { parseBinanceUtcDate } from './time';

describe('parseBinanceUtcDate', () => {
  it('parses "YYYY-MM-DD HH:mm:ss" as an absolute UTC instant', () => {
    const d = parseBinanceUtcDate('2026-06-01 10:15:32');
    expect(d.toISOString()).toBe('2026-06-01T10:15:32.000Z');
  });

  it('trims surrounding whitespace', () => {
    const d = parseBinanceUtcDate('  2026-06-01 10:15:32  ');
    expect(d.toISOString()).toBe('2026-06-01T10:15:32.000Z');
  });

  it('throws on an invalid timestamp', () => {
    expect(() => parseBinanceUtcDate('not-a-date')).toThrow();
  });
});

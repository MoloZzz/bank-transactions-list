import { generateWindows } from './window';

describe('generateWindows', () => {
  const DAY = 86400;

  it('returns empty when now <= since', () => {
    expect(generateWindows(1000, 1000)).toEqual([]);
    expect(generateWindows(2000, 1000)).toEqual([]);
  });

  it('covers the range with contiguous, non-overlapping windows', () => {
    const since = 0;
    const now = 95 * DAY;
    const ws = generateWindows(since, now); // 30-day step
    expect(ws.length).toBe(4);
    expect(ws[0].from).toBe(since);
    expect(ws[ws.length - 1].to).toBe(now);
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i].from).toBe(ws[i - 1].to + 1); // no gaps, no overlap
    }
    for (const w of ws) {
      expect(w.to - w.from).toBeLessThanOrEqual(30 * DAY);
    }
  });

  it('makes a single window for a short range', () => {
    const ws = generateWindows(0, 5 * DAY);
    expect(ws).toEqual([{ from: 0, to: 5 * DAY }]);
  });
});

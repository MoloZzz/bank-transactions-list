import { generateWindows, MONO_MAX_WINDOW_SEC } from './window';

describe('generateWindows', () => {
  const DAY = 86400;

  it('returns empty when now <= since', () => {
    expect(generateWindows(1000, 1000)).toEqual([]);
    expect(generateWindows(2000, 1000)).toEqual([]);
  });

  it('covers the range with windows within the Monobank limit', () => {
    const now = 95 * DAY;
    const ws = generateWindows(0, now);
    expect(ws.length).toBe(4);
    expect(ws[0].from).toBe(0);
    expect(ws[ws.length - 1].to).toBe(now);
    for (const w of ws) {
      expect(w.to - w.from).toBeLessThanOrEqual(MONO_MAX_WINDOW_SEC);
    }
  });

  it('overlaps adjacent windows by the boundary second (no gaps)', () => {
    const ws = generateWindows(0, 95 * DAY);
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i].from).toBe(ws[i - 1].to);
    }
  });

  it('makes a single window for a short range', () => {
    expect(generateWindows(0, 5 * DAY)).toEqual([{ from: 0, to: 5 * DAY }]);
  });
});

export interface TimeWindow {
  /** Unix seconds, inclusive. */
  from: number;
  /** Unix seconds, inclusive. */
  to: number;
}

/**
 * Split [sinceSec, nowSec] into consecutive windows no longer than the
 * Monobank statement limit (31 days + 1 hour). We use 30 days for headroom.
 * Windows are contiguous and non-overlapping; the last one ends exactly at now.
 */
export function generateWindows(
  sinceSec: number,
  nowSec: number,
  stepSec: number = 30 * 24 * 60 * 60,
): TimeWindow[] {
  if (nowSec <= sinceSec) return [];
  const windows: TimeWindow[] = [];
  let from = sinceSec;
  while (from < nowSec) {
    const to = Math.min(from + stepSec, nowSec);
    windows.push({ from, to });
    from = to + 1;
  }
  return windows;
}

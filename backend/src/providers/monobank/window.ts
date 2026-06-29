export interface TimeWindow {
  /** Unix seconds, inclusive. */
  from: number;
  /** Unix seconds, inclusive. */
  to: number;
}

/** Monobank statement hard limit: 31 days + 1 hour. */
export const MONO_MAX_WINDOW_SEC = 2682000;

/**
 * Split [sinceSec, nowSec] into consecutive windows within the Monobank
 * statement limit. We step by 31 days (just under the limit) to minimise the
 * number of rate-limited requests for a full-history backfill.
 *
 * Windows overlap by exactly the boundary second (next.from === prev.to) so no
 * transaction can fall into a gap; duplicates from the overlap are removed by
 * dedup (provider id set + DB UNIQUE).
 */
export function generateWindows(
  sinceSec: number,
  nowSec: number,
  stepSec: number = 31 * 24 * 60 * 60,
): TimeWindow[] {
  if (nowSec <= sinceSec) return [];
  const windows: TimeWindow[] = [];
  let from = sinceSec;
  while (from < nowSec) {
    const to = Math.min(from + stepSec, nowSec);
    windows.push({ from, to });
    if (to === nowSec) break;
    from = to; // overlap by the boundary second, no gaps
  }
  return windows;
}

/**
 * Pure selection logic for card<->crypto matching (step 5, P2P BUY scope).
 * No DB access — takes plain data in, returns a decision. This is what makes
 * it trivially unit-testable; `MatchingService` does all the I/O around it.
 *
 * Rule (see [[Card↔Crypto Matching]] / Plan 07): a candidate card debit is
 * valid iff same currency, negative (outflow), booked in
 * `[leg.bookedAtSec - windowSec, leg.bookedAtSec]` (debit happens *before*,
 * i.e. up to `windowSec` earlier than, the crypto is received), and its
 * absolute amount is within `toleranceMinor` of the fiat cost. Among valid
 * candidates, prefer the smallest amount delta, then the smallest time delta.
 */

export interface MatchLeg {
  /** Crypto leg's booked time, unix seconds. */
  bookedAtSec: number;
  /** Fiat cost of the crypto purchase, minor units (positive). */
  fiatAmount: bigint;
  fiatCurrency: string;
}

export interface MatchCandidate {
  id: string;
  /** Candidate's booked time, unix seconds. */
  bookedAtSec: number;
  /** Signed minor units; must be negative (outflow) to be eligible. */
  amount: bigint;
  currencyCode: string;
}

export interface MatchSelectionOptions {
  /** How far before the crypto leg a card debit may have happened, seconds. */
  windowSec: number;
  /** Max allowed |abs(amount) - fiatAmount| in minor units. */
  toleranceMinor: bigint;
}

export interface MatchSelectionResult {
  candidateId: string;
  /** In [0, 1]. 1.0 = exact amount match; degrades with the amount delta. */
  confidence: number;
}

function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/**
 * Choose the best card-debit candidate funding `leg`, or null if none is
 * eligible. Deterministic, BigInt-only money math (invariant #1) — confidence
 * is the sole place a JS number is used, and it never drives a monetary
 * decision, only a quality score.
 */
export function chooseCardMatch(
  leg: MatchLeg,
  candidates: MatchCandidate[],
  opts: MatchSelectionOptions,
): MatchSelectionResult | null {
  const windowStart = leg.bookedAtSec - opts.windowSec;

  let best: MatchCandidate | null = null;
  let bestAmountDelta = 0n;
  let bestTimeDelta = 0;

  for (const c of candidates) {
    if (c.currencyCode !== leg.fiatCurrency) continue;
    if (c.amount >= 0n) continue;
    if (c.bookedAtSec < windowStart || c.bookedAtSec > leg.bookedAtSec) {
      continue;
    }

    const amountDelta = absBigInt(absBigInt(c.amount) - leg.fiatAmount);
    if (amountDelta > opts.toleranceMinor) continue;

    const timeDelta = Math.abs(leg.bookedAtSec - c.bookedAtSec);

    if (
      best === null ||
      amountDelta < bestAmountDelta ||
      (amountDelta === bestAmountDelta && timeDelta < bestTimeDelta)
    ) {
      best = c;
      bestAmountDelta = amountDelta;
      bestTimeDelta = timeDelta;
    }
  }

  if (best === null) return null;

  const confidence =
    leg.fiatAmount === 0n
      ? bestAmountDelta === 0n
        ? 1
        : 0
      : Math.max(0, 1 - Number(bestAmountDelta) / Number(leg.fiatAmount));

  return { candidateId: best.id, confidence };
}

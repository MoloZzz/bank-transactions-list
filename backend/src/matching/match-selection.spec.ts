import { chooseCardMatch, MatchCandidate, MatchLeg } from './match-selection';

const BASE_LEG: MatchLeg = {
  bookedAtSec: 1_700_010_000, // arbitrary anchor
  fiatAmount: 78_000n,
  fiatCurrency: 'UAH',
};

const OPTS = { windowSec: 7200, toleranceMinor: 0n };

function candidate(over: Partial<MatchCandidate>): MatchCandidate {
  return {
    id: 'c1',
    bookedAtSec: BASE_LEG.bookedAtSec - 1800,
    amount: -78_000n,
    currencyCode: 'UAH',
    ...over,
  };
}

describe('chooseCardMatch', () => {
  it('picks an exact amount+currency match within window with confidence 1', () => {
    const result = chooseCardMatch(BASE_LEG, [candidate({ id: 'a' })], OPTS);
    expect(result).toEqual({ candidateId: 'a', confidence: 1 });
  });

  it('rejects a candidate booked after the crypto leg (too late)', () => {
    const c = candidate({
      id: 'a',
      bookedAtSec: BASE_LEG.bookedAtSec + 1,
    });
    expect(chooseCardMatch(BASE_LEG, [c], OPTS)).toBeNull();
  });

  it('rejects a candidate booked before the window start (too early)', () => {
    const c = candidate({
      id: 'a',
      bookedAtSec: BASE_LEG.bookedAtSec - OPTS.windowSec - 1,
    });
    expect(chooseCardMatch(BASE_LEG, [c], OPTS)).toBeNull();
  });

  it('accepts a candidate exactly at the window boundaries', () => {
    const atStart = candidate({
      id: 'start',
      bookedAtSec: BASE_LEG.bookedAtSec - OPTS.windowSec,
    });
    expect(chooseCardMatch(BASE_LEG, [atStart], OPTS)?.candidateId).toBe(
      'start',
    );

    const atEnd = candidate({ id: 'end', bookedAtSec: BASE_LEG.bookedAtSec });
    expect(chooseCardMatch(BASE_LEG, [atEnd], OPTS)?.candidateId).toBe('end');
  });

  it('rejects when the amount difference exceeds tolerance', () => {
    const c = candidate({ id: 'a', amount: -78_001n });
    expect(chooseCardMatch(BASE_LEG, [c], OPTS)).toBeNull();
  });

  it('accepts when the amount difference is within a positive tolerance', () => {
    const c = candidate({ id: 'a', amount: -78_005n });
    const result = chooseCardMatch(BASE_LEG, [c], {
      ...OPTS,
      toleranceMinor: 10n,
    });
    expect(result?.candidateId).toBe('a');
    expect(result?.confidence).toBeLessThan(1);
    expect(result?.confidence).toBeGreaterThan(0.99);
  });

  it('rejects a candidate in a different currency', () => {
    const c = candidate({ id: 'a', currencyCode: 'USD' });
    expect(chooseCardMatch(BASE_LEG, [c], OPTS)).toBeNull();
  });

  it('rejects a positive-amount (inflow) candidate', () => {
    const c = candidate({ id: 'a', amount: 78_000n });
    expect(chooseCardMatch(BASE_LEG, [c], OPTS)).toBeNull();
  });

  it('returns null when there are no candidates', () => {
    expect(chooseCardMatch(BASE_LEG, [], OPTS)).toBeNull();
  });

  it('picks the closest amount among several candidates within tolerance', () => {
    const opts = { windowSec: 7200, toleranceMinor: 100n };
    const far = candidate({ id: 'far', amount: -77_920n }); // delta 80
    const close = candidate({ id: 'close', amount: -77_990n }); // delta 10
    const result = chooseCardMatch(BASE_LEG, [far, close], opts);
    expect(result?.candidateId).toBe('close');
  });

  it('breaks amount ties by picking the closest in time', () => {
    const opts = { windowSec: 7200, toleranceMinor: 100n };
    // both have the same amount delta (50)
    const earlier = candidate({
      id: 'earlier',
      amount: -78_050n,
      bookedAtSec: BASE_LEG.bookedAtSec - 7000,
    });
    const later = candidate({
      id: 'later',
      amount: -77_950n,
      bookedAtSec: BASE_LEG.bookedAtSec - 100,
    });
    const result = chooseCardMatch(BASE_LEG, [earlier, later], opts);
    expect(result?.candidateId).toBe('later');
  });

  it('excludes an already-used debit when the caller filters it out beforehand', () => {
    // The service is responsible for removing already-linked candidates from
    // the pool before calling chooseCardMatch (1-to-1 enforcement); here we
    // simulate that by simply not including it in `candidates`.
    const used = candidate({ id: 'used' });
    const fresh = candidate({ id: 'fresh', amount: -78_010n });
    const result = chooseCardMatch(
      BASE_LEG,
      [fresh], // 'used' filtered out by the caller
      { windowSec: 7200, toleranceMinor: 100n },
    );
    expect(result?.candidateId).toBe('fresh');
    expect(result?.candidateId).not.toBe(used.id);
  });

  it('is deterministic across candidate ordering', () => {
    const a = candidate({ id: 'a', amount: -77_990n });
    const b = candidate({ id: 'b', amount: -78_005n });
    const r1 = chooseCardMatch(BASE_LEG, [a, b], {
      windowSec: 7200,
      toleranceMinor: 100n,
    });
    const r2 = chooseCardMatch(BASE_LEG, [b, a], {
      windowSec: 7200,
      toleranceMinor: 100n,
    });
    expect(r1?.candidateId).toBe(r2?.candidateId);
  });
});

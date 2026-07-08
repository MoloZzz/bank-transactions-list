import { toNormalized } from './normalize';
import { NormalizedTransaction } from './normalized-transaction';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';

const valid: NormalizedTransaction = {
  source: 'monobank',
  externalId: 'ext-1',
  amount: -45000n,
  currencyCode: 'UAH',
  decimals: 2,
  type: TransactionType.TRANSFER,
  bookedAt: new Date('2026-06-01T10:00:00.000Z'),
};

describe('toNormalized (invariant gate)', () => {
  it('passes a valid transaction and defaults metadata to {}', () => {
    const out = toNormalized(valid);
    expect(out.amount).toBe(-45000n);
    expect(out.metadata).toEqual({});
  });

  it('rejects a non-BigInt amount (float guard)', () => {
    expect(() =>
      toNormalized({ ...valid, amount: 450 as unknown as bigint }),
    ).toThrow(/BigInt/);
  });

  it('rejects invalid decimals, dates, and empty required fields', () => {
    expect(() => toNormalized({ ...valid, decimals: 1.5 })).toThrow();
    expect(() =>
      toNormalized({ ...valid, bookedAt: new Date('nope') }),
    ).toThrow();
    expect(() => toNormalized({ ...valid, source: '  ' })).toThrow(/source/);
    expect(() => toNormalized({ ...valid, currencyCode: '' })).toThrow(
      /currencyCode/,
    );
  });

  it('preserves provided metadata', () => {
    const out = toNormalized({ ...valid, metadata: { mcc: 4829 } });
    expect(out.metadata).toEqual({ mcc: 4829 });
  });
});

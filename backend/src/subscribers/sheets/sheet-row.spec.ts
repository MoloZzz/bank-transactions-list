import { transactionToSheetRow, SHEET_HEADERS } from './sheet-row';
import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { TransactionType } from '../../modules/transactions/enums/transaction-type.enum';

const base: NormalizedTransaction = {
  source: 'monobank',
  externalId: 'ZuHWzqkKGVo=',
  amount: -45000n,
  currencyCode: 'UAH',
  decimals: 2,
  type: TransactionType.TRANSFER,
  bookedAt: new Date('2025-06-01T10:00:00.000Z'),
  metadata: { mcc: 5411, description: 'Сільпо' },
};

describe('transactionToSheetRow', () => {
  it('renders human amount from minor units (display layer only)', () => {
    const row = transactionToSheetRow(base);
    expect(row).toEqual([
      '2025-06-01T10:00:00.000Z',
      'monobank',
      'transfer',
      '-450.00',
      'UAH',
      'ZuHWzqkKGVo=',
      '5411',
      'Сільпо',
    ]);
  });

  it('renders high-precision crypto amounts losslessly', () => {
    const row = transactionToSheetRow({
      ...base,
      amount: 123456789n,
      currencyCode: 'BTC',
      decimals: 8,
      metadata: {},
    });
    expect(row[3]).toBe('1.23456789');
    expect(row[4]).toBe('BTC');
    expect(row[6]).toBe(''); // no mcc
  });

  it('has a matching header width', () => {
    expect(transactionToSheetRow(base).length).toBe(SHEET_HEADERS.length);
  });
});

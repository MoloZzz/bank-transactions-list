/**
 * Normalized transaction type. Source-agnostic — every provider maps its raw
 * type into this set. Fiat statements usually only need TRANSFER; crypto CSVs
 * use the full range. New types are added here, never branched on per-source
 * inside core (invariant #1).
 *
 * Sign convention: `amount` is signed minor units (negative = outflow,
 * positive = inflow). `type` carries semantic intent on top of the sign and is
 * what future categorization / FIFO PnL will key off.
 */
export enum TransactionType {
  TRANSFER = 'transfer',
  BUY = 'buy',
  SELL = 'sell',
  FEE = 'fee',
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
}

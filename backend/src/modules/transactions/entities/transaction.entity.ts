import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';
import { TransactionType } from '../enums/transaction-type.enum';

/**
 * Persisted, source-agnostic transaction. Personal (single-user) tracker — no
 * tenant column by design.
 *
 * Invariants enforced at the schema level:
 *  - #1 money: `amount` is numeric(38,0) integer minor units (BigInt in JS),
 *    never float; fiat (kopecks) and crypto (e.g. 8/18-dp minor units) share the
 *    type. `currencyCode` (asset) + `decimals` (scale) travel with it.
 *  - #2 dates: `bookedAt` / `createdAt` are timestamptz, always stored in UTC.
 *  - #4 dedup: UNIQUE(source, externalId) makes sync idempotent.
 *
 * `metadata` (jsonb) is the extension point: Monobank `mcc`, raw provider
 * fields, and crypto P2P context (rate, fiatCost) live here — the card↔crypto
 * matching layer (CryptoPurchase) reads from it later without the providers
 * knowing anything about matching.
 */
@Entity('transactions')
@Unique('uq_transactions_source_external', ['source', 'externalId'])
@Index('idx_transactions_booked_at', ['bookedAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Provider key, e.g. 'monobank', 'binance_p2p_csv', 'binance_deposit_csv'. */
  @Column('varchar', { length: 64 })
  source: string;

  /** Stable per-source id. CSV providers synthesize a deterministic row hash. */
  @Column('varchar', { length: 256 })
  externalId: string;

  /** Signed integer minor units. numeric(38,0) <-> BigInt. */
  @Column('numeric', {
    precision: 38,
    scale: 0,
    transformer: bigintTransformer,
  })
  amount: bigint;

  /** Fiat ISO code or crypto asset ticker (e.g. 'UAH', 'USD', 'USDT', 'BTC'). */
  @Column('varchar', { length: 16 })
  currencyCode: string;

  /** Minor-unit scale: UAH/USD=2, JPY=0, USDT=6/8, BTC=8, ETH=18. */
  @Column('smallint')
  decimals: number;

  @Column('varchar', { length: 16, default: TransactionType.TRANSFER })
  type: TransactionType;

  /** Transaction time, UTC. */
  @Column('timestamptz')
  bookedAt: Date;

  @Column('jsonb', { default: () => `'{}'::jsonb` })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

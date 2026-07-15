import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';
import { Transaction } from '../../transactions/entities/transaction.entity';

/**
 * Result row of the card<->crypto matching layer (step 5, [[Card↔Crypto
 * Matching]]). One row per crypto inflow leg (`cryptoTxId`, UNIQUE — at most
 * one CryptoPurchase per crypto transaction), optionally linked to the card
 * debit that funded it (`cardTxId`, nullable — no match found yet).
 *
 * This is a *derived* table computed by MatchingService, a separate
 * post-processing layer (invariant #5): providers/sync/normalize never write
 * here and know nothing about matching.
 *
 * Money fields follow invariant #1: integer minor units as BigInt via
 * `bigintTransformer`, `numeric(38,0)` in the DB, `decimals` (scale) stored
 * alongside. `rate` is a string (float-free) copied verbatim from the source
 * (CSV rate or, later, an NBU-estimate rate).
 *
 * `manualOverride`: once a user manually confirms/reassigns/breaks a match,
 * MatchingService's upsert-by-cryptoTxId must never clobber that row again.
 */
@Entity('crypto_purchases')
@Unique('uq_crypto_purchases_crypto_tx', ['cryptoTxId'])
export class CryptoPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The crypto inflow leg (P2P BUY today; deposit-estimate later). */
  @Column('uuid')
  cryptoTxId: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cryptoTxId' })
  cryptoTx?: Transaction;

  /** The card debit that funded this purchase, if matched. */
  @Index('idx_crypto_purchases_card_tx')
  @Column('uuid', { nullable: true })
  cardTxId: string | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cardTxId' })
  cardTx?: Transaction | null;

  /** Crypto asset ticker, e.g. 'USDT'. */
  @Column('varchar', { length: 16 })
  asset: string;

  /** Signed? No — always the received quantity, minor units. numeric(38,0) <-> BigInt. */
  @Column('numeric', {
    precision: 38,
    scale: 0,
    transformer: bigintTransformer,
  })
  cryptoAmount: bigint;

  @Column('smallint')
  cryptoDecimals: number;

  /** Fiat ISO code, e.g. 'UAH'. */
  @Column('varchar', { length: 16 })
  fiatCurrency: string;

  /** Fiat cost, minor units (kopecks). numeric(38,0) <-> BigInt. */
  @Column('numeric', {
    precision: 38,
    scale: 0,
    transformer: bigintTransformer,
  })
  fiatAmount: bigint;

  @Column('smallint')
  fiatDecimals: number;

  /** Exchange rate, kept as a string (float-free); copied verbatim from source. */
  @Column('varchar', { length: 64 })
  rate: string;

  /** Where the rate came from: 'CSV' (P2P, exact) or 'NBU' (estimate, step 6). */
  @Column('varchar', { length: 16 })
  rateSource: string;

  /** How this row was produced: 'p2p' (matched) or 'estimate' (step 6). */
  @Column('varchar', { length: 16 })
  matchType: string;

  /** Match quality in [0,1]; null when there's no candidate card debit. */
  @Column('real', { nullable: true })
  confidence: number | null;

  /** Once true, MatchingService must never overwrite this row's match fields. */
  @Column('boolean', { default: false })
  manualOverride: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

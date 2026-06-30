import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A source account/card a transaction belongs to. Source-agnostic: `source` +
 * `externalId` identify it (Monobank account id, a crypto exchange account
 * label, a bank-CSV account number). Display fields (`name`, `maskedPan`,
 * `currencyCode`, `type`) make it human-readable — "card ••1234 / UAH".
 *
 * Providers surface an account descriptor on each NormalizedTransaction; the
 * sync layer upserts here (enriching display fields over time) and links the
 * transaction via accountId.
 */
@Entity('accounts')
@Unique('uq_accounts_source_external', ['source', 'externalId'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 64 })
  source: string;

  /** Native account id within the source. */
  @Column('varchar', { length: 256 })
  externalId: string;

  @Column('varchar', { length: 128, nullable: true })
  name: string | null;

  @Column('varchar', { length: 64, nullable: true })
  maskedPan: string | null;

  @Column('varchar', { length: 16, nullable: true })
  currencyCode: string | null;

  @Column('varchar', { length: 32, nullable: true })
  type: string | null;

  @Column('jsonb', { default: () => `'{}'::jsonb` })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

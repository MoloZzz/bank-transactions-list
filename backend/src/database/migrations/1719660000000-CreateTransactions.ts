import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactions1719660000000 implements MigrationInterface {
  name = 'CreateTransactions1719660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() is in Postgres core since 13 (baseline 16) — no
    // pgcrypto/uuid-ossp extension required.
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id"           uuid          NOT NULL DEFAULT gen_random_uuid(),
        "source"       varchar(64)   NOT NULL,
        "externalId"   varchar(256)  NOT NULL,
        "amount"       numeric(38,0) NOT NULL,
        "currencyCode" varchar(16)   NOT NULL,
        "decimals"     smallint      NOT NULL,
        "type"         varchar(16)   NOT NULL DEFAULT 'transfer',
        "bookedAt"     timestamptz   NOT NULL,
        "metadata"     jsonb         NOT NULL DEFAULT '{}'::jsonb,
        "createdAt"    timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_transactions_source_external" UNIQUE ("source", "externalId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_booked_at" ON "transactions" ("bookedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_transactions_booked_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
  }
}

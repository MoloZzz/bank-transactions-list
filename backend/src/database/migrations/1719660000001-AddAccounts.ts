import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccounts1719660000001 implements MigrationInterface {
  name = 'AddAccounts1719660000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id"           uuid         NOT NULL DEFAULT gen_random_uuid(),
        "source"       varchar(64)  NOT NULL,
        "externalId"   varchar(256) NOT NULL,
        "name"         varchar(128),
        "maskedPan"    varchar(64),
        "currencyCode" varchar(16),
        "type"         varchar(32),
        "metadata"     jsonb        NOT NULL DEFAULT '{}'::jsonb,
        "createdAt"    timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "pk_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_accounts_source_external" UNIQUE ("source", "externalId")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "accountId" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_account"
        FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_transactions_account_booked_at"
        ON "transactions" ("accountId", "bookedAt")
    `);

    // Backfill from already-stored data: providers wrote the source account id
    // into metadata.accountId. Create accounts from the distinct values, then
    // link existing transactions. Display fields fill in on the next sync.
    await queryRunner.query(`
      INSERT INTO "accounts" ("source", "externalId")
      SELECT DISTINCT "source", "metadata"->>'accountId'
      FROM "transactions"
      WHERE "metadata"->>'accountId' IS NOT NULL
      ON CONFLICT ("source", "externalId") DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE "transactions" t
      SET "accountId" = a."id"
      FROM "accounts" a
      WHERE a."source" = t."source"
        AND a."externalId" = t."metadata"->>'accountId'
        AND t."accountId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_transactions_account_booked_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "fk_transactions_account"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "accountId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "accounts"`);
  }
}

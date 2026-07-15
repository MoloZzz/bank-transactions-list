import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCryptoPurchases1719660000002 implements MigrationInterface {
  name = 'AddCryptoPurchases1719660000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crypto_purchases" (
        "id"              uuid          NOT NULL DEFAULT gen_random_uuid(),
        "cryptoTxId"       uuid          NOT NULL,
        "cardTxId"         uuid,
        "asset"            varchar(16)   NOT NULL,
        "cryptoAmount"     numeric(38,0) NOT NULL,
        "cryptoDecimals"   smallint      NOT NULL,
        "fiatCurrency"     varchar(16)   NOT NULL,
        "fiatAmount"       numeric(38,0) NOT NULL,
        "fiatDecimals"     smallint      NOT NULL,
        "rate"             varchar(64)   NOT NULL,
        "rateSource"       varchar(16)   NOT NULL,
        "matchType"        varchar(16)   NOT NULL,
        "confidence"       real,
        "manualOverride"   boolean       NOT NULL DEFAULT false,
        "createdAt"        timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_crypto_purchases" PRIMARY KEY ("id"),
        CONSTRAINT "uq_crypto_purchases_crypto_tx" UNIQUE ("cryptoTxId"),
        CONSTRAINT "fk_crypto_purchases_crypto_tx"
          FOREIGN KEY ("cryptoTxId") REFERENCES "transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_crypto_purchases_card_tx"
          FOREIGN KEY ("cardTxId") REFERENCES "transactions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_crypto_purchases_card_tx"
        ON "crypto_purchases" ("cardTxId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_crypto_purchases_card_tx"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crypto_purchases"`);
  }
}

import { DataSourceOptions } from 'typeorm';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { Account } from '../modules/accounts/entities/account.entity';

/**
 * Single source of truth for DB connection options, used by BOTH the Nest
 * runtime (TypeOrmModule.forRootAsync) and the standalone CLI DataSource for
 * migrations. Connection is a single DATABASE_URL (invariant: secrets via env).
 *
 * `synchronize` is hard-false everywhere — schema changes go through migrations.
 */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    url:
      env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/transactions',
    entities: [Transaction, Account],
    migrations: [__dirname + '/../database/migrations/*.{ts,js}'],
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING === 'true',
  };
}

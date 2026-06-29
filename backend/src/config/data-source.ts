import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database.config';

/**
 * Standalone DataSource for the TypeORM CLI (migration:run / generate / revert).
 * Invoked via `typeorm-ts-node-commonjs -d src/config/data-source.ts`.
 */
export default new DataSource(buildDataSourceOptions());

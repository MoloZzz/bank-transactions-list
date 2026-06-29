import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '../config/database.config';

/**
 * Wires TypeORM into Nest using the same env-driven options as the CLI
 * DataSource. No `synchronize`; migrations are applied explicitly.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => buildDataSourceOptions(),
    }),
  ],
})
export class DatabaseModule {}

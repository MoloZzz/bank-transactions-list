import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { buildDataSourceOptions } from './config/database.config';
import { loadAppConfig } from './config/app-config';
import { Transaction } from './modules/transactions/entities/transaction.entity';
import { Account } from './modules/accounts/entities/account.entity';
import { CryptoPurchase } from './modules/crypto-purchases/entities/crypto-purchase.entity';
import { TransactionProvider } from './core/provider/transaction-provider.interface';
import { MonobankClient } from './providers/monobank/monobank.client';
import { MonobankProvider } from './providers/monobank/monobank.provider';
import { BinanceP2pProvider } from './providers/binance/binance-p2p.provider';
import { BinanceDepositProvider } from './providers/binance/binance-deposit.provider';
import { SheetsClient } from './subscribers/sheets/sheets-client.interface';
import { GoogleSheetsClient } from './subscribers/sheets/google-sheets.client';
import { NullSheetsClient } from './subscribers/sheets/null-sheets.client';
import { SheetsSubscriber } from './subscribers/sheets/sheets.subscriber';
import { SheetsEventListener } from './subscribers/sheets/sheets-event.listener';
import { SyncService } from './sync/sync.service';
import { MatchingService } from './matching/matching.service';

export const TRANSACTION_PROVIDERS = 'TRANSACTION_PROVIDERS';
export const SHEETS_CLIENT = 'SHEETS_CLIENT';

/**
 * Composition root. Wires the DB, the event bus, the (env-driven) providers and
 * the Sheets sink. Adding a new source = push another provider in the
 * TRANSACTION_PROVIDERS factory; nothing else changes (invariant #3).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() }),
    TypeOrmModule.forFeature([Transaction, Account, CryptoPurchase]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SheetsEventListener,
    {
      provide: TRANSACTION_PROVIDERS,
      useFactory: (): TransactionProvider[] => {
        const cfg = loadAppConfig();
        const providers: TransactionProvider[] = [];
        if (cfg.monobankToken) {
          providers.push(
            new MonobankProvider(new MonobankClient(cfg.monobankToken), {
              sinceSec: cfg.monoSinceSec,
            }),
          );
        }
        if (cfg.binanceP2pCsvPath) {
          providers.push(
            new BinanceP2pProvider({ filePath: cfg.binanceP2pCsvPath }),
          );
        }
        if (cfg.binanceDepositCsvPath) {
          providers.push(
            new BinanceDepositProvider({ filePath: cfg.binanceDepositCsvPath }),
          );
        }
        return providers;
      },
    },
    {
      provide: SHEETS_CLIENT,
      useFactory: (): SheetsClient => {
        const { sheets } = loadAppConfig();
        if (sheets.serviceAccount && sheets.spreadsheetId) {
          return new GoogleSheetsClient(
            sheets.serviceAccount,
            sheets.spreadsheetId,
            sheets.tab,
          );
        }
        return new NullSheetsClient();
      },
    },
    {
      provide: SheetsSubscriber,
      useFactory: (client: SheetsClient) => new SheetsSubscriber(client),
      inject: [SHEETS_CLIENT],
    },
    {
      provide: SyncService,
      useFactory: (
        dataSource: DataSource,
        providers: TransactionProvider[],
        emitter: EventEmitter2,
      ) => new SyncService(dataSource, providers, emitter),
      inject: [DataSource, TRANSACTION_PROVIDERS, EventEmitter2],
    },
    {
      provide: MatchingService,
      useFactory: (dataSource: DataSource) => {
        const cfg = loadAppConfig();
        return new MatchingService(dataSource, {
          windowSec: cfg.matchWindowSec,
          toleranceMinor: cfg.matchToleranceMinor,
        });
      },
      inject: [DataSource],
    },
  ],
})
export class AppModule {}

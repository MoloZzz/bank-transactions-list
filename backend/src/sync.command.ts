import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SyncService } from './sync/sync.service';
import { SheetsSubscriber } from './subscribers/sheets/sheets.subscriber';

/**
 * Entrypoint: `npm run sync`. Boots a headless Nest context, runs one sync pass
 * (full-history windowed fetch from each configured provider), then flushes the
 * buffered Sheets export. Idempotent — safe to re-run.
 */
async function main(): Promise<void> {
  const logger = new Logger('sync');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(SyncService).sync();
    //const exported = await app.get(SheetsSubscriber).flush();

    logger.log(
      `done: received=${result.totalReceived} created=${result.totalCreated}`,
    );
    for (const [src, r] of Object.entries(result.bySource)) {
      logger.log(`  ${src}: received=${r.received} created=${r.created}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  // Set exit code rather than process.exit() so pending handles (the pg pool,
  // already closed via app.close) drain cleanly — process.exit() mid-close
  // triggers a libuv assertion on Windows.
  process.exitCode = 1;
});

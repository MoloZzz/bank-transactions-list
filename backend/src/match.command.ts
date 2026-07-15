import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MatchingService } from './matching/matching.service';

/**
 * Entrypoint: `npm run match`. Boots a headless Nest context and runs one
 * card<->crypto matching pass (step 5, P2P BUY scope) — a post-processing
 * step, separate from `sync`, run after both sides (Monobank + Binance P2P
 * CSV) are loaded. Idempotent — safe to re-run; never overwrites a
 * manually-overridden CryptoPurchase.
 */
async function main(): Promise<void> {
  const logger = new Logger('match');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(MatchingService).run();
    logger.log(
      `done: processed=${result.processed} matched=${result.matched} unmatched=${result.unmatched}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  // Set exit code rather than process.exit() so pending handles (the pg pool,
  // already closed via app.close) drain cleanly — process.exit() mid-close
  // triggers a libuv assertion on Windows.
  process.exitCode = 1;
});

import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { CryptoPurchase } from '../modules/crypto-purchases/entities/crypto-purchase.entity';
import { chooseCardMatch, MatchCandidate, MatchLeg } from './match-selection';

const CRYPTO_SOURCE = 'binance_p2p_csv';
const CRYPTO_BUY_TYPE = 'buy';
const CARD_SOURCE = 'monobank';

export interface MatchingOptions {
  /** How far before the crypto leg a card debit may have happened, seconds. */
  windowSec: number;
  /** Max allowed |abs(cardAmount) - fiatAmount| in minor units. */
  toleranceMinor: bigint;
}

export interface MatchingResult {
  processed: number;
  matched: number;
  unmatched: number;
}

/** Shape of the fields BinanceP2pProvider writes into transactions.metadata for BUY rows. */
interface P2pLegMetadata {
  fiatAmountMinor?: string;
  fiatCurrencyCode?: string;
  fiatDecimals?: number;
  rate?: string;
}

/**
 * Card<->crypto matching, step 5 (P2P BUY scope only). A separate
 * post-processing layer (invariant #5): reads `transactions` written by the
 * Monobank and Binance P2P providers, but never touches them, and providers
 * know nothing about this. `chooseCardMatch` (match-selection.ts) is the pure
 * decision function this service feeds with candidates and persists the
 * result of.
 *
 * Idempotent (invariant #4-adjacent for this layer): upserts `CryptoPurchase`
 * by the UNIQUE `cryptoTxId`, and the upsert's WHERE clause skips any row the
 * user has flagged `manualOverride = true` — a re-run never clobbers a manual
 * decision. 1-to-1: a card debit already linked to some CryptoPurchase (from
 * a previous run, or matched earlier within this same run) is removed from
 * the candidate pool.
 */
export class MatchingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly opts: MatchingOptions,
  ) {}

  async run(): Promise<MatchingResult> {
    const txRepo = this.dataSource.getRepository(Transaction);
    const purchaseRepo = this.dataSource.getRepository(CryptoPurchase);

    const result: MatchingResult = { processed: 0, matched: 0, unmatched: 0 };

    const legs = await txRepo.find({
      where: {
        source: CRYPTO_SOURCE,
        type: CRYPTO_BUY_TYPE as Transaction['type'],
      },
      order: { bookedAt: 'ASC' },
    });
    if (legs.length === 0) return result;

    const existingPurchases = await purchaseRepo.find();
    const existingByCryptoTx = new Map(
      existingPurchases.map((p) => [p.cryptoTxId, p]),
    );
    const legIds = new Set(legs.map((l) => l.id));
    // A card debit already linked from a *previous* run counts as used and is
    // removed from the pool (1-to-1). But if the link belongs to a leg we are
    // about to recompute in *this* run (and it isn't manualOverride-locked),
    // release it back into the pool first — otherwise re-running would see
    // its own prior pick as "taken" and never re-select it, breaking
    // idempotency.
    const usedCardTxIds = new Set(
      existingPurchases
        .filter(
          (p): p is CryptoPurchase & { cardTxId: string } =>
            !!p.cardTxId && (p.manualOverride || !legIds.has(p.cryptoTxId)),
        )
        .map((p) => p.cardTxId),
    );

    const cardDebits = await txRepo
      .createQueryBuilder('t')
      .where('t.source = :source', { source: CARD_SOURCE })
      .andWhere('t.amount < 0')
      .getMany();

    const candidatesByCurrency = new Map<string, MatchCandidate[]>();
    for (const d of cardDebits) {
      if (usedCardTxIds.has(d.id)) continue;
      const list = candidatesByCurrency.get(d.currencyCode) ?? [];
      list.push({
        id: d.id,
        bookedAtSec: Math.floor(d.bookedAt.getTime() / 1000),
        amount: d.amount,
        currencyCode: d.currencyCode,
      });
      candidatesByCurrency.set(d.currencyCode, list);
    }

    for (const leg of legs) {
      result.processed++;

      const prior = existingByCryptoTx.get(leg.id);
      if (prior?.manualOverride) {
        if (prior.cardTxId) result.matched++;
        else result.unmatched++;
        continue;
      }

      const metadata = (leg.metadata ?? {}) as P2pLegMetadata;
      if (
        metadata.fiatAmountMinor === undefined ||
        metadata.fiatCurrencyCode === undefined ||
        metadata.fiatDecimals === undefined ||
        metadata.rate === undefined
      ) {
        // Malformed/unexpected leg metadata — nothing sane to persist.
        result.unmatched++;
        continue;
      }

      const fiatAmount = BigInt(metadata.fiatAmountMinor);
      const matchLeg: MatchLeg = {
        bookedAtSec: Math.floor(leg.bookedAt.getTime() / 1000),
        fiatAmount,
        fiatCurrency: metadata.fiatCurrencyCode,
      };

      const candidates =
        candidatesByCurrency.get(metadata.fiatCurrencyCode) ?? [];
      const chosen = chooseCardMatch(matchLeg, candidates, this.opts);

      if (chosen) {
        usedCardTxIds.add(chosen.candidateId);
        const list = candidatesByCurrency.get(metadata.fiatCurrencyCode);
        if (list) {
          const idx = list.findIndex((c) => c.id === chosen.candidateId);
          if (idx >= 0) list.splice(idx, 1);
        }
      }

      const values: QueryDeepPartialEntity<CryptoPurchase> = {
        cryptoTxId: leg.id,
        cardTxId: chosen?.candidateId ?? null,
        asset: leg.currencyCode,
        cryptoAmount: leg.amount,
        cryptoDecimals: leg.decimals,
        fiatCurrency: metadata.fiatCurrencyCode,
        fiatAmount,
        fiatDecimals: metadata.fiatDecimals,
        rate: metadata.rate,
        rateSource: 'CSV',
        matchType: 'p2p',
        confidence: chosen?.confidence ?? null,
      };

      await purchaseRepo
        .createQueryBuilder()
        .insert()
        .into(CryptoPurchase)
        .values(values)
        .orUpdate(
          [
            'cardTxId',
            'asset',
            'cryptoAmount',
            'cryptoDecimals',
            'fiatCurrency',
            'fiatAmount',
            'fiatDecimals',
            'rate',
            'rateSource',
            'matchType',
            'confidence',
          ],
          ['cryptoTxId'],
          {
            overwriteCondition: {
              where: '"crypto_purchases"."manualOverride" = false',
            },
          },
        )
        .execute();

      if (chosen) result.matched++;
      else result.unmatched++;
    }

    return result;
  }
}

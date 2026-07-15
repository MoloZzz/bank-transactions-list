# Providers

Єдиний контракт, який знає ядро. Нове джерело = нова реалізація, ядро не чіпається
(→ [[Invariants]] #3).

## Контракт
```ts
interface TransactionProvider {
  readonly source: string;                 // 'monobank', 'binance_p2p_csv', ...
  fetch(sinceSec?: number): Promise<NormalizedTransaction[]>;
}
```
- `source` — стабільний ключ джерела.
- `fetch(sinceSec?)` — тягне + мапить сирі поля у `NormalizedTransaction`. `sinceSec` —
  watermark від синку (інкрементально); без нього — власний floor (повний бекфіл).
- **Тільки** fetch + мапінг. Нуль бізнес-логіки, нуль сайд-ефектів, нуль знання про метчинг.

## NormalizedTransaction (канонічна форма)
`source`, `externalId`, `amount: bigint`, `currencyCode`, `decimals`, `type`,
`bookedAt: Date (UTC)`, `account?: NormalizedAccount`, `metadata?`.
Валідується `toNormalized()` (BigInt/scale/UTC/непорожні поля) — спільний гейт перед БД.

## Спільні хелпери (`src/core/normalize`)
- `buildExternalId(parts)` — sha256 стабільних полів для CSV без власного id.
- `parseDecimalToMinor` / `formatMinor` — float-free конвертація рядок↔BigInt.
- `toNormalized` — гейт інваріантів.

## Реалізації
- **[[Monobank]]** — API, вікна, rate-limit, крос-валюта.
- **[[Crypto CSV]]** — Binance P2P + deposit (`binance_p2p_csv` / `binance_deposit_csv`,
  два CSV-провайдери + спільні хелпери).
- **[[Bank CSV]]** — Privat/generic (пізніше, крок 7).

## Реєстрація
У `app.module.ts` фабрика `TRANSACTION_PROVIDERS` збирає масив із env. Додати джерело =
**+1 рядок** у фабриці; решта не змінюється.

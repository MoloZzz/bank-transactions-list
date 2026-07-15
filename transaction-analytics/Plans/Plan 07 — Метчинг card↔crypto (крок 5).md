# Plan 07 — Метчинг card↔crypto (крок 5)

Окремий шар post-processing: звʼязати гривневий картковий дебет із P2P-крипто-припливом.
Провайдери про метчинг не знають ([[Invariants]] #5). → [[Card↔Crypto Matching]]

## Обсяг кроку 5 (тільки P2P BUY)
- Кандидати — крипто-ноги `source='binance_p2p_csv'`, `type='buy'` (приплив). SELL і
  deposit-estimate (курс НБУ) — поза кроком 5 (deposit = крок 6).
- Фіат-вартість уже відома з CSV (у `metadata`: `fiatAmountMinor`, `fiatCurrencyCode`,
  `fiatDecimals`, `rate`). Метч шукає **картковий дебет, що це профінансував**.

## Правило метчу (P2P)
Кандидат-дебет: `source='monobank'`, `amount < 0`, `currencyCode = fiatCurrencyCode`,
`bookedAt ∈ [cryptoTime − window, cryptoTime]` (дебет **до** отримання крипти),
`|abs(cardAmount) − fiatAmount| ≤ tolerance`, і **ще не використаний** іншою покупкою.
Найкращий = мін |Δсума|, далі мін |Δчас|. 1-до-1. Курс — з CSV, нічого не рахуємо.
- `window` = `MATCH_WINDOW_SEC` (деф. 7200 = 2 год), `tolerance` = `MATCH_TOLERANCE_MINOR`
  (деф. 0 = точний збіг). Обидва з env.

## Сутність `CryptoPurchase` (нова)
`id` uuid PK; `cryptoTxId` uuid FK→transactions ON DELETE CASCADE **UNIQUE** (1 покупка на
ногу); `cardTxId` uuid? FK→transactions ON DELETE SET NULL; `asset`; `cryptoAmount`
numeric(38,0)↔BigInt + `cryptoDecimals`; `fiatCurrency`; `fiatAmount` numeric(38,0)↔BigInt +
`fiatDecimals`; `rate` varchar (string, float-free); `rateSource` ('CSV'|'NBU');
`matchType` ('p2p'|'estimate'); `confidence` real?; `manualOverride` bool=false;
`createdAt`/`updatedAt`. Гроші — [[Invariants]] #1. → [[Data Model]]

## Компоненти
- `src/modules/crypto-purchases/entities/crypto-purchase.entity.ts`
- Міграція `*-AddCryptoPurchases` (таблиця, FK, UNIQUE(cryptoTxId), індекси).
- `src/matching/match-selection.ts` — **чиста** функція `chooseCardMatch(leg, candidates, opts)`
  (без БД, легко unit-тестувати).
- `src/matching/matching.service.ts` — I/O навколо: вибірка ніг+кандидатів, апсерт
  `CryptoPurchase` по `cryptoTxId`, не чіпати `manualOverride=true`, 1-до-1 по картці.
- `src/match.command.ts` + `npm run match` (post-processing, окремо від sync).
- Реєстрація Entity у `config/database.config.ts` + `forFeature`; `MatchingService` в
  `app.module.ts`; `MATCH_*` у `app-config.ts` + `.env.example`.

## Ідемпотентність
Апсерт по `cryptoTxId`; повторний прогін не дублює й не клобить `manualOverride`.

## Критерії приймання
- [ ] `chooseCardMatch` unit: точний збіг; поза вікном; розбіжність суми > tolerance;
  вибір найближчого; нема кандидата; вже-використаний дебет виключено.
- [ ] Інтеграційний: monobank UAH-дебет + P2P BUY (fiat=дебет, час у вікні) → один
  `CryptoPurchase` з `cardTxId`, `rateSource='CSV'`, `matchType='p2p'`, `confidence` високий.
- [ ] Інтеграційний: P2P BUY без відповідного дебету → `CryptoPurchase` з `cardTxId=null`.
- [ ] Інтеграційний: повторний `run()` ідемпотентний; `manualOverride=true` не перезаписано.
- [ ] `tsc` чистий, `npm test` зелений, `npm run test:int` зелений.
- [ ] Vault оновлено (DoD): [[Data Model]] (нова сутність), [[Decision Log]] (рішення),
  [[Roadmap & Status]] (статус/тести).
- [ ] Жоден [[Invariants|інваріант]] не порушено (метчинг — окремий шар; провайдери не чіпані).

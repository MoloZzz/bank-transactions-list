# Roadmap & Status

Порядок імплементації — «цінність раніше». → [[Vision & Goals]]

## Кроки
- [x] **1. БД + entity Transaction + міграція** — `numeric(38,0)`, `UNIQUE(source,externalId)`,
  UTC, jsonb. → [[Data Model]]
- [x] **2. normalize layer + NormalizedTransaction** — контракт провайдера, хелпери
  (`buildExternalId`, `money`, `toNormalized`). → [[Providers]]
- [x] **3. Monobank provider + sync → БД і Google Sheet** (перший результат) — віконна
  пагінація, подія `transaction.created`, Sheets subscriber. → [[Monobank]], [[Sync Engine]],
  [[Events & Export]]
- [x] **4. Crypto CSV provider** (P2P + deposit формати) → крипта в БД. → [[Crypto CSV]]
- [x] **5. Метчинг card↔crypto + CryptoPurchase** (P2P BUY, `npm run match`) →
  [[Card↔Crypto Matching]]
- [ ] **6. Estimate для unmatched (курс НБУ)** ← **наступне** → [[Card↔Crypto Matching]]
- [ ] **7. Bank CSV** (Privat, generic) → [[Bank CSV]]

## Додатково зроблено (поза початковим списком)
- [x] Інкрементальний синк від **watermark** (щоденний прогін тягне лише нове). → [[Sync Engine]]
- [x] **Accounts** — таблиця рахунків/карток + FK `accountId` + бекфіл existing. → [[Data Model]]
- [x] Єдиний `DATABASE_URL`.
- [x] Фікс крос-валютних сум (валюта = валюта рахунку). → [[Monobank]], [[Decision Log]]

## Definition of Done (кожен крок)
Код працює + покритий тестом (unit на normalize/метч, інтеграційний на provider+sync) +
не порушено жоден [[Invariants|інваріант]] + можна запустити ізольовано й побачити результат.

## Поточні тести
Unit **75** (з них ~30 на Binance CSV: parser/scale/hash/tradeRef/обидва формати; **13**
нові на `chooseCardMatch` — вікно/сума/tie-break/детермінізм), інтеграційні **21** (проти
реального Postgres, включно з Crypto CSV import і **5** новими на `MatchingService`:
матч/no-match/поза вікном/ідемпотентність+manualOverride/1-до-1). Прогнано — усі зелені;
`tsc` чистий. Локально: `npm run db:up && npm run test:int`.

## Відомі нюанси
- Перший Monobank-бекфіл довгий (1 запит/60с) — це ліміт API, не баг. Обмежити: `MONO_SINCE`.
- Синк — знімок на час старту; свіже підбере наступний прогін. → [[Sync Engine]]
- Existing рядки до фіксу валюти чиняться SQL-пропагацією з `accounts`. → [[Decision Log]]
- Crypto CSV інтеграційний тест **прогнано проти реального Postgres — зелений** (входить у
  21/21 int). Раніше в sandbox без Docker не був прогнаний; тепер підтверджено. → [[Crypto CSV]]
- `npm run lint` має ~23 передіснуючі помилки в файлах, яких цей крок не торкався
  (`monobank.provider.spec.ts`, `sheet-row.ts`, `null-sheets.client.ts`,
  `sync.command.ts`, `sync/sync.service.int-spec.ts`, `database/*.int-spec.ts`,
  `main.ts`) — технічний борг з попередніх кроків, не зі Crypto CSV. Увесь новий/змінений
  код (`providers/binance/**`, `app.module.ts`, `config/app-config.ts`) — лінтується
  чисто.
- **Крок 5 (метчинг) — скоуп лише P2P BUY.** SELL і deposit-estimate (курс НБУ) — поза
  скоупом, це крок 6. `MatchingService` читає лише `binance_p2p_csv`/`buy` та
  `monobank`-дебети (`amount < 0`); нові джерела карток/крипти під ці правила не
  підпадають автоматично — це буде явним рішенням кроку 6/7, не побічним ефектом.
  → [[Card↔Crypto Matching]]

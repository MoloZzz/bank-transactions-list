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
- [ ] **5. Метчинг card↔crypto + CryptoPurchase** ← **наступне** → [[Card↔Crypto Matching]]
- [ ] **6. Estimate для unmatched (курс НБУ)** → [[Card↔Crypto Matching]]
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
Unit ~62 (з них ~30 нових на Binance CSV: parser/scale/hash/tradeRef/обидва формати),
інтеграційні ~13 + 3 нових (Crypto CSV import → Postgres, не прогнані локально — нема
Docker у sandbox, де писався код; мають прогнатись у звичайному dev-оточенні через
`npm run db:up && npm run test:int`), `tsc` чистий, `nest build` чистий.

## Відомі нюанси
- Перший Monobank-бекфіл довгий (1 запит/60с) — це ліміт API, не баг. Обмежити: `MONO_SINCE`.
- Синк — знімок на час старту; свіже підбере наступний прогін. → [[Sync Engine]]
- Existing рядки до фіксу валюти чиняться SQL-пропагацією з `accounts`. → [[Decision Log]]
- **Crypto CSV int-тест не прогнаний проти реального Postgres** у середовищі, де писався
  код (немає Docker у sandbox) — лише `tsc`/unit/`lint`/`build` перевірені локально.
  Потрібно прогнати `npm run test:int` у звичайному dev-оточенні перед тим, як вважати
  крок 4 остаточно підтвердженим. → [[Crypto CSV]]
- `npm run lint` має ~23 передіснуючі помилки в файлах, яких цей крок не торкався
  (`monobank.provider.spec.ts`, `sheet-row.ts`, `null-sheets.client.ts`,
  `sync.command.ts`, `sync/sync.service.int-spec.ts`, `database/*.int-spec.ts`,
  `main.ts`) — технічний борг з попередніх кроків, не зі Crypto CSV. Увесь новий/змінений
  код (`providers/binance/**`, `app.module.ts`, `config/app-config.ts`) — лінтується
  чисто.

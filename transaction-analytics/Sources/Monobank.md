# Monobank

Personal API, джерело `monobank`. Реалізовано: `src/providers/monobank/*`. ✅

## API
- База `https://api.monobank.ua`, заголовок `X-Token: <token>` (з `.env`, → [[Invariants]] #7).
- `GET /personal/client-info` → рахунки (`id`, `currencyCode` ISO-numeric, `maskedPan[]`, `type`).
- `GET /personal/statement/{account}/{from}/{to}` → масив операцій; час у unix-секундах.

## Ліміти (поважати обов'язково)
- **1 запит / 60 секунд** на `/statement` (інакше 429 → backoff).
- Вікно виписки **≤ 31 доба + 1 година = 2682000 с**; перевищення → **400**.

## Як тягнемо (windowing)
- Ділимо `[since, now]` на вікна по 31 день (з overlap на граничну секунду — без дір;
  дублі знімає дедуп).
- Ідемо **newest-first** (від тепер у минуле) і **зупиняємось на `400`** — Monobank
  відповідає 400 (не порожнім списком) на діапазони **до існування рахунку**, тож 400 =
  межа доступної історії. Так «вся історія» збирається без падіння й без знання дати
  відкриття рахунку.
- Між запитами `wait(60с)`; на 429 — експоненційний backoff. `wait`/`now` інжектуються
  (тести миттєві, без мережі).

## Гроші й валюта (важливий підводний камінь)
- `item.amount` — **у валюті РАХУНКУ**, у копійках (ціле). Кладемо прямо в `BigInt`.
- `item.currencyCode` — це валюта **ОПЕРАЦІЇ**, НЕ рахунку. Тому суму маркуємо валютою
  рахунку (`account.currencyCode` із client-info), інакше крос-валютні операції
  отримують хибний ярлик (напр. −780 UAH переказ показувався як «USD»).
- `operationAmount` + `operationCurrencyCode` (валюта операції) → у `metadata` (знадобиться
  для [[Card↔Crypto Matching]]).
- Приклад: переказ −780.00 UAH з гривневої картки → +17.32 USD; `amount=-78000` (UAH),
  `operationAmount=-1732` (USD), співвідношення ≈ курс 45 UAH/USD.

## Мапінг → NormalizedTransaction
- `externalId` = `item.id` (стабільний, без хешу).
- `type` = `transfer` (плоский enum).
- `bookedAt` = `new Date(item.time * 1000)` (UTC).
- `account` = `{ externalId: account.id, maskedPan: maskedPan[0], type, currencyCode }`.
- `metadata`: `mcc`, `originalMcc`, `description`, `comment`, `hold`, `balance`,
  `commissionRate`, `cashbackAmount`, `operationAmount`, `operationCurrencyCode`,
  контрагент (`counterName/Iban/Edrpou`), `receiptId`, `accountId`.

## Бекфіл / інкремент
- Перший прогін = вся історія (довго: 1 вікно/60с). Далі — інкрементально від watermark.
  → [[Sync Engine]]. Обмежити глибину: `MONO_SINCE=YYYY-MM-DD` у `.env`.

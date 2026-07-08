# Decision Log

Ключові рішення й чому. Формат: рішення → причина / наслідок.

## Архітектура й модель
- **Однокористувацький застосунок, без `userId`.** Це особистий інструмент, не платформа.
  Дедуп — `UNIQUE(source, externalId)`. → [[Invariants]] #4
- **`amount` = `numeric(38,0)` ↔ `BigInt`** (не `bigint`, не float). Крипта з 18 знаками
  (wei) переповнює `bigint` (макс ~9.2·10¹⁸); `numeric(38,0)` — безпечно, спільний тип для
  фіату й крипти. → [[Invariants]] #1
- **`decimals` (scale) зберігаємо поруч із сумою.** Ціле в мінорних одиницях не
  самодостатнє (UAH=2, JPY=0, BTC=8, ETH=18) — інакше показ вгадує scale.
- **Плоский enum `type`; P2P-ознака в `metadata`.** Простота за замовчуванням; окремий
  `p2p_buy` не заводимо. (підтверджено користувачем)
- **CSV `externalId` = детермінований хеш рядка.** CSV не має стабільного id; хеш
  стабільних полів + `UNIQUE(source, externalId)` дає ідемпотентність.
- **Крипто-трейд = одна нога активу + `tradeRef` у metadata.** Не будуємо FIFO/lot-tracking
  зараз, але й не унеможливлюємо. → [[Card↔Crypto Matching]]
- **Рахунок — окрема таблиця `accounts` + FK** (не просто текстовий `accountRef`). Треба
  показувати «картка ••1234 / UAH», групувати й фільтрувати. Міграція бекфілить existing
  із `metadata.accountId`. → [[Data Model]]

## Джерела / синк
- **Живі креди через `.env`; бекфіл — уся історія** (вибір користувача). Секрети не в код/Git.
- **Monobank: newest-first + stop на 400.** 400 = діапазон до існування рахунку → межа
  історії; так «вся історія» без падіння й без дати відкриття. → [[Monobank]]
- **Вікна з overlap на граничну секунду** (замість 1-сек діри) — жодна транзакція не
  випадає, дублі знімає дедуп.
- **Інкрементальний синк від watermark** (`max(bookedAt)` по source). Щоденний прогін
  тягне лише нове замість годинного бекфілу щоразу. Контракт лишився тонким:
  `fetch(sinceSec?)`, watermark рахує sync-шар. → [[Sync Engine]]
- **`currencyCode` = валюта РАХУНКУ, не операції.** `item.amount` — у валюті рахунку, а
  `item.currencyCode` — валюта операції; маркувати сумою операції = хибний ярлик на
  крос-валюті. Операційна сума/валюта → в `metadata`. Existing рядки чиняться SQL-
  пропагацією з `accounts` (amount був коректний, ламався лише ярлик). → [[Monobank]]
- **Crypto CSV = два окремих провайдери, не один із детектом формату.** `binance_p2p_csv`
  і `binance_deposit_csv` — різні `source`, різні файли, різні env-шляхи
  (`BINANCE_P2P_CSV_PATH`/`BINANCE_DEPOSIT_CSV_PATH`). Простіше й прозоріше за
  автовизначення формату за вмістом файлу. → [[Crypto CSV]]
- **P2P-ордер → один рядок (лише крипто-нога), fiat — тільки в `metadata`.** Не заводимо
  другий («fiat») рядок під P2P-ордер: fiat-сторона не є рухом по жодному з наших
  джерел-акаунтів (готівка/інший банк поза скоупом), і `TransactionType` не має fiat-руху
  без account-контексту. Курс/fiat-сума йдуть у `metadata` (`fiatAmountMinor` як рядок
  мінорних одиниць, не BigInt/float — jsonb не тримає BigInt) для кроку 5.
  `metadata.tradeRef` = order number (самопосилання, гак на майбутнє групування).
  → [[Crypto CSV]], [[Card↔Crypto Matching]]
- **`externalId` для CSV — завжди хеш через `buildExternalId`, навіть коли є нативний id.**
  Order Number і TXID стабільні, але хешуємо однаково для єдиної схеми externalId по всіх
  CSV-провайдерах і стійкості до майбутньої зміни формату колонок. → [[Providers]]
- **Крипто-scale — таблиця припущень у коді (`providers/binance/asset.ts`), не з CSV.**
  Binance CSV не містить canonical decimals активу. Таблиця (`USDT`/`USDC`=6, `BTC`=8,
  `ETH`/`BUSD`=18, фолбек 8) — задокументоване припущення; CSV-числа з надлишковими
  нульовими знаками (`320.00000000`) обрізаються рядково (`trimTrailingZeroFraction`)
  **перед** `parseDecimalToMinor` — float жодного разу не з'являється, реальна втрата
  точності (не-нульові цифри понад `decimals`) все одно кидає виняток. → [[Crypto CSV]]
- **CSV-крипто-рядки не мають `account`.** Немає концепції «картка» для Binance CSV;
  `accountId` лишається `null` (уже дозволено [[Data Model]] для деяких CSV-джерел).

## Інфраструктура
- **Єдиний `DATABASE_URL`** замість набору `DB_HOST/PORT/...` (вибір користувача).
- **TypeORM 1.0, PostgreSQL 16.** `gen_random_uuid()` з ядра — без `pgcrypto`/`uuid-ossp`
  у міграції.
- **Sheets — батч-append на `flush()`**, не per-event: повний бекфіл = тисячі подій.
  → [[Events & Export]]
- **Google-клієнт через `google-auth-library` + Sheets REST**, легше за повний `googleapis`.
- **`process.exitCode` замість `process.exit()`** в entrypoint — прибирає libuv-assert на
  Windows при завершенні з відкритими хендлами.

# Crypto CSV

Джерело крипти з Binance CSV (`backend/src/providers/binance/`). Статус — [[Roadmap & Status]].
→ [[Roadmap & Status]]

## Два провайдери (кожен = окремий parser + окремий `source`)
1. **`BinanceP2pProvider`** (`source: 'binance_p2p_csv'`) — Binance P2P order history:
   fiat-сума, **курс**, к-сть крипти. → критично для [[Card↔Crypto Matching]] (курс беремо
   з CSV, самі не рахуємо). Контекст (курс, fiat-сума, контрагент) кладемо в `metadata`.
2. **`BinanceDepositProvider`** (`source: 'binance_deposit_csv'`) — Binance deposit history:
   on-chain поповнення, **без fiat**. Для оцінки собівартості потрібен курс НБУ на дату
   (estimate). → [[Card↔Crypto Matching]] сценарій 2.

Визначення формату (який файл — P2P чи deposit) — на рівні **конфігурації** (два окремих
env-шляхи, `BINANCE_P2P_CSV_PATH` / `BINANCE_DEPOSIT_CSV_PATH`), не автовизначення за
вмістом.

## ФАКТИЧНИЙ ФОРМАТ КОЛОНОК (припущення — Binance не документує публічну CSV-схему)
Офіційної специфікації колонок цих двох CSV не знайдено (P2P/Deposit export UI сам генерує
файл; публічної схеми немає). Реалізовано під **реалістичний, але не 1:1-підтверджений**
формат; якщо реальний експорт користувача відрізняється — потрібно підправити лише
відповідний `binance-*.provider.ts` (мапінг колонок), контракт/ядро не зачіпається.

**P2P order history** (`__fixtures__/p2p-orders.sample.csv`), заголовок:
```
Order Number,Order Type,Asset Type,Fiat Type,Total Price,Price,Quantity,Time(UTC),Counterparty,Status
```
- `Order Type` — `BUY`/`SELL` з точки зору власника акаунту.
- `Time(UTC)` — `YYYY-MM-DD HH:mm:ss`, вже UTC (без конвертації таймзони).
- `Quantity`/`Total Price` — можуть бути надруковані з зайвими нулями після коми
  (напр. `320.00000000`) незалежно від реального scale активу.

**Deposit history** (`__fixtures__/deposit-history.sample.csv`), заголовок:
```
Date(UTC),Coin,Amount,Network,Address,TXID,Status
```
- `Date(UTC)` — той самий формат, що й P2P `Time(UTC)`.
- `TXID` — обов'язковий (рядок без нього відкидається помилкою; це єдиний надійний
  природний ключ для on-chain депозиту).

## Модель / мапінг
- Типи `buy/sell/deposit` (з `TransactionType`) лягають у ту саму
  [[Data Model|NormalizedTransaction]] (окрема таблиця не потрібна). `fee`/`withdraw`
  поки не реалізовані — не було джерела даних під них у цьому кроці.
- **P2P → одна нога = крипто-частина ордера.** `BUY` → додатний inflow крипти, `SELL` →
  від'ємний outflow. Fiat-сторона (сума + курс) не отримує власного рядка — вона живе в
  `metadata` (`fiatAmountMinor` як **рядок** мінорних одиниць — не BigInt/float,
  `fiatCurrencyCode`, `fiatDecimals`, `rate` як сирий рядок з CSV, `counterparty`,
  `tradeRef` = номер ордера). `tradeRef` — самопосилання на майбутнє (гак під
  крок 5/можливе групування кількох рядків одного трейду).
- **Deposit → одна нога = вхідний рух активу**, без fiat/`tradeRef`. `metadata`:
  `txId`, `network`, `address`, `status`.
- Жоден із двох провайдерів не додає `account` (немає концепції «картка/акаунт» для
  цих CSV — `accountId` лишається `null`, це прямо дозволено [[Data Model]]).
- `externalId` — `buildExternalId(['binance_p2p_csv', orderNumber])` /
  `buildExternalId(['binance_deposit_csv', coin, txId])`. Хешуємо навіть коли CSV має
  власний id (order number / TXID) — єдина схема externalId для всіх CSV-провайдерів,
  стійка до майбутньої зміни формату колонок.
- Суми — мінорні одиниці активу зі своїм `decimals`; таблиця в `providers/binance/asset.ts`
  (**припущення, задокументовано в коді**): `USDT`/`USDC` = 6, `BTC` = 8, `ETH`/`BUSD` = 18,
  невідомий актив → фолбек 8 (типова точність показу в UI Binance). Якщо реальний актив
  має інший canonical scale — це єдине місце для правки.
- CSV-числа з надлишковими нулями після коми (Binance часто друкує `320.00000000`
  незалежно від реального scale) тримаються **float-free**: `trimTrailingZeroFraction`
  (рядкова обрізка нулів) перед `parseDecimalToMinor` — реальна втрата точності (не-нульові
  цифри понад заявлений `decimals`) все одно кидає виняток, як і належить за [[Invariants]] #1.

## Реалізація
- `backend/src/providers/binance/csv.ts` — мінімальний CSV-парсер без залежностей
  (лапки/коми/CRLF/BOM); генерик, не специфічний до Binance — придатний і для
  [[Bank CSV]] (крок 7).
- `backend/src/providers/binance/{asset,decimal,time}.ts` — scale-таблиця, обрізка нулів,
  парсинг UTC-часу.
- `backend/src/providers/binance/{binance-p2p,binance-deposit}.provider.ts` — самі
  провайдери; шлях до файлу — через конструктор (`filePath`), не хардкод.
- Конфігурація: `BINANCE_P2P_CSV_PATH` / `BINANCE_DEPOSIT_CSV_PATH` в `.env`
  (`config/app-config.ts`); реєстрація — `+2 рядки` в `app.module.ts` фабриці
  (`TRANSACTION_PROVIDERS`), решта ядра не змінена.
- Тести: `*.spec.ts` на кожен хелпер і провайдер (дати/scale/хеш/tradeRef/обидва формати) +
  `binance-csv.int-spec.ts` (import обох CSV → `SyncService` → Postgres, ідемпотентність).
  **Інтеграційний тест не прогнаний** у середовищі розробки цього кроку (немає Docker у
  sandbox) — прогнати `npm run test:int` окремо. → [[Roadmap & Status]]

## На майбутнє (не ламати зараз)
Інвестиційний PnL потребуватиме lot-tracking (FIFO) і пар base/quote. Схему під це зараз
**не будуємо**, але лишаємо місток: кожен крипто-рядок = одна нога руху активу, зв'язок
ніг трейду — через `tradeRef`/`groupId` у `metadata`.

## Відкриті питання
- Точний формат колонок P2P/Deposit CSV не звірений з реальним експортом користувача
  (Binance не публікує схему) — звірити при першому реальному імпорті й підправити
  мапінг колонок за потреби.
- `fee`/`withdraw` типи для крипти поки не мають провайдера-джерела (не було в скоупі
  цього кроку).

## Кодування
CSV читати з урахуванням кодування/роздільників (тут зазвичай UTF-8, можливий BOM;
парсер це враховує). Для банків — див. [[Bank CSV]].

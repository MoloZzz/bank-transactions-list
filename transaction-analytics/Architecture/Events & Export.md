# Events & Export

Сайд-ефекти — лише через подію `transaction.created` (→ [[Invariants]] #6). Синк не знає
про експорт; експорт не знає про синк/провайдери.

## Подія
- Константа `TRANSACTION_CREATED = 'transaction.created'`, інтерфейс `EventBus` (у Nest
  його закриває `EventEmitter2`).
- `SyncService` емітить подію **лише на реально створені** рядки (не на дедуп-хіти).
- Поки що **один** subscriber — не плодимо подієвість заздалегідь.

## Google Sheets subscriber
- Слухає `transaction.created`, **буферизує** рядки і робить **один батч-append** на
  `flush()`. Повний бекфіл = тисячі подій, тож per-event запис у Sheets був би повільний
  і впирався б у ліміти — тому буфер + один флаш наприкінці прогону.
- `transactionToSheetRow` — display-шар: `formatMinor` дає людський amount із мінорних
  одиниць (крипта без втрат), дата — UTC ISO, колонка рахунку (maskedPan/або id).
- `SheetsClient` — вузький інтерфейс (`appendRows`). Живий `GoogleSheetsClient` через
  `google-auth-library` (service-account JWT) + Sheets REST; якщо кредів нема —
  `NullSheetsClient` (синк усе одно пише в БД).

## Конфіг (env)
```
GOOGLE_SERVICE_ACCOUNT_JSON=   # inline JSON або шлях до файлу
SHEETS_SPREADSHEET_ID=
SHEETS_TAB=Sheet1
```
Без цих змінних експорт вимкнено (Null-клієнт), БД наповнюється як звичайно.

## Майбутнє (за тією ж подією)
Аналітика, AI-категоризація (джерело — `mcc` у `metadata`) — додаються як нові
subscriber'и, без змін у синку/провайдерах.

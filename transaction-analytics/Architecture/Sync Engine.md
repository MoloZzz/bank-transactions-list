# Sync Engine

`SyncService` (`src/sync/sync.service.ts`). Оркеструє один прогін: для кожного провайдера
тягне нормалізовані транзакції, апсертить рахунки, ідемпотентно зберігає, емітить подію.
Source-agnostic — знає лише контракт `TransactionProvider`. → [[Providers]]

## Алгоритм (на кожен провайдер)
1. **watermark** = `MAX(bookedAt)` по `source` (unix-секунди) або `undefined`, якщо порожньо.
2. `rows = provider.fetch(watermark)` — інкрементально тягне лише нове; порожня БД →
   `undefined` → повний бекфіл від floor провайдера.
3. **upsert accounts** з описів рахунків у `rows` → мапа `externalId → accountId`
   (збагачує `name/maskedPan/currency/type` з кожним прогоном).
4. **persist**: bulk `INSERT ... ON CONFLICT (source, externalId) DO NOTHING`
   (`.orIgnore()`), проставляючи `accountId`. Повертає лише **реально створені** рядки.
5. **emit** `transaction.created` на кожен створений рядок. → [[Events & Export]]

## Ідемпотентність
Тримається на `UNIQUE(source, externalId)` (→ [[Invariants]] #4). Повторний запуск і
overlap інкрементального вікна дублів не створюють — `DO NOTHING`.

## Інкрементальність (watermark)
Щоденний `npm run sync` тягне лише нове, а не всю історію щоразу. Watermark рахується
в sync-шарі (тут є доступ до БД); провайдер лишається тупим fetch'ем, якому передають
`sinceSec`. Перший прогін (порожня БД) = повний бекфіл.

> [!warning] Знімок на час старту
> `now` фіксується на початку прогону; транзакції, що з'явились під час довгого бекфілу,
> потраплять у наступний синк. Це очікувано.

## Entrypoint
`npm run sync` → `src/sync.command.ts`: піднімає headless Nest-контекст → `sync()` →
`SheetsSubscriber.flush()` → лог підсумку → вихід. Ідемпотентний, безпечний до повторів.

## Запуск локально
```
cp .env.example .env      # DATABASE_URL + MONOBANK_TOKEN
npm i
npm run db:up && npm run migration:run
npm run sync
```

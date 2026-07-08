# Financial Transactions Aggregator

Персональний фінансовий трекер (1 користувач): збирає транзакції (Monobank API, CSV),
нормалізує в одну модель, метчить картковий відтік з крипто-припливом (P2P), експортує
в Google Sheets. Стек: NestJS + TypeORM + PostgreSQL. Код — у `backend/`.

## База знань (vault) — читати ПЕРЕД роботою
Vault: `transaction-analytics/`. Обов'язковий мінімум для будь-якої задачі:

1. `transaction-analytics/Architecture/Invariants.md` — непорушні правила
2. `transaction-analytics/Architecture/Data Model.md` — сутності й схема
3. `transaction-analytics/Roadmap & Status.md` — що готово, що далі
4. Нота конкретної задачі (план у `transaction-analytics/Plans/` або нота у
   `Architecture/`/`Sources/`)

Решту нот читати лише якщо задача їх стосується. Не читати `backend/dist/`.

## Ключові інваріанти (скорочено; повний текст — у vault)
- Гроші: **цілі мінорні одиниці**, ніколи float. `numeric(38,0)`.
- Час: зберігання **UTC**; локальний час лише на показі/групуванні.
- Ідемпотентність: `UNIQUE(source, externalId)`; повторний синк/імпорт без дублів.
- Розширюваність: нове джерело/споживач = новий провайдер/підписник **збоку**,
  ядро (normalize, sync, entities) не чіпається.
- Один користувач: немає userId, ролей, мультитенантності — не додавати.
- Секрети лише через env, ніколи в код/БД.

## Команди (з `backend/`)
- `npm run build` / `tsc` через `nest build`
- `npm test` — unit; `npm run test:int` — інтеграційні (потрібен Postgres: `npm run db:up`)
- `npm run migration:run` / `migration:generate`
- `npm run sync` — ручний прогін синку
- `npm run lint`, `npm run format`

## Definition of Done (кожна задача)
Код працює + unit-тест + інтеграційний тест (де є provider/sync/БД) + `tsc` чистий +
усі наявні тести зелені + жоден інваріант не порушено + критерії приймання
з відповідного плану (`Plans/Plan NN — *.md`) відмічені.

## Після завершення задачі
Оновити vault: `Roadmap & Status.md` (статус кроку) і, якщо змінилась схема/архітектура,
відповідну ноту в `Architecture/`. Нові рішення — рядком у `Decisions/Decision Log.md`.

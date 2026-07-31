# Financial Transactions Aggregator

Персональний фінансовий трекер (1 користувач): збирає транзакції (Monobank API, CSV),
нормалізує в одну модель, метчить картковий відтік з крипто-припливом (P2P), експортує
в Google Sheets. Стек: NestJS + TypeORM + PostgreSQL. Код — у `backend/`. База знань —
у `transaction-analytics/`.

## Retrieval — як читати базу знань (ЗАМІСТЬ читання нот підряд)

**L1. Завжди перший крок будь-якої задачі — один Read:**
`transaction-analytics/_gen/context.txt` (~800 токенів: інваріанти, статус, сутності,
міграції, провайдери, env, тести, DoD). Це замінює обовʼязкове читання 4 нот.

**L2. Знайти потрібне:** `node tools/vault/v.mjs find "<запит>"` — віддає ранжований
список `path#N :: heading`. Запит можна писати англійською: є en↔uk місток.

**L3. Прочитати ОДНУ секцію:** `node tools/vault/v.mjs show "<ref>"`.
Ref приймає `"Data Model#crypto_purchases"`, `"Data Model#5"` (позиційно) або
`"matching#2"` (підрядок) — не треба вводити `↔`/`—` у шелл. Якщо секція обрізана,
у футері будуть точні `offset`/`limit` для Read.

**L4. Повний Read ноти — лише коли збираєшся її РЕДАГУВАТИ.**

**Субагентам:** передавай рефи (`Data Model#5`), ніколи не вставляй тіла нот у промпт.
Перший виклик субагента: `node tools/vault/v.mjs brief <ref>...` (context.txt + секції
одним викликом).

Не читати `backend/dist/`.

## Ключові інваріанти (генерується з `Architecture/Invariants.md` — не редагувати руками)
<!-- auto:invariants begin -->
- 1. Гроші — ціле в мінорних одиницях, ніколи float
- 2. Дати — UTC у БД
- 3. Ядро не знає про джерело
- 4. Дедуп і мультитенантність
- 5. Метчинг — окремий шар post-processing
- 6. Сайд-ефекти — тільки через подію
- 7. Секрети — лише env/secrets
<!-- auto:invariants end -->

Повний текст і наслідки — [[Invariants]]. Розбіжність між цим блоком і нотою неможлива:
блок генерується, `vault check` це стереже.

## Команди (з `backend/`)
<!-- auto:cmds begin -->
- `npm run build`
- `npm run test`
- `npm run test:int`
- `npm run lint`
- `npm run migration:run`
- `npm run sync`
- `npm run match`
- `npm run db:up`
<!-- auto:cmds end -->

`npm run lint` — це `eslint --fix`, він **змінює файли**; ніколи не викликати з хука.
Актуальні лічильники тестів — у `_gen/context.txt`, не в нотах.

## Vault-тулінг
```
node tools/vault/v.mjs build     # перегенерувати _gen/* і auto-блоки (ПИШЕ)
node tools/vault/v.mjs check     # перевірити; НІЧОГО не пише (це і є хук)
node tools/vault/v.mjs pin <нота>  # перепінити rev: після зміни коду
```
З `backend/` доступні як `npm run vault:build` / `vault:check` / `vault:find` /
`vault:show` / `vault:brief`.

## Definition of Done (кожна задача)
Канон — [[Roadmap & Status]], розділ «Definition of Done». Плюс: `vault check` без
помилок. Тут DoD не дублюється (раніше існувало 3 розбіжні версії).

## Дисципліна vault (ПРИМУСОВО, перевіряється машиною)
Задача НЕ вважається завершеною без оновлення vault — це частина DoD. Раніше це були
прозові правила, які ніхто не перевіряв; тепер їх стереже `vault check`:

1. `Roadmap & Status.md` — **єдине джерело правди про статус**. Статусні дієслова
   («реалізовано», «прогнано», «зелений») в інших нотах блокуються правилом
   `status-leak`. Ярлик обсягу («крок 5») — можна, це не статус.
2. Схема/сутності → `Architecture/Data Model.md`; sync/провайдери/події → відповідна
   нота в `Architecture/`. Якщо нота має `code:`, зміна цього коду робить її `rev:`
   несвіжим (`rev-stale`) — треба переглянути ноту й `vault pin`. Запінити ноту, якої
   ти не редагував, не можна.
3. Кожне нове архітектурне рішення → рядок у `Decisions/Decision Log.md`.
4. Факт, що вже має власника в `_facts.tsv`, не переказувати без посилання на канон
   (правило `fact-restated`).
5. Крок roadmap і його план звіряються через `_steps.tsv`: закритий крок з
   невідміченими критеріями плану — помилка.
6. `_gen/*` комітиться разом зі змінами. Хук відхилить коміт зі стухлим `_gen`.

Обхід у виняткових випадках: `SKIP_VAULT_CHECK=1 git commit ...` — і це треба
обґрунтувати в повідомленні коміту.

## Setup після клонування
```bash
git config core.hooksPath .githooks
```

## RTK — компактний вивід bash-команд
**Золоте правило: префіксуй bash-команди `tools/rtk`** (git/grep/find/ls/npm run/tsc/
lint/jest). Якщо фільтр є — застосується, якщо нема — passthrough, тож це завжди
безпечно. Працює і в ланцюжках через `&&`. Якщо `tools/rtk` відсутній:
`cp tools/rtk-cli tools/rtk && chmod +x tools/rtk`.
Повний довідник команд — `tools/rtk.md` (читати за потреби, не тримати в контексті).

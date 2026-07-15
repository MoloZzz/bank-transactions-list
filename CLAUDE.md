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

## Дисципліна vault (ПРИМУСОВО)
Задача НЕ вважається завершеною без оновлення vault. Це не опція, а частина DoD:

1. `Roadmap & Status.md` — **єдине джерело правди про статус**. Статус кроку/тестів
   оновлюється тут і ТІЛЬКИ тут. В інших нотах (включно з `00 — Index.md`) статус
   не дублювати — лише посилання `[[Roadmap & Status]]`.
2. Змінилась схема/сутності → оновити `Architecture/Data Model.md`.
   Змінився sync/провайдери/події → відповідну ноту в `Architecture/`.
3. Кожне нове архітектурне рішення → рядок у `Decisions/Decision Log.md` (що + чому).
4. Змінюєш інваріант → спочатку `Architecture/Invariants.md` (канон), потім скорочений
   список у цьому файлі. Розбіжність між ними — баг.
5. Коміт коду (`backend/src|test`) БЕЗ зміни у `transaction-analytics/` блокується
   pre-commit хуком (`.githooks/pre-commit`). Обхід лише для zero-knowledge правок
   (typo/rename): `SKIP_VAULT_CHECK=1 git commit ...` — і це треба обґрунтувати
   в повідомленні коміту.

Останній крок будь-якої задачі — самоперевірка: «які ноти застаріли через мою зміну?»
Перевірити мінімум: Roadmap, Data Model, Decision Log, ноту задачі.

## Setup після клонування
`git config core.hooksPath .githooks` — інакше vault-sync хук не працює.

## RTK — компактний вивід bash-команд (ПРИМУСОВО, наскільки дозволяє Cowork)
Бінарник лежить у `tools/rtk` (Linux ELF, працює в sandbox Cowork; у git не комітиться —
див. `.gitignore`). Cowork не підтримує PreToolUse hook (на відміну від Claude Code) —
тобто це НЕ автоматичне перехоплення команд, а пряма вказівка, якій ти зобов'язаний
слідувати вручну для КОЖНОЇ bash-команди, що підпадає під список нижче.

**Правило: перш ніж виконати git/grep/find/npm run/ls/tsc/lint-команду в цьому репо —
перевір, чи є для неї rtk-обгортка нижче, і якщо є, використай саме її, а не голу
команду.** Якщо `tools/rtk` відсутній (свіжий sandbox), віднови його одноразово:
`cp tools/rtk-cli tools/rtk && chmod +x tools/rtk`.

PATH у sandbox не персистить між bash-викликами, тому всюди нижче `rtk <command>`
читай як `tools/rtk <command>` (шлях відносно кореня репо).

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `tools/rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `tools/rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
tools/rtk git add . && tools/rtk git commit -m "msg" && tools/rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
tools/rtk tsc                 # TypeScript errors grouped by file/code (83%)
tools/rtk lint                # ESLint violations grouped (84%)
```

### Test (60-99% savings)
```bash
tools/rtk jest                # Jest failures only (99.5%)
tools/rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
tools/rtk git status          # Compact status
tools/rtk git log             # Compact log (works with all git flags)
tools/rtk git diff            # Compact diff (80%)
tools/rtk git show            # Compact show (80%)
tools/rtk git add             # Ultra-compact confirmations (59%)
tools/rtk git commit          # Ultra-compact confirmations (59%)
tools/rtk git push            # Ultra-compact confirmations
tools/rtk git pull            # Ultra-compact confirmations
tools/rtk git branch          # Compact branch list
tools/rtk git fetch           # Compact fetch
tools/rtk git stash           # Compact stash
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
tools/rtk npm run <script>    # Compact npm script output
tools/rtk npx <cmd>           # Compact npx command output
```

### Files & Search (60-75% savings)
```bash
tools/rtk ls <path>           # Tree format, compact (65%)
tools/rtk read <file>         # Code reading with filtering (60%)
tools/rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
tools/rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
tools/rtk err <cmd>           # Filter errors only from any command
tools/rtk log <file>          # Deduplicated logs with counts
tools/rtk json <file>         # JSON structure without values
tools/rtk env                 # Environment variables compact
tools/rtk diff                # Ultra-compact diffs
```

### Meta Commands
```bash
tools/rtk gain                # View token savings statistics
tools/rtk gain --history      # View command history with savings
```

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

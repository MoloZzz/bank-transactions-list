# RTK — компактний вивід bash-команд

Повний довідник. У `CLAUDE.md` лишається тільки золоте правило —
це файл читається за потреби, а не в кожному запиті.

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

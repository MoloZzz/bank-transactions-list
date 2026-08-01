/**
 * evidence — measure the metrics in `_metrics.tsv` against the live database,
 * so "what should we build next" is answered with a number instead of taste.
 *
 * This is the Observe stage of the product loop. It is deliberately NOT part of
 * `check`:
 *
 *   - `check` must stay a pure function of the repo. It runs in the pre-commit
 *     hook, on machines with no database and in CI with an empty one. A rule
 *     that reads live data would fail for reasons that have nothing to do with
 *     the commit being made.
 *   - the output describes THIS machine's data, not repo state, so it lands in
 *     `tools/vault/.evidence.tsv` (gitignored) next to `.ctx.tsv`/`.log.tsv`,
 *     for the same reason those live there: a file that changes whenever the
 *     data changes would make the _gen freshness rule flap on every commit.
 *
 * Exit codes follow the tool-wide convention, with one local refinement:
 *   0  measured (whether or not triggers fired — a quiet metric is a result)
 *   1  could not measure (no DATABASE_URL, DB unreachable, table missing)
 *   2  the registry itself is malformed (RegistryError)
 * 1 is never wired into a hook: not measuring is a fact about the machine.
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { readTextOrNull, writeText, toPosix, VAULT_DIR, BACKEND_DIR } from './fs.mjs';

/**
 * Local twin of v.mjs's UsageError. It cannot import that one: v.mjs is the
 * entry point and calls main() at module load, so a lib importing it would run
 * the whole CLI a second time. Caught in evidence() and reported as exit 2.
 */
export class RegistryError extends Error {}

const REGISTRY = `${VAULT_DIR}/_metrics.tsv`;
const OUT = 'tools/vault/.evidence.tsv';

/** Columns a metric may return. The whitelist IS the privacy guard — see _metrics.tsv. */
const ALLOWED_COLUMNS = new Set(['value', 'n']);

/**
 * Statements that must never appear in a metric. The registry is repo state and
 * therefore reviewed, so this is not a sandbox against a hostile author — it is
 * a guard against a careless one, layered under the READ ONLY transaction that
 * actually enforces it at the server.
 */
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|analyze)\b/i;

const TRIGGER_RX = /^(>=|<=|<>|>|<|=)\s*(-?\d+(?:\.\d+)?)$/;

/** Parse `> 0.15` into a predicate carrying its own source text for the report. */
function parseTrigger(raw, key) {
  if (raw === '-') return null;
  const m = TRIGGER_RX.exec(raw.trim());
  if (!m) throw new RegistryError(`${REGISTRY}: metric '${key}' has an unparseable trigger '${raw}'`);
  const [, op, num] = m;
  const bound = Number(num);
  const fns = {
    '>': (v) => v > bound,
    '<': (v) => v < bound,
    '>=': (v) => v >= bound,
    '<=': (v) => v <= bound,
    '=': (v) => v === bound,
    '<>': (v) => v !== bound,
  };
  return { text: raw.trim(), fires: fns[op] };
}

export function readRegistry(root) {
  const text = readTextOrNull(path.resolve(root, REGISTRY));
  if (text === null) throw new RegistryError(`missing ${REGISTRY} — the metric registry is what evidence measures`);

  const metrics = [];
  const seen = new Set();
  text.split('\n').forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const cols = line.split('\t');
    if (cols.length !== 5)
      throw new RegistryError(`${REGISTRY}:${i + 1}: expected 5 tab-separated columns, got ${cols.length}`);

    const [key, plan, trigger, question, sql] = cols.map((c) => c.trim());
    if (seen.has(key)) throw new RegistryError(`${REGISTRY}:${i + 1}: duplicate metric key '${key}'`);
    seen.add(key);

    if (!/^select\b/i.test(sql)) throw new RegistryError(`${REGISTRY}:${i + 1}: metric '${key}' must be a SELECT`);
    if (sql.includes(';')) throw new RegistryError(`${REGISTRY}:${i + 1}: metric '${key}' must be a single statement`);
    const bad = FORBIDDEN.exec(sql);
    if (bad) throw new RegistryError(`${REGISTRY}:${i + 1}: metric '${key}' contains forbidden keyword '${bad[0]}'`);

    metrics.push({ key, plan, question, sql, trigger: parseTrigger(trigger, key), line: i + 1 });
  });

  if (!metrics.length) throw new RegistryError(`${REGISTRY}: no metrics defined`);
  return metrics;
}

/**
 * DATABASE_URL from the environment, else from backend/.env — the same single
 * URL the app itself uses, so `evidence` can never measure a different database
 * than `npm run sync` writes to.
 */
function databaseUrl(root) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readTextOrNull(path.resolve(root, BACKEND_DIR, '.env'));
  if (env) {
    for (const line of env.split('\n')) {
      const m = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

/** Resolve `pg` out of backend/node_modules — the vault tooling stays dependency-free. */
function loadPg(root) {
  const require = createRequire(path.resolve(root, BACKEND_DIR, 'package.json'));
  try {
    return require('pg');
  } catch {
    return null;
  }
}

function fmt(v) {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

function pad(s, w) {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

/** Turn a Postgres error code into the action that actually fixes it. */
function hintFor(err) {
  if (err.code === '42P01') return ' — schema missing; run: cd backend && npm run migration:run';
  if (err.code === '42703') return ' — column renamed? re-check this metric against the migrations';
  if (err.code === '57014') return ' — statement timed out; the metric needs an index or a cheaper shape';
  return '';
}

/**
 * Run every metric in one READ ONLY transaction with a statement timeout.
 * READ ONLY is the real enforcement of the registry contract; the keyword scan
 * in readRegistry only produces a better error message than the server would.
 *
 * Each metric runs inside its own SAVEPOINT. Without one, the FIRST failing
 * query aborts the transaction and every later metric reports "current
 * transaction is aborted" instead of its own result — one stale metric would
 * silently blank the whole report, which is precisely the failure a measurement
 * tool must not have.
 */
async function measure(client, metrics) {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '30s'");
  const rows = [];
  for (const m of metrics) {
    await client.query('SAVEPOINT metric');
    try {
      const res = await client.query(m.sql);
      const cols = res.fields.map((f) => f.name);
      const illegal = cols.filter((c) => !ALLOWED_COLUMNS.has(c));
      if (illegal.length)
        throw new Error(`returns disallowed column(s) ${illegal.join(', ')} — only ${[...ALLOWED_COLUMNS].join('/')} may leave the database`);
      if (res.rowCount !== 1) throw new Error(`returned ${res.rowCount} rows, expected exactly 1`);

      const raw = res.rows[0].value;
      const value = raw === null || raw === undefined ? null : Number(raw);
      // NEVER interpolate `raw` into this message. A metric aliasing a text
      // column as `value` (SELECT metadata->>'description' AS value) passes the
      // column-name check, and echoing the offender would print a merchant name
      // into the report — the exact leak the whole contract exists to prevent.
      if (value !== null && !Number.isFinite(value))
        throw new Error(`value is not a finite number (got ${typeof raw}) — metrics must return shares and counts`);
      const n = res.rows[0].n === undefined ? null : Number(res.rows[0].n);
      await client.query('RELEASE SAVEPOINT metric');
      rows.push({ ...m, value, n, error: null });
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT metric').catch(() => {});
      rows.push({ ...m, value: null, n: null, error: `${err.message}${hintFor(err)}` });
    }
  }
  await client.query('COMMIT');
  return rows;
}

function render(rows, measuredAt) {
  const w = {
    key: Math.max(6, ...rows.map((r) => r.key.length)),
    plan: Math.max(4, ...rows.map((r) => r.plan.length)),
    trig: Math.max(7, ...rows.map((r) => (r.trigger ? r.trigger.text.length : 1))),
  };
  const out = [`# evidence  measured=${measuredAt}  metrics=${rows.length}`, ''];
  out.push(`${pad('metric', w.key)}  ${pad('value', 8)}  ${pad('n', 7)}  ${pad('trigger', w.trig)}  fires  ${pad('plan', w.plan)}`);
  for (const r of rows) {
    const fires = r.error ? 'ERR' : !r.trigger ? '—' : r.value === null ? 'no data' : r.trigger.fires(r.value) ? 'YES' : 'no';
    out.push(
      `${pad(r.key, w.key)}  ${pad(fmt(r.value), 8)}  ${pad(r.n === null ? '—' : String(r.n), 7)}  ` +
        `${pad(r.trigger ? r.trigger.text : '—', w.trig)}  ${pad(fires, 5)}  ${pad(r.plan, w.plan)}`,
    );
  }

  const firing = rows.filter((r) => !r.error && r.trigger && r.value !== null && r.trigger.fires(r.value));
  out.push('');
  if (firing.length) {
    out.push('ACT — triggers firing, most-sampled first:');
    for (const r of [...firing].sort((a, b) => (b.n ?? 0) - (a.n ?? 0))) {
      out.push(`  ${r.plan}  <- ${r.key}=${fmt(r.value)} ${r.trigger.text} (n=${r.n ?? '—'})`);
      out.push(`      ${r.question}`);
    }
  } else {
    out.push('ACT — nothing firing. No plan in the registry is justified by current data.');
  }

  const errs = rows.filter((r) => r.error);
  if (errs.length) {
    out.push('');
    out.push('UNMEASURED:');
    for (const r of errs) out.push(`  ${r.key}: ${r.error}`);
  }
  out.push('');
  out.push('Directional, not statistical: one user, small n. Plans with no row here (Plan 00)');
  out.push('are decided by judgement — absence of a metric is not evidence against them.');
  return out.join('\n');
}

export async function evidence(root, flags) {
  let metrics;
  try {
    metrics = readRegistry(root);
  } catch (err) {
    if (!(err instanceof RegistryError)) throw err;
    process.stderr.write(`evidence: ${err.message}\n`);
    return 2;
  }

  if (flags.dry) {
    process.stdout.write(`# ${REGISTRY}: ${metrics.length} metrics, registry valid\n\n`);
    for (const m of metrics) {
      process.stdout.write(`${m.key}  [${m.plan}]  trigger ${m.trigger ? m.trigger.text : '—'}\n  ${m.question}\n  ${m.sql}\n\n`);
    }
    return 0;
  }

  const url = databaseUrl(root);
  if (!url) {
    process.stderr.write(`evidence: no DATABASE_URL (env or ${BACKEND_DIR}/.env) — cannot measure. Registry is valid; see --dry.\n`);
    return 1;
  }
  const pg = loadPg(root);
  if (!pg) {
    process.stderr.write(`evidence: 'pg' not resolvable from ${BACKEND_DIR}/node_modules — run npm install in ${BACKEND_DIR}/.\n`);
    return 1;
  }

  const client = new pg.Client({ connectionString: url });
  let rows;
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(`evidence: cannot reach the database (${err.message}). Start it: cd ${BACKEND_DIR} && npm run db:up\n`);
    return 1;
  }
  try {
    rows = await measure(client, metrics);
  } finally {
    await client.end().catch(() => {});
  }

  const measuredAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const report = render(rows, measuredAt);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          measuredAt,
          metrics: rows.map((r) => ({
            key: r.key,
            plan: r.plan,
            value: r.value,
            n: r.n,
            trigger: r.trigger ? r.trigger.text : null,
            fires: r.error || !r.trigger || r.value === null ? null : r.trigger.fires(r.value),
            question: r.question,
            error: r.error,
          })),
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(report + '\n');
  }

  // Tab-separated so the Interpret/Verify stages can diff two runs without a parser.
  const tsv = [
    '# key\tvalue\tn\ttrigger\tfires\tplan\tmeasured_at',
    ...rows.map((r) =>
      [
        r.key,
        r.error ? 'ERR' : fmt(r.value),
        r.n === null ? '-' : r.n,
        r.trigger ? r.trigger.text : '-',
        r.error ? 'err' : !r.trigger || r.value === null ? '-' : r.trigger.fires(r.value) ? 'yes' : 'no',
        r.plan,
        measuredAt,
      ].join('\t'),
    ),
  ].join('\n');
  writeText(path.resolve(root, OUT), tsv);
  if (!flags.json) process.stdout.write(`\nwrote ${toPosix(OUT)}\n`);

  return rows.every((r) => r.error) ? 1 : 0;
}

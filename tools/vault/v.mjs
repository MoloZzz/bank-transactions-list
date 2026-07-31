#!/usr/bin/env node
/**
 * vault — second-brain tooling for transaction-analytics/
 *
 * HARD CONTRACT:
 *   build  writes (_gen/*, auto-blocks, rev: pins)   — NEVER called from a hook
 *   check  writes NOTHING, ever                      — the only hook-safe command
 * This split is what makes the regeneration loop structurally impossible.
 *
 * Exit codes:
 *   0  clean
 *   1  error-severity findings   (your vault has a problem)
 *   2  tool/usage error          (the tool has a problem)
 * Keeping 1 and 2 distinct means a crashed parser never reads as "vault is bad".
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const USAGE = `vault — knowledge base tooling

  build [--seed-frontmatter] [--seed-facts] [--lint]   regenerate _gen/* and auto-blocks
  check [--staged] [--strict] [--rule <id>]            validate; writes nothing
  pin <note>                                           re-pin rev: (requires a staged edit)
  find <query> [--json] [-n N]                         ranked path#N :: heading
  show <ref> [--links] [--ctx] [--max-lines N]         print one section
  brief <ref>...                                       context.txt + named sections
  map                                                  dump map.tsv

Refs accept: "Data Model#crypto_purchases" | "Data Model#5" | "matching#2"
`;

/**
 * Resolve the repo root via git and chdir into it, so every command behaves
 * identically no matter which subdirectory it was invoked from (git hooks run
 * from varying cwds depending on the client).
 */
function repoRoot() {
  const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return path.resolve(out.toString('utf8').trim());
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-n' || a === '--max-lines' || a === '--rule') flags[a.replace(/^-+/, '')] = argv[++i];
    else if (a.startsWith('--')) flags[a.slice(2)] = true;
    else positional.push(a);
  }
  return { flags, positional };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stderr.write(USAGE);
    return 2;
  }

  const root = repoRoot();
  process.chdir(root);
  const { flags, positional } = parseArgs(rest);

  switch (cmd) {
    case 'build': {
      const { build } = await import('./lib/render.mjs');
      return build(root, flags);
    }
    case 'check': {
      const { check } = await import('./lib/rules.mjs');
      return check(root, flags);
    }
    case 'pin': {
      const { pin } = await import('./lib/render.mjs');
      if (!positional[0]) throw new UsageError('pin requires a note path');
      return pin(root, positional[0]);
    }
    case 'find': {
      const { find } = await import('./lib/search.mjs');
      if (!positional.length) throw new UsageError('find requires a query');
      return find(root, positional.join(' '), flags);
    }
    case 'show': {
      const { show } = await import('./lib/search.mjs');
      if (!positional[0]) throw new UsageError('show requires a ref');
      return show(root, positional[0], flags);
    }
    case 'brief': {
      const { brief } = await import('./lib/search.mjs');
      return brief(root, positional, flags);
    }
    case 'map': {
      const { dumpMap } = await import('./lib/search.mjs');
      return dumpMap(root);
    }
    default:
      process.stderr.write(`vault: unknown command '${cmd}'\n\n${USAGE}`);
      return 2;
  }
}

export class UsageError extends Error {}

main()
  .then((code) => {
    process.exitCode = typeof code === 'number' ? code : 0;
  })
  .catch((err) => {
    // Hook-facing messages stay ASCII English: a mangled instruction is
    // unrecoverable under cmd.exe's OEM codepage, mangled quoted text is not.
    process.stderr.write(`vault: ${err instanceof UsageError ? err.message : err.stack || err.message}\n`);
    process.exitCode = 2;
  });

/**
 * Claude Code hook adapters.
 *
 * These make the retrieval protocol structural instead of advisory:
 *
 *   session-start / subagent-start
 *     Inject `_gen/context.txt` automatically. L1 previously depended on the
 *     agent CHOOSING to read a file, which was the weakest link in the whole
 *     design. `subagent-start` is the one that matters most for cross-agent
 *     context retention — a child agent is primed before it does anything.
 *
 *   post-read
 *     Fires after a Read. The CLI cannot observe Read calls, so `show` ->
 *     full Read (an L3->L4 escalation) was unmeasurable from inside the tool;
 *     the hook layer can see it, so this is where that signal is captured.
 *     It also emits a short nudge back to the agent.
 *
 * CONTRACT: every path here exits 0 and never throws. A hook that crashes or
 * blocks is worse than no hook — PostToolUse runs on every single Read.
 *
 * Schema verified against the installed Claude Code (hookSpecificOutput is a
 * discriminated union on hookEventName; SessionStart / SubagentStart /
 * PostToolUse all accept `additionalContext`).
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { VAULT_DIR, GEN_DIR, readTextOrNull, toPosix } from './fs.mjs';
import { logEvent } from './log.mjs';

const EVENT = {
  'session-start': 'SessionStart',
  'subagent-start': 'SubagentStart',
  'post-read': 'PostToolUse',
};

function emit(hookEventName, additionalContext) {
  if (!additionalContext) return 0;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }) + '\n');
  return 0;
}

/** Read the hook payload from stdin. Returns {} if there is nothing to read. */
function stdinJson() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function contextPack(root) {
  const txt = readTextOrNull(path.resolve(root, GEN_DIR, 'context.txt'));
  if (!txt) return null;
  return `${txt.trim()}\n\nThis is L1, injected automatically. Do not re-read context.txt.`;
}

/** True for a hand-written vault note (never the generated tree). */
function isVaultNote(rel) {
  return rel.startsWith(`${VAULT_DIR}/`) && rel.endsWith('.md') && !rel.startsWith(`${GEN_DIR}/`);
}

export function hook(root, which) {
  const hookEventName = EVENT[which];
  if (!hookEventName) {
    process.stderr.write(`vault hook: unknown event '${which}' (expected: ${Object.keys(EVENT).join(', ')})\n`);
    return 0; // never fail the session over a misconfigured hook
  }

  try {
    if (which === 'post-read') {
      const payload = stdinJson();
      const file = payload?.tool_input?.file_path;
      if (!file) return 0;

      const rel = toPosix(path.isAbsolute(file) ? path.relative(root, file) : file);
      if (!isVaultNote(rel)) return 0;

      // The measurement the CLI could not take: a full note Read is L4.
      logEvent(root, { cmd: 'read', arg: rel, outcome: 'l4', detail: 'full note Read' });

      return emit(
        hookEventName,
        `Retrieval note: '${rel}' was read in full (L4). L4 is for editing a note. ` +
          `To consult one, prefer: node tools/vault/v.mjs show "<Note>#<anchor>" — one section, ` +
          `with exact Read offsets in the footer if it truncates.`,
      );
    }

    return emit(hookEventName, contextPack(root));
  } catch {
    return 0;
  }
}

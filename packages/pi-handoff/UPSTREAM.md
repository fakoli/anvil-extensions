# Provenance ledger

## Ported source

Source: `fakoli/fakoli-plugins`, `plugins/handoff` (MIT, same author). The
handoff plugin ships three bash scripts (`handoff-path.sh`, `handoff-meta.sh`,
`handoff-freshness.sh`), a Python SessionStart hook (`session-start.py`),
two skills (`handoff`, `recall`), two commands (`/handoff:handoff`,
`/handoff:recall`), and shared storage under `~/.claude/handoff/`.

This package is a **native port**, not a verbatim import:

| Original | Port | Divergence |
|---|---|---|
| `scripts/handoff-path.sh` + `hooks/session-start.py` (key parity) | `src/path.ts` | TypeScript port of the identity-keying logic: normalized origin remote (git@/ssh://, http(s), github.com lowercasing), git-common-dir fallback for local repos, physical-path canonicalization, and the one-time legacy-key migration. The original's `git hash-object --stdin` key hash is replicated with `node:crypto` (git blob framing), so keying no longer depends on git. |
| `scripts/handoff-meta.sh` | `src/meta.ts` | Flat frontmatter capture (saved_at, branch, HEAD, dirty count, optional anvil claim snapshot). Best-effort semantics unchanged: outside a git repo the git fields are omitted; without the anvil CLI the anvil fields are omitted; capture never blocks a save. |
| `scripts/handoff-freshness.sh` | `src/freshness.ts` | Staleness flags (note age vs `HANDOFF_MAX_AGE_DAYS`, branch moved, HEAD advanced vs diverged via `merge-base --is-ancestor`, recorded anvil claims no longer active) with the same verdict semantics: informational, never blocking; legacy notes (no frontmatter) report "freshness unavailable". |
| `hooks/session-start.sh` + `session-start.py` | `index.ts` `before_agent_start` handler | The SessionStart banner becomes a once-per-session injected message (customType `handoff-banner`), on the session reasons the original bannered (startup/resume/new/fork; not reload). Same 16,000-char cap and truncation marker. |
| `skills/handoff/SKILL.md`, `skills/recall/SKILL.md`, commands | `prompts/handoff.md`, `prompts/recall.md` + `handoff_save`/`handoff_recall` tools | The skill's "compose and write" flow becomes two typed tools (the agent composes the prose; the tools own path resolution, state capture, atomic write, and freshness) plus Pi prompt templates for `/handoff` and `/recall`. |

## Storage location change (deliberate)

The original stores notes under `~/.claude/handoff/` (Claude Code's home).
The port stores them under `~/.pi/agent/handoff/` — Pi's home area — so the
note is private to the Pi runtime and independent of any host's internal
slugs. `HANDOFF_DATA_DIR` overrides the base (same variable name as the
original). Notes saved by the original plugin are NOT auto-migrated (they
live in a different home dir); move them with a one-time
`cp -r ~/.claude/handoff ~/.pi/agent/handoff` if desired. The in-package
legacy-key migration (repo-root key → remote key) is preserved.

## Retained behavior (non-negotiables carried over)

- Identity keying, not cwd: separate clones of the same remote share one
  note; linked worktrees of a local repo share one note.
- The note is the live resume point: overwrite in place, never append.
- Frontmatter is the only writer/reader pair (meta writes, freshness reads);
  keys stay flat.
- Freshness is informational, never blocking; legacy notes never crash.
- Writes are atomic (the port tightens the original's plain `Write` to
  tmp + rename, mode 0600).

The original plugin's tests (`tests/test-handoff-path.sh`,
`tests/test-handoff-freshness.sh`, `tests/test_hook_safety.py`) were not
ported; this package ships its own node suite (`tests/run-tests.mjs`)
covering the key resolver, meta capture, freshness flags, save/read
plumbing, and the extension factory surface.

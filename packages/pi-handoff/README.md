# pi-handoff

Durable cross-session, **cross-checkout** project handoff notes — as a native
Pi extension. A "resume point" that survives the per-session git worktrees
and separate local clones many workflows spin up.

Status: **default** — registered by the bundle (`packages/pi-handoff/index.ts`
in the root `package.json`, plus the `handoff`/`recall` prompt templates).

Ported from the `handoff` plugin in `fakoli/fakoli-plugins` (MIT, same
author) — see [UPSTREAM.md](UPSTREAM.md).

## The problem it fixes

Some setups create a **new git worktree or clone per session**. A handoff
written to a checkout-local file (e.g. `<cwd>/.remember/`) is thrown away
with that checkout, or hidden from the next session in a different clone.

`pi-handoff` stores the note keyed by the normalized `origin` remote when one
is available, so separate clones of the same repo resolve to the **same**
handoff file. Local repos without a remote fall back to the **git common
dir** (`git rev-parse --git-common-dir`), which keeps linked worktrees
sharing one note.

## Storage

- `~/.pi/agent/handoff/<repo-key>/handoff.md` — private (your home dir, not
  the repo), project-scoped, independent of any host's internal slugs
- `<repo-key>` = a readable hint (repo basename) + a 12-char hash of the
  stable project identity (normalized remote, or repo root for local repos)
- `HANDOFF_DATA_DIR` overrides the base directory
- One-time legacy migration: notes keyed by repo root (pre-remote-keying)
  are copied to the remote-keyed file when the new file is empty

## Public interface

### Tools

| Tool | Purpose |
|---|---|
| `handoff_save` | Save/refresh the note. Params: `prose` (the composed note body), `summary?` (one-line seed, placed first), `project?` (default cwd). The state frontmatter (branch, HEAD, dirty count, optional anvil claim snapshot) is captured automatically; writes are atomic (tmp + rename, 0600). |
| `handoff_recall` | Show the note's prose plus a staleness report: note age vs `HANDOFF_MAX_AGE_DAYS` (default 14), branch moved, HEAD advanced vs diverged (`merge-base --is-ancestor`), and recorded anvil claims no longer active. Informational, never blocking; legacy notes (no frontmatter) report "freshness unavailable". |

### Prompts

- `/handoff [summary]` — drive the save flow: read the previous note (preserve
  open items), compose a scannable note (**Resume** / **Open threads** /
  **Recently shipped** / **Gotchas**), save it, confirm.
- `/recall` — drive the recall flow: show the note, surface every STALE flag
  prominently, offer to act on the top Resume item adjusted for staleness.

### Session-start banner

At session start (startup/resume/new/fork), the saved note for the session's
project is injected **once** as a banner message, capped at 16,000 chars with
a truncation marker — so a fresh session in another clone picks up exactly
where the previous one left off. The banner labels the content as
historical data to verify before acting.

## Effects and boundaries

- **Writes:** the one handoff file under `~/.pi/agent/handoff/` (atomic,
  0600) and its key directory (0700). Nothing is written into the repo.
- **Reads:** `git rev-parse` / `git status` / `git remote` /
  `git merge-base` (5 s timeouts, best-effort) and, only when the `anvil`
  CLI exists, `anvil status --json` (15 s timeout, silent on failure).
- **Network:** none.
- **Complements durable memory:** memory is for durable facts/preferences;
  the handoff is "where we are right now."

## Verification

```bash
npm test --workspace pi-handoff
```

Offline node suite (`tests/run-tests.mjs`): key resolution (remote vs
local-repo vs non-git, physical-path canonicalization, legacy migration,
key-hash parity with `git hash-object`), frontmatter parsing, meta capture
(degrades cleanly outside a git repo), freshness flags (fresh, branch
moved, HEAD advanced, diverged, stale note age, legacy note), save/read
plumbing (atomic write, previous-note preservation, empty-save refusal),
and the extension factory's tool/registration surface. No network, no anvil
state required. Live smoke test: `/handoff` in one clone, open a second
clone of the same remote, `/recall` — same note.

## Disable, upgrade, and rollback

- **Disable:** deselect the extension in `pi config` (or the object-form
  settings entry with `"extensions": []`) — the banner and tools go away;
  stored notes remain on disk, untouched.
- **Upgrade/rollback:** bump the bundle pin. Stored notes are plain
  Markdown and remain readable by any version; the key scheme (hint +
  12-char blob-hash prefix) is stable.

## Provenance

Original plugin: `fakoli/fakoli-plugins` `plugins/handoff` (MIT). Native
port (TypeScript modules, native tools, Pi prompt templates) — see
[UPSTREAM.md](UPSTREAM.md) for the per-file delta table and the deliberate
`~/.claude/handoff` → `~/.pi/agent/handoff` storage move.

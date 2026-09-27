# Provenance ledger

## Ported source

Source: `fakoli/fakoli-plugins`, `plugins/anvil-pulse` (MIT, same author).
The anvil-pulse plugin ships a dependency-free Node dashboard server
(`scripts/server.cjs`), a self-contained dashboard page
(`scripts/dashboard.html`), and a bash toolkit (`start-server.sh`,
`check-server.sh`, `stop-server.sh`, `process-identity.sh`) plus a skill and
a `/pulse` command.

This package is a **native port**, not a verbatim import:

| Original | Port | Divergence |
|---|---|---|
| `scripts/server.cjs` (CJS) | `src/server.mjs` (ESM) | Mechanical CJS→ESM (`require`→`import`, `__dirname`→`import.meta.url`); `classifyClaim` exported for direct use. All logic — anvil-bin resolution (incl. Windows `cmd.exe` verbatim shim handling), status cache, events.jsonl discovery + tail, staleness classification, HTTP routes, the single-line `server-started` JSON contract — is unchanged. |
| `scripts/dashboard.html` | `src/dashboard.html` | Verbatim (237 lines, self-contained page, no network). |
| `scripts/start-server.sh`, `check-server.sh`, `stop-server.sh`, `scripts/process-identity.sh` | `src/process.ts` | TypeScript port of the bash toolkit: one-dashboard-per-project, PID-file + command-line identity guard (the PID is only signalled while it still looks like *this* server for *this* project), 5 s start wait + 2 s survival window, stale-pid cleanup. The bash scripts' foreground/auto-foreground behavior (CODEX_CI / MSYS reapers) is replaced by the extension spawning the server detached, so the dashboard outlives the pi session; a "was killed" failure tells the operator to run the server in a persistent terminal. `process-identity.sh`'s `ps`-based check is kept for POSIX; on native Windows the guard degrades to *never verified, never signalled* (the original relied on Git Bash). |
| `skills/pulse/SKILL.md`, `commands/pulse.md` | `index.ts` tools + `/pulse` command | The skill's workflow (verify anvil project → start → hand over the URL → read `/api/pulse` to answer "is it stuck?") becomes four typed tools (`anvil_pulse_start/check/stop/read`) and a `/pulse [start\|stop\|status\|read]` command, plus a TUI status widget. The optional Claude Code statusline segment is not ported: Pi has no statusline surface; the TUI widget covers the operator-visibility role. |

## Retained behavior (non-negotiables carried over)

- Read-only over anvil state: `anvil status` is a read verb, `events.jsonl`
  is opened read-only; the dashboard never opens `state.db` for writing.
- Binds `127.0.0.1` by default; sends nothing externally.
- PID-recycling guard: a stale pid file is cleaned, an unrelated process is
  never signalled.
- Staleness thresholds (quiet 300 s / wedged 900 s) remain env-tunable
  (`PULSE_QUIET_SECONDS`, `PULSE_WEDGED_SECONDS`) and per-request
  (`/api/pulse?quiet_seconds=&wedged_seconds=`).

The original plugin's tests (`tests/test-server.sh`,
`tests/test_process_identity.py`) were not ported; this package ships its own
node suite (`tests/run-tests.mjs`) covering the same ground against the ported
server and process layer.

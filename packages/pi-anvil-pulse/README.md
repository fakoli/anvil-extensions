# pi-anvil-pulse

Live operator dashboard for long autonomous [anvil](https://github.com/fakoli/anvil)
runs — as a native Pi extension. One local web page answers the question every
multi-hour agent run eventually raises: **is this still going, or is it wedged?**

Status: **default** — registered by the bundle (`packages/pi-anvil-pulse/index.ts`
in the root `package.json`). It only does anything when *you* start a
dashboard; it never touches anvil state.

Ported from the `anvil-pulse` plugin in `fakoli/fakoli-plugins` (MIT, same
author) — see [UPSTREAM.md](UPSTREAM.md).

## What it shows

- **Task rollups** — ready / in progress / needs review / blocked / done
- **Active claims** — task, actor, latest `progress.noted` phase, elapsed time,
  live lease countdown, time since last observed event
- **Staleness per claim** — `healthy` / `quiet` / `possibly-wedged` /
  `lease-expired`, computed from heartbeat evidence in the event stream
- **Event feed** — the tail of anvil's append-only `events.jsonl`

The page live-updates every ~2.5 s. It is dependency-free (Node stdlib only),
binds `127.0.0.1`, and sends nothing externally.

## Requirements and setup

- `node` (any recent LTS) — the dashboard server is a spawned Node process
- the `anvil` CLI on PATH (or pass `anvilBin`) for the status rollups; without
  it the dashboard degrades to the event feed only
- an anvil-initialized project (`anvil status --json --cwd <project>` exits 0)

No install step: the package ships with the bundle. Add `.anvil-pulse/` to the
project's `.gitignore` (pid/log files live there).

## Public interface

### Tools

| Tool | Purpose |
|---|---|
| `anvil_pulse_start` | Start the dashboard for a project (default: session cwd). Params: `project`, `port`, `stateDir` (explicit anvil state dir containing `events.jsonl`; default auto-discovery of `<project>/.anvil`, `<project>/bin/.anvil`, then the exact path-hashed workspace under `~/.anvil/workspaces/`), `host`, `urlHost`, `anvilBin`. Returns the URL. One dashboard per project: a running verified server is replaced. |
| `anvil_pulse_check` | Report whether the dashboard is running for a project. The recorded PID is verified to belong to this package's server for this project before it is trusted; unrelated node processes are never touched. |
| `anvil_pulse_stop` | Stop the dashboard (identity-guarded: SIGTERM, 2 s grace, SIGKILL only while still verified; stale pid files are cleaned without signalling anyone). |
| `anvil_pulse_read` | Read the current pulse (claims, staleness, last activity, newest event, warnings) from the running dashboard. Read-only; requires a running dashboard — it does not start one. Use it to answer "is the run stuck?" without a browser. |

### Command

`/pulse [start|stop|status|read] [project]` — default verb is `start`.

### TUI widget

While a dashboard is running for the session's project, a one-line footer
widget shows `pulse: T001 healthy · T002 quiet · T003 lease-expired` (polling
`/api/pulse` every 5 s). It clears itself when the dashboard stops.

### Server environment (advanced)

`PULSE_QUIET_SECONDS` (default 300), `PULSE_WEDGED_SECONDS` (default 900),
`PULSE_STATUS_TTL_MS` (default 2000), `PULSE_HOST`, `PULSE_URL_HOST`,
`PULSE_PORT`, `PULSE_ANVIL_BIN`, `PULSE_STATE_DIR`. Staleness thresholds can
also be retuned per request: `/api/pulse?quiet_seconds=600&wedged_seconds=1800`.

## Effects and boundaries

- **Reads:** `anvil status --json` (a read verb, 2 s result cache) and the tail
  of `events.jsonl` (opened read-only, 256 KB tail, size+mtime-cached). It
  never opens `state.db` for writing — safe next to a live run (WAL).
- **Writes:** `<project>/.anvil-pulse/server.pid` and `server.log` only.
- **Network:** a `127.0.0.1` HTTP server on a random high port (or your
  `port`); nothing leaves the machine.
- **Process lifecycle:** the server is spawned detached, so it outlives the pi
  session; stop it with `anvil_pulse_stop` / `/pulse stop`. The start path
  verifies the server survived a 2 s window and reports a "was killed" error
  (with the persistent-terminal fallback command) if the environment reaps
  detached processes.

## Verification

```bash
npm test --workspace pi-anvil-pulse
```

Offline node suite (`tests/run-tests.mjs`): the server is spawned against a
fake `anvil` shim and fixture `events.jsonl` (stale claim classification,
threshold retuning, warnings, 404/405 handling), the process layer is exercised
end-to-end (start/check/stop, PID identity guard, stale/foreign pid cleanup),
and the extension factory's registration surface is checked. No live anvil
project, network, or anvil state is required. Live smoke test: start a real
anvil run, `anvil_pulse_start`, open the URL, watch a claim go quiet.

## Disable, upgrade, and rollback

- **Disable:** deselect the extension in `pi config`, or set the object-form
  settings entry with `"extensions": []` for this package — the dashboard
  server only ever runs when a tool/command starts it, so disabling the
  extension fully removes the capability.
- **Upgrade/rollback:** bump the bundle pin; the package carries no persistent
  state of its own (`.anvil-pulse/` pid/log files are ephemeral and safe to
  delete).

## Provenance

Original plugin: `fakoli/fakoli-plugins` `plugins/anvil-pulse` (MIT). This is a
native port (ESM server, TypeScript process layer, native tools) — see
[UPSTREAM.md](UPSTREAM.md) for the per-file delta table.

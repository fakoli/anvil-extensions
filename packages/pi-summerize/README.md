# pi-summerize

> **Not Feynman's `/summarize`.** The command is `/commentary`. Feynman's
> `/summarize` summarizes an *external research source* (URL/PDF/file) into a
> durable `outputs/<slug>-summary.md` artifact with RLM windowing. pi-summerize
> has a different contract: it automatically summarizes *this session's recent
> turns* into an ephemeral one-paragraph widget — no files written, no external
> input, silent in JSON/print mode.

A **small prose commentary after the agent goes idle** — companion to
`pi-insights` (which owns the deterministic single status line). When the agent
settles, pi-summerize asks a **secondary model** for a one-paragraph commentary
on what just happened and renders it as a dim widget **below the editor**.

```
┌ pi-summerize ───────────────────────────────────────────────┐
│ Tests are green after two rounds of fixes; the failing       │
│ serialization case is covered. Next step is committing the   │
│ package and opening the draft PR.                            │
└──────────────────────────────────────────────────────────────┘
```

## How it works

- **Trigger** — `turn_end` counts turns; `agent_settled` (fully idle) evaluates:
  at least one completed turn since the last commentary, the minimum interval
  elapsed, and real tool activity in the branch (a forced `/commentary` bypasses
  all three).
- **Observation** — the last ~8 conversation turns are collected from the
  session branch (text trimmed, per-entry and total char-capped) plus activity
  counts (tool calls / edits / failing calls) over **only the entries newer
  than the last consumed cursor** — no lifetime double-counting. Bounded, no
  I/O.
- **Commentary call** — one fire-and-forget secondary-model call, mirroring
  pi-condense's call discipline: pre-stream auth resolution, seat `baseUrl`
  override, idle-stall + wall-clock-ceiling aborts, classified outcomes
  (`ok` / `auth` / `unusable` / `transient`) instead of throws.
- **Fallback** — if the model call fails, the widget falls back to a
  deterministic one-line activity summary, so the widget is never empty after
  real activity. A notify explains the degradation once per degradation
  episode (recovery re-arms it), not per failure. Superseded attempts (new
  activity mid-flight) drop their result and **restore their consumed
  activity**, so the next settle re-offers old + new together — nothing is
  silently lost.
- **Rendering** — TUI: component-factory widget (`pi-tui` `Text`) so the
  paragraph wraps to terminal width. RPC: plain string lines (word-wrapped) —
  RPC `setWidget` ignores factories. The paragraph replaces the previous one;
  it is not chat content.
- **Contract** — observational and fire-and-forget: never mutates tool
  results, never injects LLM-visible context, never writes memory, never
  summarizes tool output for later reuse (pi-condense's domain). In print/JSON
  mode it is fully silent (no model calls, no output).

## Config (environment)

| Variable | Default | Meaning |
|---|---|---|
| `PI_SUMMERIZE` | `on` | `off` disables everything |
| `PI_SUMMERIZE_MODEL` | `default` | `provider/model-id` for commentary. Recommended for fleet setups: `anvil/llm.secondary` so commentary never touches the primary model. `default` uses the session model. |
| `PI_SUMMERIZE_MIN_INTERVAL_SECONDS` | `120` | minimum seconds between emissions (0–3600) |
| `PI_SUMMERIZE_TIMEOUT_SECONDS` | `45` | streaming wall-clock ceiling per call; auth resolution is excluded (5–600) |
| `PI_SUMMERIZE_IDLE_TIMEOUT_SECONDS` | `20` | stall ceiling, reset on every stream event (2–300) |
| `PI_SUMMERIZE_MAX_INPUT_CHARS` | `6000` | hard cap on the observation payload (500–100000) |
| `PI_SUMMERIZE_MAX_OUTPUT_CHARS` | `700` | hard cap on the rendered paragraph (100–4000) |

## Command

`/commentary` — **settings dialog** (TUI): on/off, model (validated against
the registry), minimum interval, and persistence scope (user file,
session-only, or reset). Esc abandons without changes.
`/commentary now` — compose commentary now (bypasses throttle and gate).
`/commentary on|off` — session-local control (a new session starts on).
`/commentary status` — model, last attempt vs last emission, last failure,
current paragraph.

## Settings persistence

Layered (later wins): defaults → `PI_SUMMERIZE_*` env → `~/.pi/agent/pi-summerize.json`
(user) → `.pi/pi-summerize.json` (project) → session overrides from the
dialog. File keys: `enabled`, `model`, `minIntervalSeconds`,
`timeoutSeconds`, `idleTimeoutSeconds`, `maxInputChars`, `maxOutputChars`.
Unknown keys are reported, never silently ignored. Writes are atomic and
merge (never clobber). Tests sandbox the user file via
`PI_SUMMERIZE_USER_SETTINGS`.

## Modes

- TUI/RPC: widget below the editor.
- JSON/print: silent (no generation, no output).

## Privacy

The commentary call sends only: activity counts and trimmed recent-turn text
already in the session. No file contents, env, or tool outputs beyond what the
transcript already holds. Nothing is persisted — commentary is ephemeral and
cleared on session start.

## Tests

`npm test` (runs `node tests/run-tests.mjs`; plain node + jiti, no bun
required). jiti resolves from the repo's own `node_modules`, falling back to
the pi harness install — override the latter with `PI_INSTALL_DIR` on hosts
where pi lives elsewhere. The model stream is stubbed for all tests — no
network.

## Relationship to other extensions

- `pi-insights` — the terse deterministic activity line; complementary, no
  shared state.
- `pi-condense` — summarizes *for the model's future context*; pi-summerize
  comments *for the human, right now*. Deliberately separate contracts.
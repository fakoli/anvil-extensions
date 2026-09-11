# pi-commentary

> **Not Feynman's `/summarize`.** The command is `/commentary`. Feynman's
> `/summarize` summarizes an *external research source* (URL/PDF/file) into a
> durable `outputs/<slug>-summary.md` artifact with RLM windowing. pi-commentary
> has a different contract: it automatically turns *this session's recent
> activity* into an ephemeral tips widget — no files written, no external
> input, silent in JSON/print mode.

**Usage-pattern tips after the agent goes idle** — companion to
`pi-insights` (which owns the deterministic single status line). When the agent
settles, pi-commentary asks a **secondary model** for one short tip: a
repeated pattern worth systemizing, a friction point, an outlier or
misallocation (disproportionate turns/tokens, debugging-dominant episodes,
generated-but-unused output), or a non-obvious realization grounded in what
was actually observed — the signal a live transcript buries
a live transcript can't show — never a narration of what happened. Rendered as
a dim widget **above the editor**, under the insights line, behind an accent
banner. When the model finds nothing worth surfacing, it answers `NOTHING` and
the widget is dropped for that episode — tips only appear when there is
something to say.

```
┌ pi-commentary (above editor, below insights) ───────────────┐
│ ◆ tips ───────────────────────────────────────              │  ← accent label, dim rule
│ You have rerun the suite 5 times without committing;         │  ← dim tip body
│ smaller commits would make bisecting the flaky               │
│ serialization case trivial.                                  │
└──────────────────────────────────────────────────────────────┘
```

## How it works

- **Trigger** — `turn_end` counts turns; `agent_settled` (fully idle) evaluates:
  at least one completed turn since the last commentary, the minimum interval
  elapsed, and real tool activity in the branch (a forced `/commentary now`
  bypasses all three).
- **Observation** — the last ~8 conversation turns are collected from the
  session branch (text trimmed, per-entry and total char-capped) plus activity
  counts (tool calls / edits / failing calls) over **only the entries newer
  than the last consumed cursor** — no lifetime double-counting. Bounded, no
  I/O.
- **Commentary call** — one fire-and-forget secondary-model call, mirroring
  pi-condense's call discipline: pre-stream auth resolution, seat `baseUrl`
  override, idle-stall + wall-clock-ceiling aborts, classified outcomes
  (`ok` / `quiet` / `auth` / `unusable` / `transient`) instead of throws.
  `quiet` (the model replied `NOTHING`) clears the widget for the episode.
- **Silence on quiet and failure** — when the model has nothing worth
  surfacing (`NOTHING`) or the call fails (`auth` / `unusable` / `transient`),
  the widget is cleared for the episode: an empty optional widget is less
  distracting than filler, and insights already owns activity counts. Only
  actionable config problems (`auth`) notify — once per degradation episode
  (recovery re-arms it); `/commentary status` always records the failure.
  Superseded attempts (new activity mid-flight) drop their result and
  **restore their consumed activity** — even when the stale result lands
  before the next turn — so the next settle re-offers old + new together;
  nothing is silently lost. The attempt clock is never rolled back.
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
| `PI_COMMENTARY` | `on` | `off` disables everything |
| `PI_COMMENTARY_MODEL` | `default` | `provider/model-id` for commentary. Recommended for fleet setups: `anvil/llm.secondary` so commentary never touches the primary model. `default` uses the session model. |
| `PI_COMMENTARY_MIN_INTERVAL_SECONDS` | `120` | minimum seconds between attempts — the attempt-rate floor (0–3600). Stamp is at launch; superseded attempts do not roll it back. |
| `PI_COMMENTARY_TIMEOUT_SECONDS` | `45` | streaming wall-clock ceiling per call; auth resolution is excluded (5–600) |
| `PI_COMMENTARY_IDLE_TIMEOUT_SECONDS` | `20` | stall ceiling, reset on every stream event (2–300) |
| `PI_COMMENTARY_MAX_INPUT_CHARS` | `6000` | hard cap on the observation payload (500–100000) |
| `PI_COMMENTARY_MAX_OUTPUT_CHARS` | `700` | hard cap on the rendered paragraph (100–4000) |

## Command

`/commentary` — **settings dialog** (TUI): on/off, model (validated against
the registry), minimum interval, and persistence scope (user file,
session-only, or reset). Esc abandons without changes.
`/commentary now` — compose commentary now (bypasses throttle and gate).
`/commentary on|off` — session-local control (a new session starts on, unless
a persisted file keeps it off).
`/commentary status` — model, last attempt vs last emission, last failure,
current paragraph.

## Settings persistence

Layered (later wins): defaults → `PI_COMMENTARY_*` env → `~/.pi/agent/pi-commentary.json`
(user) → `.pi/pi-commentary.json` (project) → session overrides from the
dialog. File keys: `enabled`, `model`, `minIntervalSeconds`,
`timeoutSeconds`, `idleTimeoutSeconds`, `maxInputChars`, `maxOutputChars`.
Unknown keys are reported, never silently ignored. Writes are atomic and
merge (never clobber). Tests sandbox the user file via
`PI_COMMENTARY_USER_SETTINGS`.

## Modes

- TUI/RPC: widget above the editor, below the insights line.
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
- `pi-condense` — summarizes *for the model's future context*; pi-commentary
  comments *for the human, right now*. Deliberately separate contracts.
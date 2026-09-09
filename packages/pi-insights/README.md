# pi-insights

Claude-Code-style **insight lines** for pi: a short, subtle widget line
reflecting what work the session has actually done — no chat noise, no LLM
calls, no memory writes.

```
🛠 5 edits · 34 tools · 🧪 validation passed after failure
🔀 PR opened · 📦 2 commits
```

## How it works

- **Deterministic activity ledger** — hooks `tool_call` (classification, from
  the command input) + `tool_execution_end` (outcome, via toolCallId) +
  `turn_end`/`agent_settled` (emission + checkpoint). No per-call I/O.
- **Milestone ledger** — durable semantic milestones (commit, PR opened/merged,
  validation passed/failed, infra checks) with semantic dedup keys. Reflection
  on "what we did" comes from milestones, not raw counts.
- **Widget primary** — `ctx.ui.setWidget("pi-insights", lines)`; updates only
  when the rendered text changes. **`/insights` command secondary** — expands
  the widget to recent milestones; `/insights on|off|reset` for session-local
  control.
- **Persistence** — throttled `pi.appendEntry("pi-insights.checkpoint", ...)`
  on the session branch; restored on `session_start` (branch-scoped, so tree
  navigation to before a checkpoint starts a fresh ledger). No sidecar files,
  nothing sent to the LLM.

## Config (environment)

| Variable | Default | Meaning |
|---|---|---|
| `PI_INSIGHTS` | `on` | `off` disables tracking, display, and persistence |
| `PI_INSIGHTS_MIN_INTERVAL_SECONDS` | `60` | minimum seconds between emissions |
| `PI_INSIGHTS_ACTIVITY_THRESHOLD` | `8` | activity points needed to emit |
| `PI_INSIGHTS_LINES` | `1` | widget lines (1-2) |

Activity points: generic tool 1 · successful edit/write 2 · validation run 3 ·
new milestone 6. Emission evaluates at `agent_settled` (preferred), `turn_end`,
and a 120 s fallback during long tool runs; ≥15 min idle resets the pending
window but keeps totals and milestones.

## Modes

- TUI/RPC: widget + notifications.
- JSON/print: silent tracking and checkpointing only.

## Privacy

Persisted checkpoints contain counters, milestone kinds/keys/timestamps, and
validation keys (normalized command digests). Never command text, output,
file contents, env, or assistant messages.

## Coexistence

Observational only: does not mutate tool results or context, does not touch
compaction content, does not write memory, and never reads pruned tool output
(`pi-condense`'s domain). A failed widget/checkpoint operation never fails the
agent turn.
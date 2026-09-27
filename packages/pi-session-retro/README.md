# pi-session-retro

Session retrospectives as a native Pi extension: deterministic token
economy, workflow taxonomy, tool distribution, and interaction-shape
reports over **Pi**, **Claude Code**, and **Codex** session logs — plus an
interactive HTML retro site.

Status: **default** — registered by the bundle (`packages/pi-session-retro/index.ts`
in the root `package.json`, plus the `session-retro` prompt template).

Ported from the `session-retro` plugin in `fakoli/fakoli-plugins` (MIT,
same author) — see [UPSTREAM.md](UPSTREAM.md). The native extension:
first-class parsing of Pi session JSONL, which the original (Claude/Codex
only) did not cover.

## What it does

Turn a session's raw logs into an evaluable retro: where the tokens went
(main-loop vs delegated workflows, cache economy), what workflows ran,
how the human steered, and what to change next time.

The design split is the same as the original plugin: the tool does all
the **deterministic counting**; the **judgment** (interaction analysis,
retrospective, Five Whys, recommendations) is the agent's job, guided by
the `/session-retro` prompt.

## Public interface

One tool, five modes (mirroring the original CLI):

| Mode | Purpose |
|---|---|
| `list` | Browse sessions (Pi + Claude + Codex) with date/runtime/branch/topic breadcrumbs, newest last. `substr` filters by project/worktree path. |
| `find` | Sessions whose **content** mentions a keyword (PR number, feature, file, error), ranked by hit count. |
| `stats` | JSON aggregates for the given session path(s). |
| `report` | Markdown retro skeleton: session shape, token economy (generated vs delegated + cache lines), workflow taxonomy + most-expensive runs, tool distribution, and the human-turn list under "Interaction analysis (fill in)". |
| `html` | Interactive single-page retro site (dark dashboard: KPIs, doughnut, bars, sortable workflow table, timeline). `narrative` embeds a markdown narrative; `writeHtml` saves the site to a file. |

Codex rollout paths auto-expand to sibling rollouts sharing a session_id
(main + subagents), canonical-deduped. Multi-session arcs: pass several
paths — they combine.

### Prompt

- `/session-retro [what]` — drive the full workflow: locate the session(s)
  (any session, not only the current one), detect multi-session arcs,
  generate the deterministic report, write the honest narrative (what went
  well / what went wrong / where we got lucky / Five Whys /
  recommendations), and optionally build the interactive site.

## Pi session parsing (the native part)

Pi session files (`~/.pi/agent/sessions/**/*.jsonl`, session v3) are
parsed natively:

- `usage.input/output/cacheRead/cacheWrite/reasoning` + `cost.total`
- `toolCall` content blocks → tool distribution (Pi's block name, not
  Claude's `tool_use`)
- `subagent` tool calls → agent types + workflow runs (paired the same way
  Codex spawn records are)
- reasoning tokens count as generated output (they are part of
  `totalTokens`)
- `toolResult` records are recognized (no additive counters, matching the
  original's tool_use-not-tool_result counting)

## Effects and boundaries

- **Reads:** local session JSONL only (`~/.pi/agent/sessions`,
  `~/.claude/projects`, `~/.codex/sessions`). `list`/`find` read only the
  top of each file for breadcrumbs. **No network, no provider calls.**
- **Writes:** only when you pass `writeHtml` (the site file).
- **Cost:** none — pure local file processing.

## Verification

```bash
npm test --workspace pi-session-retro
```

Offline node suite (`tests/run-tests.mjs`): synthetic Pi/Claude/Codex
fixtures — parsers (usage accounting, toolCall counting, subagent
workflows, Codex fork classification), aggregate (fork exclusion,
integrity warning, workflow token-availability semantics), report
rendering (md + html data embedding), discovery (list/find), and the tool
surface. No network. Live smoke test: `session_retro({mode:"list"})` then
`report` on the newest Pi session.

## Disable, upgrade, and rollback

- **Disable:** deselect the extension in `pi config` — the tool and
  prompt go away; session logs are only ever read.
- **Upgrade/rollback:** bump the bundle pin. No persisted state; reports
  are regenerated on demand.

## Provenance

Original plugin: `fakoli/fakoli-plugins` `plugins/session-retro` (MIT).
Native port (TypeScript modules, native Pi parser, one typed tool) — see
[UPSTREAM.md](UPSTREAM.md) for the per-file delta table and the
deliberate simplifications.

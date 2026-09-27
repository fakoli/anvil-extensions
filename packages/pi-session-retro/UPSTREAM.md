# Provenance ledger

## Ported source

Source: `fakoli/fakoli-plugins`, `plugins/session-retro` (MIT, same
author). The plugin ships `scripts/session_stats.py` — a 966-line,
stdlib-only Python CLI with five modes (`list`, `find`, `stats`,
`report`, `html`) that parses **Claude Code** (`~/.claude/projects`) and
**Codex** (`~/.codex/sessions`) session JSONL and renders deterministic
retro reports; the skill/command leave the narrative judgment to the
model.

This package is a **native port**, not a verbatim import:

| Original | Port | Divergence |
|---|---|---|
| `parse_claude` | `src/parse.ts` `parseClaude` | Faithful: same fields (`out/inp/cc/cr`, tool_use counts, Skill/Agent/Workflow hooks, `<usage>` workflow blocks, user-turn filtering). |
| `parse_codex` | `src/parse.ts` `parseCodex` | Faithful: session_meta identity rules (first-meta-only identity, same-ID resume vs foreign-ID fork classification), `token_count` cumulative usage, `spawn_agent` workflow pairing, encrypted-prompt detection. |
| — (not in original) | `src/parse.ts` `parsePi` | **New native capability:** Pi session JSONL (session v3 header, `message` records, `usage.{input,output,cacheRead,cacheWrite,reasoning,cost}`, `toolCall` blocks, `toolResult` records, `subagent` dispatches as workflow runs). Reasoning tokens count as generated output (they are part of `totalTokens`). |
| `aggregate` | `src/aggregate.ts` | Faithful: Codex spawn↔subagent pairing, forked-rollout exclusion from every additive sum, workflow token availability semantics (unknown ⇒ null, not 0), integrity warning when all sources were excluded. Pi sessions flow through the non-codex path. |
| `report_md` | `src/report.ts` `reportMd` | Faithful: same sections, ASCII bars, cache-economy notes, "fill in" scaffolds. |
| `md_to_html`, `HTML_TEMPLATE`, `report_html` | `src/report.ts` | The interactive single-page template is ported **verbatim** (MIT code, same author); data is embedded with `<` escaped to prevent `</script>` breakout. |
| `_head`, `_session_rows`, `cmd_list`, `cmd_find` | `src/discover.ts` | Ported with Pi support: discovery now globs `~/.pi/agent/sessions` in addition to the Claude/Codex dirs; `_head` reads Pi session headers and first user messages. The `↳` marker is rendered as `->` (the original's own narrow-console fallback). |
| `expand_paths` | `src/expand.ts` `expandPaths` | Faithful: Codex rollouts expand to siblings sharing a session_id, canonical (realpath) dedupe, subagent-first sort order. Pi/Claude files pass through. |
| skill + command | `prompts/session-retro.md` + `session_retro` tool | The five CLI modes become one typed tool; the skill's workflow (locate → detect arc → deterministic report → model-written narrative → optional site) becomes the prompt. The "narrative is the model's job" design is preserved. |

## Deliberate simplifications

- `scan_agent_types` (Claude workflow subagent `.meta.json` sidecars) is
  not ported: Pi sessions carry no such sidecars and the Claude path is
  secondary; the `agent_types` counter still covers `Agent`/`subagent`
  tool calls from the session logs themselves.
- The Windows console-encoding guards (`_print_safe`, stdout
  reconfigure) are dropped: the tool returns strings, it doesn't print.
- `list` shows the most recent 40 sessions (same as the original).

## Verification

The original plugin's Python test suite was not ported; this package ships
`tests/run-tests.mjs` (offline, no network): synthetic Pi/Claude/Codex
fixtures covering the parsers, aggregate (incl. fork exclusion +
integrity warning), report rendering, discovery, and the tool surface.
Live smoke test: `session_retro({mode:"list"})` in a Pi session, then
`report` on the newest Pi session file.

# Anvil Extensions 0.14.0

Adds three native Pi extension packages ported from the private
`fakoli/fakoli-plugins` repository (same author, MIT): `pi-anvil-pulse`,
`pi-handoff`, and `pi-session-retro`. The bundle now contains 19 packages
and 17 registered extension entrypoints.

- **pi-anvil-pulse** — a live, read-only observability dashboard for an Anvil
  project (claims, task phases, event feed, per-task staleness). Four tools
  (`anvil_pulse_start` / `_check` / `_stop` / `_read`), a `/pulse` command,
  and an optional TUI widget. The dashboard is a local `127.0.0.1` HTTP
  server; every check/stop verifies the recorded PID is this package's
  server for this project before signalling it. One dashboard per project;
  state lives under `<project>/.anvil-pulse/`.
- **pi-handoff** — durable cross-session, cross-checkout handoff notes keyed
  by project identity (normalized `origin` remote, or git common dir for
  local repos), so separate clones and linked worktrees share one note.
  `handoff_save` / `handoff_recall` tools, state-capture frontmatter with
  staleness checks, a once-per-session resume banner, and `/handoff` +
  `/recall` prompts. Notes are written atomically (0600) under
  `~/.pi/agent/handoff/<repo-key>/` (`HANDOFF_DATA_DIR` overrides); nothing
  is written into the repository.
- **pi-session-retro** — session retrospectives over **Pi**, Claude Code,
  and Codex session logs. One `session_retro` tool with `list`, `find`,
  `stats`, `report`, and `html` modes plus a `/session-retro` prompt. The
  port adds a native Pi session parser (the original plugin was
  Claude/Codex only); token accounting, Codex fork exclusion, and the
  integrity guard are faithful to the original. `report` renders a
  deterministic markdown skeleton; `html` renders a self-contained
  interactive site with an optional model-written narrative. Reads only
  local session JSONL; no network, no provider calls.

All three are registered in the root `package.json` (`pi.extensions` and
`pi.prompts`); each ships an `UPSTREAM.md` provenance ledger, package
README, and an offline test suite (66→69 tests total across the three).

## Verification and limits

The three new suites pass offline (no network, no provider calls): the
pulse suite starts and stops a real local dashboard server against a
fixture project; the handoff suite exercises key resolution (remote,
worktree, non-git, symlinked, legacy migration), note round-trips, and
freshness; the retro suite covers the Pi/Claude/Codex parsers, aggregate
semantics (fork exclusion, token availability, integrity warning), report
rendering, and discovery. A live smoke test ran `session_retro` report
over a real Pi session. The full bundle matrix (including the pre-existing
`bun`-based `pi-condense` suite) runs green in CI. The native-Windows
pulse degradation (liveness-only verification, no signalling) is
documented but not exercised in CI. An adversarial review of the diff
produced a ship-with-fixes verdict; all ten findings (restart URL
staleness, symlink keying, Windows start degradation, lockfile, security
doc, tool-name docs, banner keying, double prose strip, provenance table,
HTML sentinel substitution) are fixed and regression-tested in this
release.

## Upgrade and rollback

Install `git:github.com/fakoli/anvil-extensions@anvil-v0.14.0` and start a
fresh Pi session. The three new extensions and their prompts load with the
bundle; no existing host pin or running session is changed by publication,
and no optional/candidate resource is activated.

To disable, deselect the new resources with `pi config`. To roll back,
install `git:github.com/fakoli/anvil-extensions@anvil-v0.13.0` and start a
fresh session. Handoff notes under `~/.pi/agent/handoff/` and pulse state
under `<project>/.anvil-pulse/` are plain files and are retained; no
migration is needed in either direction.

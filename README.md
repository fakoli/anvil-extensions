# Anvil Extensions

[![CI](https://github.com/fakoli/anvil-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/fakoli/anvil-extensions/actions/workflows/ci.yml)

An opinionated, battle-tested bundle of [pi coding agent](https://github.com/badlogic/pi-mono) extensions — installed as **one pinned unit**, tracked as one auditable surface.

```
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.13.0
```

- **16 packages · 14 registered extension entrypoints · 1 pin · atomic updates** — every host runs the same reviewed tree; `pi-observations` and `pi-browser` remain inert until a fresh session explicitly uses their opt-in flags
- **Content-hashed lockfile** — transitive dependencies are pinned by SHA-512 integrity
- **Install-script allowlist** — package postinstall scripts run only when approved
- **Tag-protected releases** — release tags are immutable via repository rulesets

## Why a bundle

Most extension ecosystems distribute one package at a time, and each one floats independently. This repo takes the opposite position: your agent toolchain is a *tracked artifact*. Everything the agent can do — and everything its dependencies can do — lives in one repository, one lockfile, one version, one review history.

That gives you:

- **Reproducibility** — `anvil-v0.13.0` means the same bytes on every machine, resolved through a committed lockfile, not fresh registry lookups.
- **A small blast radius** — a compromise or regression rolls back by pointing the pin at the previous tag.
- **One audit surface** — dependency changes, fork diffs, and provenance all flow through one PR history.

If you maintain a fleet of agent hosts, this packaging model is the point. If you want one or two extensions, they still work — install the bundle and load only what you need (see [Managing](#managing-install-update-disable)).

## What's inside

| Package | What it does |
|---|---|
| [pi-condense](packages/pi-condense/) | Summarizes completed tool-call batches, replaces raw outputs with stubs, and recovers originals on demand via `context_tree_query` |
| [pi-insights](packages/pi-insights/) | Deterministic, privacy-safe activity ledger rendered as a subtle session widget |
| [pi-commentary](packages/pi-commentary/) | A small secondary-model prose commentary rendered below the editor when the agent goes idle |
| [pi-subagents](packages/pi-subagents/) | Subagent delegation: chains, parallel fan-out, forked context, intercom coordination |
| [pi-plan-mode](packages/pi-plan-mode/) | Read-only plan collaboration mode with structured clarification + plan submission |
| [pi-tool-repair](packages/pi-tool-repair/) | Validate-then-repair for common LLM tool-call mistakes before tools execute |
| [pi-permission-system](packages/pi-permission-system/) | Permission enforcement for tool execution |
| [pi-hermes-memory](packages/pi-hermes-memory/) | Persistent memory, SQLite FTS5 session search, secret scanning, procedural skills (863 tests) |
| [pi-sandbox-config](packages/pi-sandbox-config/) | Fail-closed sandbox run-config editing with read-only launch prechecks |
| [pi-nano-banana](packages/pi-nano-banana/) | Image generation as native tools: generate, edit, webpage-style remix, and local optimize |
| [pi-voice-clone](packages/pi-voice-clone/) | Draft and voice-edit prose in the owner's measured voice (`voice_prompt` + `voice_check`) |
| [pi-capability-upgrade](packages/pi-capability-upgrade/) | Candidate-only shipping, guarded documentation, browser verification, and explicit read-only operations resources |
| [pi-brag](packages/pi-brag/) | Turn the current project into a short shareable launch video (`/brag` command + skill + render/poster/doctor tools) |
| [pi-observations](packages/pi-observations/) | Optional bounded PNG/JPEG/WebP/GIF observation mediation for a fresh `--observation` Pi session; registered by the bundle but inert without that flag |
| [pi-browser](packages/pi-browser/) | Optional bounded, read-only public-page observations for a fresh `--browser` Pi session with protected configuration; registered by the bundle but inert without that flag |
| [pi-repo-graph](packages/pi-repo-graph/) | Default-discovered `/skill:repo-graph`: offline system diagrams, repository maps, tables and dependency matrices; Python 3.10+ required when used |

Full catalog — including *why* each exists and how it works — is in [docs/packages.md](docs/packages.md). Fork lineage and what we changed in vendored packages is in [docs/forks.md](docs/forks.md).

## Managing: install, update, disable

**Install** (pins the exact tag):

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.13.0
```

**Update** (bump the pin, then reinstall):

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.13.0
```

**Disable individual resources** without touching the pin — two ways:

1. Interactive: run `pi config`, pick the package, toggle extensions/skills off.
2. Declarative: switch the settings entry from the string form to the object form:

```json
{
  "packages": [
    "pi-condense",
    {
      "source": "git:github.com/fakoli/anvil-extensions@anvil-v0.13.0",
      "extensions": ["./packages/pi-nano-banana/index.ts"],
      "skills": []
    }
  ]
}
```

An empty `"extensions"` array loads nothing from that resource type — the package stays installed but contributes no tools or skills. `pi-observations` is already registered by this bundle, but its mediation remains inert unless a fresh session supplies `--observation`; disabling it for a marked session that still contains images removes its primary media guard, so close that session and start a new unobserved one instead. `pi-browser` is likewise inert unless a fresh session supplies `--browser` and its protected `pi-browser.json` is present. The image and browser workflows are independent; enabling one does not enable the other. The full matrix (global vs project-local, per-resource filtering) is in pi's [settings docs](https://github.com/badlogic/pi-mono).

## Security posture

This repo is maintained under a supply-chain discipline summarized in [docs/security.md](docs/security.md):

- **Pins, not floats** — hosts never install moving targets; releases are immutable tags.
- **Committed lockfile** — every transitive dependency is resolved to an exact version with a SHA-512 integrity hash.
- **Install-script gate** — packages whose postinstall scripts want to run must be explicitly approved.
- **Identity hygiene** — history is identity-scrubbed; contributors should commit with a noreply email (`git config user.email "you@users.noreply.github.com"`).
- **Retroactive scrub gate** — before any release, all history is re-scanned for real names, personal emails, hostnames, and credentials.

## For contributors

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: PRs only, offline test suites must stay green, every package that vendors upstream code carries an `UPSTREAM.md` ledger, and no external product branding in prompts or docs (enforced by test).

## License

MIT — see [LICENSE](LICENSE). Individual vendored packages retain their upstream licenses (MIT), noted per package in `UPSTREAM.md` files.

# Forks and provenance

This bundle mixes three kinds of packages: **verbatim vendored** upstream code (pinned by registry integrity hash), **patched forks** (vendored, then locally changed — never byte-identical), and **original work**. Every package carries an `UPSTREAM.md` ledger beside its code; this document summarizes the deltas that matter.

The rule behind the ledger: if we run code we didn't write, we record exactly what it is, what integrity hash it was imported from, and every line we changed. If we write code ourselves, we say so.

## Vendored verbatim (zero modifications)

These were imported from public registries, verified file-by-file against the registry tarball by SHA-256, and ship unmodified:

- **pi-condense** — from `jjuraszek/pi-condense` (GitHub, MIT), imported at tag v2.10.3, commit `76c2c09b`.
- **pi-subagents** — from the `pi-subagents` npm package v0.36.0. Integrity: `sha512-sW42zSqlMZvvgrbKj0MIksyKkBnsFnzN9Bnibipt0SyCngjx7BQj2GKGjD0wIggRu050u7wxrrzbKvLaikSA5Q==`.
- **pi-plan-mode** — from `@narumitw/pi-plan-mode` v0.31.0. Integrity: `sha512-si1m+6A+afX70q0Iq0xFV7AeGtfgu5hhdwAViVVxGDlP2sSIOnSr83T/xnJPBfOMfNqFKpgtacV8fk4DEpaS9g==`.
- **pi-tool-repair** — from the `pi-tool-repair` npm package v0.1.8. All 7 shipped files identical. Integrity: `sha512-AiV8jtSGZnlqRTPUsSfljMNDa5C0veXDhxAg6lrlTddfAEuc3GsuLjOeJ79p/4rgjlPgwdqCDtZZGLbkl77iww==`.
- **pi-permission-system** — from `@gotgenes/pi-permission-system` v23.0.1. Integrity: `sha512-4QOOyLv3xQjM61sJCTKceHsO7+WwTnhqUr4pGaqgf9dRAAatBBpWVf0LdPds6KVMWILzUI4G3txSKkJ9PtXFUw==`.

Verbatim vendoring is deliberate: updates to these packages are explicit diffs we review, not silent registry floats.

## Patched fork: pi-hermes-memory

**Upstream:** `@schovest/pi-hermes-memory@0.2.2` (MIT), imported via npm tarball with integrity pin `sha512-GJSeu3mPiCKJhYRUKjPPMS9xICUZdxlERY2ch7yVTI4yd6v14Sh23fHDcHfiQOuN++YhVpl5JrFttLvfX6QEpA==` — then **locally patched; not byte-identical to upstream**.

**Divergence (all upstreamed to the fork's own repo first, then vendored):**

- **A — consolidation round-trip fidelity:** auto-consolidation passes raw entries through duck-typed `entriesForTarget`, so metadata survives consolidation round-trips instead of being stripped.
- **B — short-query search:** 1–2 character queries get a scoped `LIKE` fallback; FTS5 trigram indexes cannot serve sequences shorter than 3 characters.
- **C — FTS churn elimination:** metadata-only updates skip the row `UPDATE`; the `memories_au` trigger gained a `WHEN old.content IS NOT new.content` guard, upgraded in place under `BEGIN IMMEDIATE`.
- **Echo-strip:** `encodeEntry` and `normalizeMemoryLookupText` strip trailing metadata comments echoed back from raw entries.
- **Test infrastructure:** the vitest suite was migrated and kept green (47 files).

**Known upstream findings, tracked but not yet fixed here:** `memory-store getAllFailureEntries` (consolidation-prompt metadata gap), error notifies ignored by RPC consumers, `touchMemory` never wired, negative-limit bypass, and a constraint migration in `db.ts:1082` that drops FTS triggers.

## Original work

- **pi-insights** — original, designed as a deterministic activity ledger with a persistent widget (observational only; no provider calls).
- **pi-commentary** — original; the idle-commentary widget with silence-on-quiet/failure semantics and supersession restore.
- **pi-sandbox-config** — original; fail-closed run-config editing cross-checked against the platform validator.
- **pi-voice-clone** — original bridge to a privately-owned style plugin; the repo ships the bridge, not the private corpus.
- **pi-capability-upgrade** — original receipt, documentation guard, and MCP-policy code, plus concise adapted workflow material from the public Fakoli plugin repository. Its `UPSTREAM.md` records the exact source revision and external package integrities.
- **pi-observations** — original Pi extension and package documentation. It imports the neutral `@anvil-serving/observations` owner only through its public owner/PNG exports; its `UPSTREAM.md` and the root lock record the exact merged Serving commit and dependency integrity. Image normalization reuses unmodified `sharp@0.35.4`, already present in the bundle, through dynamic import under Node (a bounded decoder child for embedded Pi); GIF coverage is explicitly first-frame only. Its original media guard accepts shared non-cyclic Pi tool schemas without modifying upstream tools; media, cycles, and traversal limits remain enforced.

## Adapted port: pi-nano-banana

Ported from a private plugin (v1.4.0, same author, MIT) into a native pi extension — a TypeScript rewrite, not a wrapper around the Python original. What the adaptation changed and why:

- **Tools instead of a shell skill.** The plugin exposed a CLI invoked through instructions; the extension registers four typed tools with streaming progress and signal-based cancellation. The model gets a schema, not a README to interpret.
- **Native image rendering.** Results render in the TUI by path; an opt-in `attach` feeds the image back into context for multimodal critique (default off, to keep context lean).
- **Shared configuration.** The extension reads the same config file the plugin used, so defaults stay consistent across tooling.
- **Same non-negotiables, reimplemented:** one billable call per request; no automatic retries; atomic no-clobber publication; key-hygiene (credentials never echoed, never stored in config); 12 MiB / 20 MB / 64 MiB caps; remix page data treated strictly as untrusted reference.
- **A sharp lesson worth its own note:** pi's embedded Bun runtime resolves CJS by-name requires only for packages whose `main` points at the package root; any subdirectory main (sharp's `lib/index.js`) fails from *any* anchor. Native dependencies in pi extensions must load through dynamic `import()` — this cost a debugging session and a few probes to pin down, so it is documented here for the next person.

## Adapted port: pi-brag

Ported from [latent-spaces/brag](https://github.com/latent-spaces/brag) v0.2.2 (MIT) — a Claude Code plugin whose substance is an agent skill — into a pi extension package. The creative workflow (four steps, tones, audio guidance) is upstream's, carried over nearly verbatim; the host glue is new:

- **Commands + tools instead of a plugin command.** `/brag` parses flags and hands the agent a structured kickoff prompt; `/brag-doctor` gives an instant environment check; `brag_doctor`/`brag_render`/`brag_poster`/`brag_fetch_assets` cover the fiddly parts (long renders with streamed progress and timeouts, poster extract + frame-0 bake, one-time asset download).
- **Assets not vendored.** Upstream bundles ~16.5 MB of music/SFX inside the skill; the port ships an empty assets dir plus a fetch tool, and the skill degrades gracefully to a silent video. The cue-analysis Python script (184 KB) is vendored, since the skill's audio path references it directly.
- **Paths generalized.** Upstream hardcodes `~/.claude/skills/brag/assets/`; the port resolves the asset root from the package location at runtime.

## Why vendoring at all

Three reasons: hosts must be able to install without trusting a registry at load time; we patch what we need without waiting on upstream release cycles; and the git history of every vendored change is reviewable. The cost — re-syncing upstream improvements manually — is accepted and tracked in each `UPSTREAM.md`.

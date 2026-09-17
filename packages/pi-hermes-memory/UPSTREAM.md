# pi-hermes-memory — provenance

- Upstream: @schovest/pi-hermes-memory@0.2.2 (schovest/pi-package-mono @ 19c0f80, MIT),
  imported via npm tarball, then **locally patched — NOT byte-identical to upstream**.
- Divergence (all merged 2026-09-09 via fakoli/pi-hermes-memory PR #1, master 3f44283):
  - A: auto-consolidate entriesForTarget → raw entries (duck-typed) — metadata survives
    consolidation round-trips.
  - B: short ASCII literal search (1-2 char queries get the scoped LIKE fallback; FTS5
    trigram cannot index <3 char sequences).
  - C: FTS churn elimination — metadata-only updates skip the UPDATE; memories_au trigger
    gains WHEN old.content IS NOT new.content, upgraded in place (BEGIN IMMEDIATE).
  - Echo-strip: encodeEntry + normalizeMemoryLookupText strip trailing metadata comments
    echoed from raw entries.
  - Test-infra migration: vitest suite (47 files green).
- Open upstream findings (not yet fixed here): memory-store getAllFailureEntries (consolidation prompt metadata gap), error notifies ignored
  by RPC consumers, touchMemory never wired, negative-limit bypass, db.ts:1082 constraint
  migration drops FTS triggers.
- Native dependency: better-sqlite3 (prebuilt binaries; first install needs
  `npm install-scripts approve` per pi's supply-chain gate).
- License: MIT. Fork maintainer: Fakoli.
- Upstream tarball integrity (pin): sha512-GJSeu3mPiCKJhYRUKjPPMS9xICUZdxlERY2ch7yVTI4yd6v14Sh23fHDcHfiQOuN++YhVpl5JrFttLvfX6QEpA==

- 2026-09-12: local watchdog fix keeps forced process-group termination armed
  after the direct child exits; regression covers both parent signal behaviors
  and distinguishes terminated Linux zombies from live descendants.

- 2026-09-12: development-only Pi SDK dependencies aligned to 0.85.1;
  this manifest maintenance does not modify runtime source.

# fakoli/pi-extensions — upstream provenance index

Root manifest (`pi.extensions`) is the activation list: ONLY listed entries load.
Add packages under packages/<name>/ with their own UPSTREAM.md, then add the entry
file to root package.json pi.extensions, commit, and tag a NEW anvil-vX.Y.Z
(never move an existing tag). Registry-integrity hashes live in each package's
UPSTREAM.md; npm tarball imports must re-verify file-by-file on every bump.

| Package | Upstream | Imported | License |
|---|---|---|---|
| pi-condense | github.com/jjuraszek/pi-condense | v2.10.3 (76c2c09, 2026-09-07) | MIT |
| pi-insights | original (this repo) | v0.1.0 (2026-09-09) | MIT |
| pi-subagents | npm:pi-subagents | v0.36.0 verbatim (2026-09-09) | MIT |
| pi-plan-mode | npm:@narumitw/pi-plan-mode | v0.31.0 verbatim (2026-09-09) | MIT |
| pi-tool-repair | npm:pi-tool-repair | v0.1.8 verbatim (2026-09-09) | MIT |
| pi-permission-system | npm:@gotgenes/pi-permission-system | v23.0.1 verbatim (2026-09-09) | MIT |
| pi-hermes-memory | npm:@schovest/pi-hermes-memory@0.2.2 | v0.2.3 — patched fork (PR #1 fixes; NOT verbatim) (2026-09-09) | MIT |
| pi-nano-banana | original (this repo); TS port of fakoli/fakoli-plugins nano-banana-pro v1.4.0 | v0.1.0 (2026-09-12) | MIT |

## Local dependency maintenance — 2026-09-12

The imported runtime source is unchanged by this maintenance. Development-only
Pi SDK dependencies in condense, Hermes memory, permission-system, plan-mode,
subagents, and tool-repair now match the tested Pi 0.85.1 runtime. Their package
manifests therefore carry local changes even where source was imported verbatim.
Tool-repair's Vitest/coverage development pair is pinned to patched 4.1.11.
The lockfile refresh removes vulnerable transitive copies and duplicate old SDKs.
Nano Banana's runtime sharp update is recorded in its own provenance file.

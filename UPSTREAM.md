# fakoli/pi-extensions — upstream provenance index

Root manifest (`pi.extensions`) is the activation list: ONLY listed entries load.
Add packages under packages/<name>/ with their own UPSTREAM.md, then add the entry
file to root package.json pi.extensions, commit, and tag a NEW fakoli-vX.Y.Z
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

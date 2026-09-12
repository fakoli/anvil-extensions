# pi-subagents — upstream provenance

- Upstream: https://www.npmjs.com/package/pi-subagents (registry tarball, version 0.36.0)
- Imported: 2026-09-09, verbatim at import; later manifest divergence recorded below
- Registry integrity: sha512-sW42zSqlMZvvgrbKj0MIksyKkBnsFnzN9Bnibipt0SyCngjx7BQj2GKGjD0wIggRu050u7wxrrzbKvLaikSA5Q==
- Verification at import: installed runtime copy (~/.pi/agent/npm/node_modules/…)
  compared file-by-file (sha256) against the registry tarball — all 157
  shipped files were identical. Runtime source remains unchanged.
- License: MIT (license field only; no LICENSE file in tarball)
- Update procedure: bump version in package.json, re-download the registry
  tarball, re-run the file-by-file comparison, update this file, then tag a
  new anvil-vX.Y.Z. Investigate any mismatch not explained by recorded local changes.

## Local dependency maintenance — 2026-09-12

Only package.json development dependencies changed: Pi SDKs now match 0.85.1.
Runtime source files remain unchanged; the registry integrity above pins the
original upstream tarball, not this locally maintained package manifest.

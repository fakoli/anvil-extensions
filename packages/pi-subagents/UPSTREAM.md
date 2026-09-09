# pi-subagents — upstream provenance

- Upstream: https://www.npmjs.com/package/pi-subagents (registry tarball, version 0.36.0)
- Imported: 2026-09-09, verbatim (no modifications)
- Registry integrity: sha512-sW42zSqlMZvvgrbKj0MIksyKkBnsFnzN9Bnibipt0SyCngjx7BQj2GKGjD0wIggRu050u7wxrrzbKvLaikSA5Q==
- Verification: installed runtime copy (~/.pi/agent/npm/node_modules/…)
  compared file-by-file (sha256) against the registry tarball — all 157
  shipped files identical. Zero code changes in this vendored copy.
- License: MIT (license field only; no LICENSE file in tarball)
- Update procedure: bump version in package.json, re-download the registry
  tarball, re-run the file-by-file comparison, update this file, then tag a
  new fakoli-vX.Y.Z. Treat any file-level mismatch as a supply-chain incident.

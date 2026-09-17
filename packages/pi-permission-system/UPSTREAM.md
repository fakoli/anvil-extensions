# @gotgenes/pi-permission-system — upstream provenance

- Upstream: https://www.npmjs.com/package/@gotgenes/pi-permission-system (registry tarball, version 23.0.1)
- Imported: 2026-09-09, verbatim at import; later manifest divergence recorded below
- Registry integrity: sha512-4QOOyLv3xQjM61sJCTKceHsO7+WwTnhqUr4pGaqgf9dRAAatBBpWVf0LdPds6KVMWILzUI4G3txSKkJ9PtXFUw==
- Verification at import: installed runtime copy (~/.pi/agent/npm/node_modules/…)
  compared file-by-file (sha256) against the registry tarball — all 141
  shipped files were identical. Runtime source remains unchanged.
- License: see LICENSE
- Update procedure: bump version in package.json, re-download the registry
  tarball, re-run the file-by-file comparison, update this file, then tag a
  new anvil-vX.Y.Z. Investigate any mismatch not explained by recorded local changes.

## Local dependency maintenance — 2026-09-12

Only package.json development dependencies changed: Pi SDKs now match 0.85.1.
Runtime source files remain unchanged; the registry integrity above pins the
original upstream tarball, not this locally maintained package manifest.

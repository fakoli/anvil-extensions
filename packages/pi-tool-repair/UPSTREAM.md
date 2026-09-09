# pi-tool-repair — upstream provenance

- Upstream: https://www.npmjs.com/package/pi-tool-repair (registry tarball, version 0.1.8)
- Imported: 2026-09-09, verbatim (no modifications)
- Registry integrity: sha512-AiV8jtSGZnlqRTPUsSfljMNDa5C0veXDhxAg6lrlTddfAEuc3GsuLjOeJ79p/4rgjlPgwdqCDtZZGLbkl77iww==
- Verification: installed runtime copy (~/.pi/agent/npm/node_modules/…)
  compared file-by-file (sha256) against the registry tarball — all 7
  shipped files identical. Zero code changes in this vendored copy.
- License: MIT (license field only; no LICENSE file in tarball)
- Update procedure: bump version in package.json, re-download the registry
  tarball, re-run the file-by-file comparison, update this file, then tag a
  new fakoli-vX.Y.Z. Treat any file-level mismatch as a supply-chain incident.

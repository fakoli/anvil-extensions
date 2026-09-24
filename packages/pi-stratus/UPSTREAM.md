# pi-stratus — upstream provenance

- Package: pi-stratus v0.1.0 (2026-09-24)
- Status: **original (this repo)** — TypeScript engine, not a port
- Source: `fakoli/stratus` dev repo (contract-inspiration only from the
  archify skill; no code copied)
- License: MIT

## Provenance notes

- The engine (src/, bin/, tests/, diagrams/, schemas/, docs/, skills/) is
  synced from the dev repo at the remediation batch U7 state (86 tests
  across 10 suites, tsc clean).
- `index.ts`, `package.json`, `tsconfig.json`, `README.md`, and this file
  are packaging files maintained in this repo — they are NOT synced from
  the dev repo.
- `index.ts` routes render/validate through `compileAnyDiagram` and exposes
  the full 8-preset ladder.
- The archify skill (contract-inspiration only) informed the typed-spec →
  validated-artifact shape; no archify code is included.

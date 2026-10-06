# Anvil Extensions 0.16.0

Updates the existing `pi-repo-graph` package to 0.2.0 using the reviewed
[Repo Graph 0.5.0](https://github.com/fakoli/repo-graph/releases/tag/v0.5.0)
runtime at `4d97cd0f90d1d3ca047cbb3a98f114729059cb1d`. The bundle retains
20 packages and 17 registered extension entrypoints. The native skill remains
`/skill:repo-graph`; no new extension or host resource selection is added.

## Changes

- Readable System cards, stronger contrast, complete source breadcrumbs,
  keyboard navigation, focused file selection and responsive controls.
- Incremental keyword/semantic SQLite search, bounded source synopses,
  cached BGE CPU embeddings and a loopback Search tab with Path prefix.
- Faster mapping and blocked vector scoring from the released upstream runtime.
  Upstream paired AWS/Kubernetes measurements report 42–50% lower fresh mapping
  median and about 29% lower hybrid search median, with unchanged structure and
  ranking fingerprints. These are the upstream measurements, not a new bundle
  performance distribution.
- Optional cached MiniLM CPU reranking and batched Jev shortlist judgments.
  Jev is disabled by default; browser use needs both `--allow-jev` and explicit
  selection. Exports are capped at 32 paths, 900 bytes per file and 48 KiB per
  request. Failures preserve local ranking. The independent `map --jev` role
  labels retain their opt-in and credential permission boundary.
- The old `scripts/build_repo_graph.py [repository]` command remains a map
  compatibility wrapper. The new shared CLI exposes map/index/search/serve.
  Runtime, assets, Python metadata/lock and regression tests are imported
  verbatim; duplicate old assets are removed. The provenance ledger verifies
  all 18 imported files.

## Release dependency gate

The old locked Pi 0.85.1 development runtime shipped a shrinkwrap with known
vulnerable brace-expansion and undici versions. Pi 1.0.4 is an unmodified upstream
test dependency with patched brace-expansion 5.0.12 and undici 8.10.2 and no
published shrinkwrap. A root override makes workspace test/peer references
resolve to the single pinned runtime without patching vendored manifests.
The lock also updates source-map-js to 1.2.2 and smol-toml to 1.9.0. This changes
the bundle's isolated development harness, not an installed host Pi version.

## Verification and limits

The package suite checks 17 Python regressions (two NumPy cases skip without
optional dependencies), Node viewer geometry/navigation and native Pi RPC
skill discovery. Both script interfaces preserve caller-directory execution,
artifacts/cache reuse and keyword search, and reject source-contained output.
The locked optional semantic environment passed all 17 Python tests.
All 15 bundle package suites passed with the pinned Pi 1.0.4 harness, and the
installed dependency audit reported zero vulnerabilities. Hermes' temporary
repository fixtures ran in an isolated temporary filesystem to avoid an
unrelated host Git marker; all 864 Hermes checks passed.

The actual bundled scanner mapped the pinned public AWS source commit
`82532de7103d4dbabe384749cfaf09fc4c0692ad`: 20,370 files, 6,657 directories,
6,944 local import links and 20,370 indexed paths. Complete inventory, tree,
imports, scoped edges and System grouping match the canonical output. Its
viewer/server passed all 21 browser checks without browser errors: all seven
views, source search/focus, prefix scope, breadcrumbs, keyboard and 360px layout.
All 12 System cards fit with minimum title size 14.95 px and checked label
contrast 6.02:1. A hybrid search also ran through the bundled locked environment
against the existing full semantic index without API calls. No Jev calls were
made for this port; the [upstream research and evaluations](https://github.com/fakoli/repo-graph/blob/v0.5.0/evaluations/README.md)
record measured reranking results, costs and misses.

Semantic relevance remains experimental. Jev improved fresh-query hit@5 from
10/16 to 14/16 but did not improve the old Kubernetes set and sometimes worsened
first-result ranks. These small developer-authored sets are not an independent
holdout. Imports are heuristic, System groups are source areas, million-file
support is not qualified, and browser checks are not accessibility certification.
The release requires exact-commit CI, Astra review and the complete clean-room
bundle gate before tagging; artifact download/checksum verification completes
publication.

## Upgrade and rollback

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.16.0
```

Start a fresh session. The skill installs optional CPU dependencies through its
packaged Python lock when meaning search is requested. Re-map an old output to
create its new keyword index, then optionally embed it. Existing source/clones
and artifacts remain retained. No running session or host selection is changed
by publication. Rollback is
`pi install git:github.com/fakoli/anvil-extensions@anvil-v0.15.2`.
Stop an explicitly started viewer process when finished; caches remain local.

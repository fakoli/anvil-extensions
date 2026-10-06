# Anvil Extensions 0.17.0

## One Repo Graph product

Repo Graph is now maintained in its canonical repository for Pi, Codex and
Claude. The bundle installs its pinned 0.6.0 release through the dependency
lock. Copied scanner/search code, viewer assets, skill instructions and product
test suites are removed from `pi-repo-graph`. The workspace retains its original
map-only script, shared CLI wrapper and native Pi integration tests.

The root manifest explicitly discovers the canonical dependency's skill. This
adds no extension entrypoint or model/provider setting. Existing diagram/search
behavior and output formats are preserved. ADRs and polyglot call-analysis
feasibility live with the product; current heuristic imports do not become
verified function calls or business flows through this consolidation.

## Security dependency patch

The two image packages advance their exact Sharp pin from 0.35.4 to 0.35.5
to clear the required audit gate for upstream
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
The patch is an unmodified dependency update; image-tool interfaces and decoder
boundaries remain unchanged.

## Install and migrate

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.17.0
```

Start a fresh Pi session. `/skill:repo-graph` remains the command. If an existing
bundle package entry explicitly filters Repo Graph skills, replace
`packages/pi-repo-graph/skills/**` with
`node_modules/repo-graph-agent/skills/**`. Other resource selections remain
unchanged. Avoid selecting both the standalone product and the bundle skill.

The old `packages/pi-repo-graph/scripts/build_repo_graph.py` and
`scripts/repo_graph.py` paths remain supported. Optional semantic setup resolves
from the canonical installed product; the adapter no longer has its own
Python project or lock. Generated data needs no migration.

## Verification

The canonical dependency was fetched by a fresh `npm ci` from the locked
`v0.6.0` commit `b21a7c19fc3f068d3b0227ba1fa6acd5eda17280`. Native Pi checks
passed on both 1.0.4 and 0.85.1 with isolated settings and no model calls. They
checked canonical skill discovery, compatibility script execution from a caller
directory with spaces, canonical CLI execution, artifacts, keyword search,
cache reuse, source-contained output rejection, missing-dependency failure and
package-local dependency resolution.

The initial full matrix passed 14 of 15 suites; Hermes lacked its native SQLite
binding because that install disabled lifecycle scripts. A normal locked install
restored the binding. Its focused rerun passed all 864 checks in 47 files.
Post-patch image checks passed Nano Banana 39/39 and Observations 23/23; the
canonical Repo Graph native suite passed again. Fresh `npm audit` reported zero
vulnerabilities, and installed Sharp 0.35.5 uses patched librsvg 2.63.2.

The final clean-room full matrix and exact-commit CI remain release gates.
Product algorithm and browser UX checks run in the canonical repository; this
packaging change claims no new timing, search-quality or million-file result.

## Boundaries and rollback

Installation fetches the locked canonical Git product. Optional CPU model setup
and explicit Jev exports retain their documented bounds and authorization rules.
No service, GPU reservation, credentials, selected provider or installed host
Pi pin is changed by publication.

Rollback:

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.16.0
```

Restore the previous explicit skill filter if one was used. Sources, generated
indexes, models, clones and caches remain in place.

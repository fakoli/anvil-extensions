# Anvil Extensions 0.13.0

Adds `pi-repo-graph`, a default-discovered native Pi skill for offline repository
diagrams. The bundle contains 16 packages and 14 registered extension
entrypoints. Repo Graph adds one skill, no extension entrypoint or runtime
library dependency. Python 3.10+ is required when the skill runs; Git is needed
for public HTTPS inputs.

Use `/skill:repo-graph` for the current repository or append a local path/public
HTTPS repository URL. It preserves the caller's working directory and resolves
its scanner and assets from the installed package. Outputs include self-contained
HTML with System, Explore and Data tabs, JSON, and Mermaid. Batching, bounded
source reads, cached imports and paged diagrams keep large maps manageable.
The optional `--jev` request exports at most 16 top-level directory names for
advisory role labels, subject to credential-access permission.

## Verification and limits

The package suite passed five Python scanner regressions, viewer layout/event
checks, import integrity hashes and native Pi 0.85.1 package discovery/RPC bash
execution. Both the locked npm runtime and installed binary were exercised in
isolated temporary configurations. The fixture covers caller paths with spaces,
all five artifacts, repeat cache reuse and rejection of output inside the source.
No model request, live Jev call or browser visual QA was performed for this port.

A local scan of the public Terraform AWS provider checkout accounted for 20,370
files, 6,657 directories and 6,948 aggregated local import links; the repeat
reused all 9,528 supported source files. Import extraction is heuristic and
441 files exceeded the 64 KiB read cap. System groupings describe source areas,
not verified runtime architecture. The full inventory is held in memory.

## Upgrade and rollback

Install `git:github.com/fakoli/anvil-extensions@anvil-v0.13.0` and start a fresh
Pi session. Explicit skill filters must include `packages/pi-repo-graph/skills/**`
to select the new resource. No existing host pin or running session is changed
by publication. The observation, browser and candidate workflows retain their
existing selection and acceptance limits.

To disable, deselect the skill with `pi config`. To roll back, install
`git:github.com/fakoli/anvil-extensions@anvil-v0.12.0` and start a fresh session.
Generated output and caches stay under the user's cache; no migration is needed.

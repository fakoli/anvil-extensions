# Repo Graph for Pi

## Purpose and setup

Repo Graph maps local repositories or public HTTPS Git repositories into
self-contained system diagrams, dependency maps and data views. It is a
**default-discovered skill** in the bundle, loaded on demand. It registers no
extension tools, hooks or background tasks.

Requirements: Pi 0.85.1 (the bundle's tested runtime), Python 3.10+ on `PATH`,
and Git for remote repositories. No pip packages, browser service or API key
are needed for a local scan. Node 24 is needed only for the bundle test suite.

Install the released bundle, then use a fresh Pi session:

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.13.0
```

```text
/skill:repo-graph
/skill:repo-graph /path/to/repository
/skill:repo-graph https://github.com/owner/repository
```

## Interface and views

Pi's native `/skill:repo-graph` loads the workflow; its normal bash tool runs
the packaged Python scanner. An omitted path maps the caller's working
directory. The script and viewer assets resolve from the installed package,
so no checkout path is required. This is a skill, not a `/repo-graph` extension
command. There are no additional tools or prompt templates.

Optional arguments: `--output DIR` selects an output directory outside the
source repository; `--refresh` updates a cached remote clone with a fast-forward
pull; `--jev` opts into advisory component-role labels.

Outputs: `architecture.html`, `graph.html`, `graph.json`, `architecture.mmd`
and `architecture.md`. Open the HTML in a browser; no server is required.
The System tab groups up to 12 source areas, with observed imports and member
directory drilldown. Explore includes card, tree, radial and file-count treemap
layouts. Data includes a sortable table and directed dependency matrix. Filters,
pagination, CSV export and SVG export share the same scan.

## Configuration and boundaries

There is no configuration file. Output, import caches, optional role caches
and shallow remote clones live under `~/.cache/repo-graph/` by default. Repeated
scans replace generated artifacts in the same output directory; do not store
unrelated files there. Source files are never executed or modified. Git inventory
includes nonignored untracked files; hidden paths, common generated directories
and symlink files are excluded. Outside Git, directory walking is used.

The scanner reads at most 64 KiB per supported Go/Python/JavaScript/TypeScript
file in batches of 512 and reuses imports by size and modification time.
Other languages still appear structurally. Views show at most 23 entries plus
a scope card per page and bounded visible links. Full inventory and aggregated
imports remain in JSON. The inventory is held in memory; this is not a streaming
multi-million-file index. Mermaid covers the first root page. Import extraction
is heuristic, and System components are source groupings, not proof of runtime
services, deployment topology or call flow.

Local scanning and the viewer make no provider requests. The Pi agent's normal
skill execution still uses its configured model. HTTPS input invokes Git to
clone or refresh a public repository. Generated data includes repository-relative
paths and import information: review it before sharing.

`--jev` makes at most one TypeSafe System One request (unless roles are already
cached), exporting up to 16 top-level directory names only. This can incur API
cost. It uses `TYPESAFE_API_KEY` from the process environment or the exact named
entry in `~/.env`, without sourcing or displaying that file. Project credential
access rules still apply; opt-in alone does not override them. Failed or timed-out
classification falls back to the local diagram; labels never create edges.

Pi's normal bash permissions and cancellation apply. Cancelling a scan can leave
partial generated artifacts or an incomplete clone. Re-run a local scan to replace
its output; for an incomplete remote clone, remove only the reported cache entry
and retry. The CLI exits nonzero for invalid paths, empty repositories, forbidden
output locations and clone failures. No files are automatically opened or uploaded.

## Verification

From the bundle root:

```bash
npm test --workspace pi-repo-graph
```

Checks cover the scanner, system partition, import-cache reuse, HTML escaping,
mocked Jev requests and credential loading, viewer layout/event wiring and import
hashes. The real pinned Pi CLI runs in an isolated temporary configuration to
verify package discovery, `/skill:repo-graph` registration and native RPC bash
execution against a synthetic repository with spaces in its path. It verifies
all five artifacts, repeat cache reuse and source-output rejection without any
model or network calls. This does not establish model instruction-following or
browser visual QA. A manual smoke test is `/skill:repo-graph` followed by opening
the reported HTML and switching between System, Explore and Data.

## Disable, upgrade and rollback

Use `pi config` to deselect `packages/pi-repo-graph/skills/repo-graph/SKILL.md`,
or narrow the package's `skills` filter. Setting `skills: []` disables every
skill from that package selection, including unrelated bundle skills. Start a
fresh session after changing selection. Upgrade by installing a reviewed release
pin; rollback is `pi install git:github.com/fakoli/anvil-extensions@anvil-v0.12.0`.
No data migration is required; generated artifacts and caches remain in the
user's cache. Release publication does not change an existing installation pin.

## Provenance

MIT port of Repo Graph 0.3.0. See [UPSTREAM.md](UPSTREAM.md) for the exact source,
verbatim import hashes and local adaptations, and [LICENSE](LICENSE).

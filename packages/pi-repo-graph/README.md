# Repo Graph in Anvil Extensions

## Purpose and setup

Repo Graph is maintained in [one canonical repository](https://github.com/fakoli/repo-graph).
This workspace provides compatibility scripts and the bundle's native Pi
integration check. The root dependency lock installs Repo Graph 0.6.0; no
scanner, viewer, search implementation or skill is copied into this workspace.

Install the bundle and start a fresh Pi session:

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.17.0
```

```text
/skill:repo-graph /path/to/repository
```

The root manifest explicitly discovers the canonical dependency's skill. It is
loaded on demand and registers no extension tools, hooks or background tasks.
Pi 0.85.1 or newer, Python 3.10+ and Git for HTTPS input are required. Mapping
and keyword search use Python stdlib. Optional CPU semantic search and local
reranking use the product's committed Python lock; setup downloads public model
weights. The skill resolves its own installed product directory and preserves
the caller's working directory.

## Interface and configuration

The canonical CLI provides `map`, `index`, `search`, `serve` and `init`.
[The product guide](https://github.com/fakoli/repo-graph/blob/v0.6.0/README.md)
owns usage, diagram layouts, bounds, optional models and harness installation.
Standalone Pi, Codex and Claude installations use that same product.

The original scripts remain supported. From this workspace directory:

```bash
python3 scripts/build_repo_graph.py /path/to/repository
python3 scripts/repo_graph.py map /path/to/repository
```

An omitted repository maps the caller's directory. Both scripts resolve the
canonical dependency from this package's or an ancestor's `node_modules`;
they never change the working directory. A missing dependency exits with a
reinstall instruction. `--output DIR` must be outside the source. `--refresh`
updates a retained HTTPS clone.

No adapter configuration or API key is required. For an explicit Pi package
selection, use the canonical resource path:

```json
{"skills": ["node_modules/repo-graph-agent/skills/**"]}
```

This is a filter within the bundle's existing package entry. Empty `skills: []`
disables its skills. The old `packages/pi-repo-graph/skills/**` filter must be
replaced when upgrading, because that copied skill directory is removed.
Avoid selecting both standalone Repo Graph and the bundle's Repo Graph skill.

## Effects and limits

Pi's ordinary bash permissions and cancellation apply. Source is read without
execution or modification. Generated diagrams, bounded source synopses, SQLite
indexes, vectors, shallow clones and caches persist outside the source; review
them before sharing. Cancelling can leave partial output; repeat the scan/index
to recover. `serve` starts an explicit foreground loopback server; stop that
process when finished. Default map/search makes no inference API calls.

Installation fetches the exact canonical Git dependency recorded in the lock.
Optional model setup downloads public CPU weights. Explicit Jev options can
export bounded directory names or query/path/source evidence and incur API cost;
project export and credential rules still apply. See
[security boundaries](../../docs/security.md#repository-diagram-skill) and the
[canonical guide](https://github.com/fakoli/repo-graph/blob/v0.6.0/README.md).

Current import relationships are heuristic source-area dependencies. They are
not a function call graph or a verified business process. Polyglot call analysis
is a proposed design documented in the canonical ADRs. Million-file support,
all dynamic call targets and general model instruction-following are not qualified.

## Verification

From the bundle root:

```bash
npm test --workspace pi-repo-graph
```

The suite checks the canonical pin and resource registration, real isolated Pi
skill discovery, canonical and compatibility script execution from a caller
directory with spaces, artifact creation, cache reuse, keyword search and
source-contained output refusal. It uses the bundle's pinned Pi 1.0.4 development
runtime and makes no model calls. Released Git dependency checks passed with
that runtime and the installed Pi 0.85.1 in isolated settings. Product scanner/search/reranker and browser UX
tests run in the canonical repository rather than in copied suites here.
[Product evaluations](https://github.com/fakoli/repo-graph/blob/v0.6.0/evaluations/README.md)
retain their measured results and limits; this consolidation makes no new
performance or relevance claim.

## Disable, upgrade and rollback

Deselect the skill using `pi config` or its package resource filter, then start a
fresh session. Upgrade using the reviewed bundle tag and migrate the explicit
filter above if present. Rollback is
`pi install git:github.com/fakoli/anvil-extensions@anvil-v0.16.0`.
Publication does not alter an installed host pin. Generated indexes, caches and
source remain in place; no data migration is required for this packaging change.

## Provenance

The product is MIT licensed. [UPSTREAM.md](UPSTREAM.md) records the exact
canonical release and the removal of the former copied runtime.
The retained [license](LICENSE) covers the original port and adapter.

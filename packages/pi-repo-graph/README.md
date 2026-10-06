# Repo Graph for Pi

## Purpose and setup

Repo Graph maps local or public HTTPS repositories into readable system diagrams
and searches their generated data by identifiers or meaning. It is a
**default-discovered skill**, loaded on demand. It registers no extension tools,
hooks or background tasks. This package carries the reviewed Repo Graph 0.5.0
runtime.

Install the bundle and start a fresh Pi session:

```bash
pi install git:github.com/fakoli/anvil-extensions@anvil-v0.16.0
```

```text
/skill:repo-graph
/skill:repo-graph /path/to/repository
/skill:repo-graph https://github.com/owner/repository
```

Requirements: Pi 0.85.1 or newer, Python 3.10+ and Git for HTTPS repositories. Mapping
and keyword search need no Python dependencies or API key. Meaning search and
local reranking optionally use uv, FastEmbed 0.7.4 and NumPy under the committed
Python lock. The skill resolves its package directory and installs the optional
extra with `uv run`; first indexing downloads BGE-small CPU weights. Reranker
setup separately downloads MiniLM. Queries use cached weights only. No GPU or
embedding service is required. Without uv, install the optional Python extra
from this package with `python3 -m pip install '.[semantic]'`. Node 24 is needed
for the bundle's test suite.

## Interface and views

Pi's native skill invokes the packaged CLI through its normal bash tool. An
omitted path maps the caller's working directory. Scripts and assets resolve
from the installed package; the caller does not change into the skill directory.
This is `/skill:repo-graph`, with no additional extension command or prompt.

The CLI exposes `map`, `index`, `search` and `serve`. From this package directory:

```bash
uv run --extra semantic repo-graph map /path/to/repository
uv run --extra semantic repo-graph index OUTPUT --semantic
uv run --extra semantic repo-graph serve OUTPUT
```

Use the output directory printed by mapping. For a dependency-free scan use
`python3 scripts/repo_graph.py map /path/to/repository`. The old
`python3 scripts/build_repo_graph.py [repository]` entrypoint still maps with
the same flags. `--output DIR` must be outside the source; `--refresh` updates a
cached remote clone. `map --jev` separately opts into advisory area labels.

Outputs are `architecture.html`, `graph.html`, `graph.json`, `architecture.mmd`,
`architecture.md` and `search.db`. HTML diagrams work
directly from disk. `serve OUTPUT` prints a loopback URL for interactive search.
The server runs in the foreground; stop that process when finished.

System groups up to 12 source areas and observed imports. Explore provides card,
tree, radial and file-count treemap layouts. Data provides a sortable table and
directed dependency matrix. CSV exports the filtered scope; SVG exports the
viewport. Breadcrumbs and Root return to source areas. Selected files are
centered and focused. Tabs support arrow keys; focus the canvas to pan with
arrows, zoom with +/− or fit with F. Escape closes the narrow details drawer.

Search preserves the query, method, reranker and Path prefix when returning from
a diagram. It opens a result at its source file. CLI search accepts
`--mode keyword|semantic|hybrid`, `--prefix DIR` and `--limit N`. The default is
hybrid and requires a current semantic index. Use `--mode keyword` without
embeddings. Missing or stale vectors produce an actionable error. Re-map after source
changes and repeat `index --semantic` to update only changed summaries.

## Optional reranking

Inside the prepared Python environment:

```bash
repo-graph index OUTPUT --reranker
repo-graph search OUTPUT 'where are access permissions checked?' --rerank local
repo-graph serve OUTPUT --local-reranker
```

MiniLM scores at most 32 candidates on CPU. Setup downloads weights once;
queries never download them. Jev is a separate explicit option:

```bash
repo-graph search OUTPUT 'record API activity in an audit trail' --rerank jev
repo-graph serve OUTPUT --allow-jev
```

The browser additionally requires selecting **Jev API reranker**. It exports
the query and up to 32 paths with 900 bytes of evidence per file under a 48 KiB
request cap. Obey project source-export and credential rules before using it.
Calls pin `jev-1.13.0`, refuse redirects, use bounded response/socket limits and
make one attempt. Identical validated requests are cached. Failure preserves
local order and reports `fallback`; receipts distinguish attempts, successful
calls and known usage. No reranker can recover files missing from its shortlist.

## Configuration and boundaries

There is no configuration file. Diagrams, import/role caches, the SQLite corpus,
vectors, rerank receipts and shallow clones persist in the user's cache by
default. Generated artifacts are replaced on repeat scans; keep unrelated files
elsewhere. Source files are not executed or modified. Hidden/generated/symlink
paths are excluded; Git inventory includes nonignored untracked files.

Source extraction reads at most 64 KiB per supported file in batches of 512.
Go/Python/JS/TS imports are heuristic. Other languages remain in the directory
inventory and path search. Synopses are bounded summaries, not full-code chunks;
later declarations may be omitted. Views show at most 23 entries plus a scope
card and bounded links. Full paths/imports remain in JSON. The full inventory
and exact blocked vector scan are held locally; million-file support is not
qualified. System components are source areas, not verified services or call
flow. Rank scores and vector similarity are not correctness probabilities.

Default local mapping/indexing/search makes no inference API calls. Optional setup
downloads public weights. The Pi agent still uses its configured model for
instructions. HTTPS input invokes Git. Generated files contain paths and source
evidence; review before sharing. The loopback server checks Host, Origin and
JSON requests. It permits one expensive search at a time; another gets a busy
response while static files/status remain responsive.

`map --jev` exports up to 16 top-level directory names only. All Jev options use
only `TYPESAFE_API_KEY` from the environment or its exact entry in `~/.env`,
without sourcing or displaying that file. Opt-in does not override credential
rules. Keys and provider extras are not written to ranking caches; validated
receipts have a 512-entry cap. Model labels cannot create imports or change
inventory.

Pi's normal bash permissions and cancellation apply. Cancelling can leave
partial output or an incomplete clone. Re-run mapping/indexing to replace
partial output; remove only the reported incomplete clone cache before retrying
remote input. Invalid paths, forbidden output and clone failures exit nonzero.

## Verification

From the bundle root:

```bash
npm test --workspace pi-repo-graph
```

The bundle pins Pi 1.0.4 for its isolated test harness; this does not update an
installed host runtime. The suite covers scanner/cache reuse, HTML escaping, source grouping, keyword
and hybrid ranking, literal prefix boundaries, optional vector scoring, Jev
validation/fallback/cache sanitization, export gating and server concurrency.
NumPy-specific cases run when the optional extra is installed. Viewer checks
cover layouts, breadcrumbs and keyboard wiring. Import hashes protect the
reviewed runtime. Isolated native Pi RPC checks discover the actual skill and
execute both script interfaces from a synthetic caller directory with spaces,
check artifacts/cache reuse/search and reject source-contained output. Offline
tests use synthetic credentials and make no provider calls.

[Upstream evaluations](https://github.com/fakoli/repo-graph/blob/v0.5.0/evaluations/README.md)
record 20,370-file AWS and 25,788-file Kubernetes measurements, screenshots and
21 browser checks per corpus. Fresh mapping median fell 42–50%; hybrid search
median fell about 29%, with unchanged structure and ranking fingerprints.
On 16 newly frozen developer-authored queries Jev improved hit@5 from 10/16 to
14/16, but old Kubernetes results did not improve and some first ranks worsened.
Semantic relevance remains experimental. These small query sets are not an
independent holdout, and browser checks are not full accessibility certification.
The bundle's port-specific results are recorded in its release notes.

## Disable, upgrade and rollback

Use `pi config` to deselect this skill, or narrow the package's skill filter.
`skills: []` disables all skills from that selection. Start a fresh session.
Publication does not change an existing host pin. Upgrade by installing the
reviewed tag; rollback is
`pi install git:github.com/fakoli/anvil-extensions@anvil-v0.15.2`.
The generated index is new for old maps: re-map, then optionally embed it.
Existing source, remote clones and retained artifacts remain in place. The
previous entrypoint stays supported; stopping a viewer leaves caches intact.

## Provenance

MIT port of Repo Graph 0.5.0. [UPSTREAM.md](UPSTREAM.md) records the exact source,
verbatim hashes, optional dependency/model licenses and local adaptations.
The [license](LICENSE) is retained.

# pi-repo-graph provenance

MIT port of [Repo Graph 0.5.0](https://github.com/fakoli/repo-graph/tree/v0.5.0),
exact canonical commit `4d97cd0f90d1d3ca047cbb3a98f114729059cb1d`.
Upstream copyright: 2026 Fakoli; [the MIT license](LICENSE) is retained.

The complete `repo_graph/` runtime, its packaged viewer assets,
`scripts/repo_graph.py`, `pyproject.toml`, `uv.lock`, and `LICENSE` are verbatim
imports from that commit. The Python metadata retains upstream distribution
identity `repo-graph-agent` version `0.5.0`; the existing native Pi workspace
identity remains `pi-repo-graph`, version `0.2.0`.

## Local integration and testing differences

- `scripts/build_repo_graph.py` is a local compatibility wrapper. It prepends
  `map` to the original map-only arguments and imports the shared CLI without
  changing the caller's working directory. New commands use the verbatim
  `scripts/repo_graph.py` entrypoint.
- The previous duplicated `assets/` directory is removed. The canonical builder
  resolves the single viewer copy under `repo_graph/assets/`.
- Pi package metadata, skill instructions, bundle documentation, and this ledger
  are local integration files. Existing skill/resource selection is preserved;
  no extension tools or background tasks are registered. Package file globs
  include source/assets/tests explicitly and exclude generated Python bytecode.
- Upstream Python scanner/search/reranker tests, Node viewer regressions, and
  browser UX tests are imported unchanged with their existing package-relative
  paths. The upstream standalone Pi smoke script is replaced by the existing
  bundle RPC runner, extended to cover both entrypoints, keyword search, cache
  reuse, and source-output rejection with isolated provider-free settings.
- `npm test --workspace pi-repo-graph` uses the local stdlib Python and Node
  suites plus the bundle's pinned Pi runtime. Vector tests run when NumPy is
  installed; the committed Python semantic lock can exercise them without
  model downloads or provider calls. Optional browser UX tests reuse the
  bundle's existing pinned Playwright dependency through `npm run test:ux --workspace pi-repo-graph`; no runtime Node dependency is added.

## Optional dependencies and models

The semantic extra installs FastEmbed 0.7.4 (Apache-2.0) and NumPy from their
unmodified distributions under `uv.lock`; ONNX Runtime and other transitive
libraries retain their licenses. These are libraries, not imported extension
code. BGE-small-en-v1.5 (MIT) and the Xenova ONNX conversion of MS MARCO MiniLM
L6 v2 (Apache-2.0) are separately downloaded at explicit setup. No model weights
are vendored. Jev is an explicit remote API with no new SDK dependency.
See [canonical provenance](https://github.com/fakoli/repo-graph/blob/v0.5.0/UPSTREAM.md)
and [research/model sources](https://github.com/fakoli/repo-graph/blob/v0.5.0/docs/jev-research.md).

## Verbatim import SHA-256

The package suite verifies every hash below. Intentional future imports must
update this ledger with the exact canonical revision and describe divergences.

```text
4624cfb4c27a2492556e51d80b0a5cf7b783d701c9a94336d8afc7a074b087f9  LICENSE
dbe98fd2ed22102bbeebeec9e06fc27029c60e2bccf950cea55d3308da24cfa2  pyproject.toml
dda71f61db5581afac627acc8c9c7af28f80d2cc1c4c0345df42385054d43edf  repo_graph/__init__.py
7f817fa14172a56ebde8170820eba3c02510be04b6c08543c61067fa611c9d0b  repo_graph/assets/diagram.html
8e919615d520634e43d0f583359112064ba0d5e5e6b1f62f73a27980152507ae  repo_graph/assets/views.js
a0cb865f9efbf2374d40d597492cadb7afaf0b4ade47d3f10c9f515f275ec9b8  repo_graph/builder.py
661de0358a35a476384c941fa4dd61c45abaf0f4c38bbef227a9566c45c74c0b  repo_graph/cli.py
a8f27d62c381948ab248ee477cc3e353b8af240f8daf67c63947025849857243  repo_graph/jev.py
1c682aae730fc860da8fd95b14eea6fa6c37caaf815e57e254d987a76a4e57cf  repo_graph/rerank.py
640ac2db2d9f9c57ad8f765e5a4c557a126fbc3bcd1de09793a5429b2182e896  repo_graph/search.py
ec872e4cfdc22510b80d75c84d9fa3fa9aa0a61a34966b00d2b9005e1199b7c5  repo_graph/server.py
38f45aac54310b372cba99e0460e27bbb62fd059bf2aec1a497452ce8e48f46c  scripts/repo_graph.py
b5610b20367229d6a615a74cc19bf0bd17d9ed60dd88fde5d9ded0c8e4401eb4  uv.lock
7c6fcd35bd53a5b8b1a8c75d3b81eb4460f87481131eb017324602c44443cfab  tests/test_repo_graph.py
57e4fb7aacf625fec1db6dfca8003f441b5f469b8277ea1af4ff13a5b86be1c3  tests/test_search.py
175570229fc34fb7a0b719e23c370d4b251efb053ba51dd2e2273fddc220e0d2  tests/test_rerank.py
a6d7bdcd97f595f22e57e4a804156c6c168790ad7ae2d7dd012d0cc13a0f96b2  tests/test_repo_graph_views.cjs
978232af61e3447ea586b254002667de8735597d29f87b939bcc93647b3d0c49  tests/ux.mjs
```

# pi-repo-graph provenance

Repo Graph is maintained in [fakoli/repo-graph](https://github.com/fakoli/repo-graph),
MIT licensed, copyright 2026 Fakoli. This workspace is a compatibility adapter,
not a separate product implementation. The root and workspace manifests pin
`repo-graph-agent` to `git+https://github.com/fakoli/repo-graph.git#v0.6.0`;
`package-lock.json` resolves that release to exact Git commit
`b21a7c19fc3f068d3b0227ba1fa6acd5eda17280`. npm 11 does not record or verify
a tarball integrity hash for this Git dependency; the lock uses the Git commit
as its source identity. The separately published, downloaded and verified
`repo-graph-0.6.0-source.tar.gz` has SHA-256
`b8f634de9e4b56d7a60cdda09ea61835542546fe7abada042f28bb9a1dee6228`.
That checksum identifies the release asset, not npm repacked bytes.
[Release and checksums](https://github.com/fakoli/repo-graph/releases/tag/v0.6.0).
The canonical product's [provenance](https://github.com/fakoli/repo-graph/blob/v0.6.0/UPSTREAM.md)
owns third-party and model notices. Its dependencies remain unmodified external
distributions; no model weights are bundled.

## Consolidation

The former Anvil 0.16.0 port at commit
`d440ba19ac42895c5054bfe80ff32a6c0517146b` carried Repo Graph 0.5.0 from
`4d97cd0f90d1d3ca047cbb3a98f114729059cb1d`. Its 18 verbatim file hashes remain
in that immutable release's ledger. In this change, copied Python runtime,
viewer assets, Python metadata/lock, native skill and product tests are removed.
Future improvements are maintained and evaluated once in the canonical product.

## Local integration

- Workspace identity `pi-repo-graph` advances to 0.3.0. It depends on the same
  canonical release as the root bundle; no additional runtime library is added.
- Root `pi.skills` selects `node_modules/repo-graph-agent/skills`. Explicit
  resource filters select `node_modules/repo-graph-agent/skills/**`.
- `scripts/repo_graph.py` locates the locked canonical dependency in this
  package's or an ancestor's `node_modules` and invokes its CLI.
  `scripts/build_repo_graph.py` preserves map-only arguments. Both preserve
  caller-directory behavior and refuse a missing dependency with a clear error.
- The native RPC integration suite remains here. Algorithm and browser UX tests
  remain upstream. The adapter registers no tools or background service and
  changes no installed host selection or provider.
- The original MIT license is retained. Bundle-specific setup, migration,
  disablement and rollback are documented in [README.md](README.md).

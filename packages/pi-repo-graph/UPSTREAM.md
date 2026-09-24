# pi-repo-graph provenance

Adapted MIT port of Repo Graph 0.3.0 from
[fakoli/agent-plugins](https://github.com/fakoli/agent-plugins), commit
`6a4463cb352b265b983994d53d53b9b7a0c0cae0`. Upstream copyright: 2026 Fakoli;
[the license](LICENSE) is retained.

The scanner and viewer are imported verbatim from `plugins/repo-graph/`.
The skill keeps the workflow and limits, with Pi invocation, caller-directory
handling, and explicit credential-permission guidance. Host-specific skill UI
metadata and plugin manifests are omitted. Upstream Python and JavaScript
regressions are retained with package-relative paths. Package metadata,
Pi integration checks and bundle documentation are local additions.
No upstream runtime dependency is added.

## Verbatim import SHA-256

The package suite verifies these hashes. Intentional future changes must
update this ledger and describe their divergence.

```
c9086f286f67fffddeaed8f5acf83bbcecc3070372488a501942138218517218  scripts/build_repo_graph.py
3e36ad20b14c569173725854a7d8a280ae68e7120510e995c2195b30d5a9c42a  assets/diagram.html
4e54f26465c074ee4e90fa7fdb89e429fe8d6a1563a07372086e4ec1e86e0ce4  assets/views.js
4624cfb4c27a2492556e51d80b0a5cf7b783d701c9a94336d8afc7a074b087f9  LICENSE
```

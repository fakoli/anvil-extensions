# Candidate verification

Run offline verification from the candidate bundle with the reviewed Node 24
runtime:

```bash
npm test --workspace pi-capability-upgrade
```

The suite proves changed-path routing for an unsafe-looking filename. It runs
real subprocess gates and rejects failed/cancelled gates, edits made during a
gate, external policy changes, policy symlinks outside the repository, and
wrong task/claim/baseline bindings. It covers untracked content, mode changes,
renames, deletions, and malformed or tampered receipts. It also checks
documentation query sanitization and direct/proxy MCP denial decisions. It
also rejects a gate list that differs from the externally approved argv list,
oversize gate output, and a timed-out gate plus its spawned child process.

The offline suite does not prove an upstream documentation response. On
2026-09-12, a sanitized local native-tool probe resolved public `zod@3.24.1`
and queried `/colinhacks/zod` without credentials. Context7 advertised nearby
versions rather than confirming `3.24.1`; its answer must therefore be treated
as version evidence only when it explicitly establishes the requested version.

Run the separate live, disposable Serena qualification only when the pinned
upstream source is available:

```bash
python3 packages/pi-capability-upgrade/tests/serena-readonly-integration.py
```

It builds two temporary Git worktrees, checks TypeScript and Python references,
then checks changed and deleted references plus rejected external activation.

Run the browser fixture against a candidate-owned loopback page with the
package-pinned CLI:

```bash
node packages/pi-capability-upgrade/tests/browser-cli-integration.mjs
```

It asserts role-based approval, a visible 503 network failure, and a console
error marker, and creates its browser state outside the checkout.

The default Serena probe exposed mutation and memory tools and auto-created
state. A second probe pinned `701e7c843f46c6a649203a488cece1bf19f1df90`, used
an isolated `SERENA_HOME`, fixed the tool set to five semantic reads, and
returned `get_symbols_overview` responses for one TypeScript and one Python
worktree. It is qualified only as a standalone temporary-home configuration;
the adapter cannot presently bind it to a verified caller composition.

Grafana remains disabled because no declared read-only endpoint, credential
reference, or data-source restriction exists. Any future integration must
retain explicit policy and bounded-output requirements.

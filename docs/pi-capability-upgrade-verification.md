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
optional official Context7 registration and direct/proxy MCP denial decisions. It
also rejects a gate list that differs from the externally approved argv list,
oversize gate output, and a timed-out gate plus its spawned child process.

The offline suite does not prove an upstream documentation response. On
2026-09-12, a public-package native-tool probe resolved public `zod@3.24.1`
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
separately installed pinned CLI:

```bash
PLAYWRIGHT_CLI_BIN=/path/to/pinned/playwright-cli node packages/pi-capability-upgrade/tests/browser-cli-integration.mjs
```

It asserts role-based approval, a visible 503 network failure, and a console
error marker, and creates its browser state outside the checkout.

The default Serena probe exposed mutation and memory tools and auto-created
state. A second probe pinned `701e7c843f46c6a649203a488cece1bf19f1df90`, used
an isolated `SERENA_HOME`, fixed the tool set to five semantic reads, and
returned `get_symbols_overview` responses for one TypeScript and one Python
worktree. It is qualified only as a standalone configuration with candidate-owned external state;
the adapter cannot presently bind it to a verified caller composition.

Grafana remains disabled because no declared read-only endpoint, credential
reference, or data-source restriction exists. Any future integration must
retain explicit policy and bounded-output requirements.

The State workflow tests cover exact argv matching, failed gates, bounded output
and deadlines, external content/mode/untracked changes, preserved Git index,
and stale policy/proof refusal. A disposable State CLI round trip on 2026-09-12
ran three independent pytest assertions and submitted one canonical command
proof. External content, policy and artifact edits were refused before submit;
the fresh task ended in `needs_review`, with no acceptance approval.

The live synthetic Pi comparison used the same model, inference settings,
scoped filesystem tools and enabled repair in both arms. The reviewed baseline
passed 1/3 tasks. Both text-edit tasks failed their trailing-newline oracle.
The cause was unconditional string trimming in `stripGrammarTokenLeaksInPlace`.
The candidate preserves whitespace while stripping explicit grammar markers;
its focused four-case regression and all 3/3 live smoke tasks passed. Original
failures remain in private evidence. This small fixture suite demonstrates the
specific repair correction, not general coding quality or statistical superiority.

## Optional observation mediation

Run the package checks with:

```bash
npm test --workspace pi-observations
node packages/pi-observations/tests/pi-probe.mjs
```

The 0.11.0 package suite passed 22 checks, including format/MIME/byte/pixel rejection, orientation and metadata removal, first-frame GIF pixels and coverage notice, exact image provenance with compatible text-only transforms, and cancellation of the embedded-runtime Node decoder. Native Pi also passed JPEG/WebP/static-GIF/animated-GIF attachment and JPEG tool flows, a preceding text-only transform, and registered bundle discovery with the plan-mode hook. Every vision image was valid strict PNG; originals remained intact and primary requests contained no media. The installed-Pi 0.85.1 loopback probe passed both primary image modes, clean resume and cache reuse, user and tool questions, malformed-image, transport-failure, cancellation, session-budget, and fixture-clock expiry handling. It also proved every primary request had zero media and original Pi image entries remained unchanged. This is fixture evidence for the registered-client boundary, not model qualification.

A separately controlled live slice used explicit registered `llm.secondary` vision and `llm.primary` primary selections with one 128×64 red-left/blue-right PNG, one explicit question, and a 1,024-token vision output cap. It recorded one inspector PNG request, zero primary media, preserved originals, and correct structured facts plus primary answer. It is a bounded integration observation, not a service/model change, a general quality result, or authorization to install or activate the package on a normal Pi profile.

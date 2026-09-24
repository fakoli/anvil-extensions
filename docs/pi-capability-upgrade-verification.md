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

The 0.11.1 regression exercises the full registered root bundle, including shared image and supervisor tool schemas, and a plain path prompt followed by Pi's built-in JPEG read and explicit observation inspection. Earlier native bundle checks selected only plan-mode and observations, which missed the shared-schema false positive. Unit regressions distinguish shared references from cycles and preserve media and object-occurrence limits.

A separately controlled live slice used explicit registered `llm.secondary` vision and `llm.primary` primary selections with one 128×64 red-left/blue-right PNG, one explicit question, and a 1,024-token vision output cap. It recorded one inspector PNG request, zero primary media, preserved originals, and correct structured facts plus primary answer. It is a bounded integration observation, not a service/model change, a general quality result, or authorization to install or activate the package on a normal Pi profile.

## Optional Pi browser observations

The final committed lockfile clean-room verification passed all 11 declared
suites and its dependency audit reported zero vulnerabilities. The exact
candidate checkout also reran the deterministic native `pi-probe.mjs` on
installed Pi 0.85.1 with its fixture provider in both text-only and
image-capable declaration modes. It proved the default inactive state without
`--browser`; in a fresh browser session it proved registered tool availability,
session-bound opaque observations, stale-handle refusal, fork cancellation,
reload cleanup, bounded text-only receipts, configured page-ID-only guidance,
and zero browser media sent to the fixture provider. This is a public-DOM
boundary check, not vision or general model-quality evidence.

The pre-pin source/staged `chromium-cleanup.mjs` probe used a reviewed Serving
source override and passed four lifecycle cases. The default installed cleanup
repeat then passed those four cases without an override, using the npm-installed
merged Serving dependency at `4d0bbebb`. It covered normal close, cancellation,
raw worker termination, and a stopped browser before test cleanup resumed it.
These are synthetic-transport lifecycle checks, not public-site evidence. The
staged-release installed repetition remains pending. Package tests also cover
protected config validation, closed tool inputs, result/frame bounds, worker
protocol failures, and the partial-coverage contract: a partial result is never
evidence of an absent element. Jev was not enabled for this evidence; its fixed
export is separately gated by protected configuration.

No neutral-website or live-primary acceptance has run. `llm.primary` remains
offline for benchmarking. Those checks remain pending and would qualify only
the configured page-and-model path, with bounded receipts and independent
review; they do not block publication of this inactive optional resource.

The strict wire-production gate is separate and remains **OPEN**. Its quota
needs kernel enforcement that accounts for socket and TLS extra bytes; that
enforcement has not been proven by the native fixture or a live-site receipt.
The image workflow remains separately verified and is neither enabled nor
changed by `--browser`.

## Repository diagrams (0.13.0)

The `pi-repo-graph` offline suite passed five scanner regressions, viewer
geometry/event checks and verbatim import hashes. Both the pinned npm Pi 0.85.1
CLI and the installed Pi 0.85.1 binary passed package discovery, native
`/skill:repo-graph` registration and RPC bash execution with an isolated
configuration and a synthetic caller repository. All five artifacts, repeat
cache reuse and source-output rejection were checked. No model/provider request
was made; model instruction-following and browser visual QA are not claimed.

The port also scanned a cached public Terraform AWS provider checkout: 20,370
files, 6,657 directories, 6,948 aggregated import links and 9,528 supported source
files. Of those, 441 exceeded the 64 KiB extraction cap; the repeat reused all
9,528 import entries. This checks the local scanner and bounded output structure,
not semantic completeness of heuristic imports. Jev remained off. Existing
candidate selection and installed bundle pins were preserved.

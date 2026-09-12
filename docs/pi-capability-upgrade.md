# Pi capability upgrade candidate

This candidate supplements the reviewed baseline bundle. It is selected through
Pi's existing per-resource filtering; it does not add another profile manager.
Keep the baseline pin and candidate selection separate until a later rollout is
authorized.

## Compositions

| Composition | Select | Intent |
| --- | --- | --- |
| `coding` | existing core resources plus `pi-capability-upgrade/index.ts` and the workflow skills | scoped coding, deterministic verification, guarded public documentation |
| `browser` | `coding` plus the browser-verification skill and the package-local pinned browser CLI | candidate-owned loopback browser checks |
| `ops-readonly` | the capability extension and only `ops-readonly` | no server by default; a separately reviewed explicit allowlist is required |

The `pi-capability-upgrade` extension creates an isolated MCP adapter with an
empty server map. It sets host configuration discovery off, disables scripting
and sampling, disables direct tools/resources, and uses a 30-second request
limit. It cannot import a project, shared, or host MCP configuration. Adding a
server requires an explicit reviewed candidate change and server-side
credentials/allowlists; tool discovery is never authorization.

The adapter's final approval event is claimed by this extension and denies
every call in both direct and proxy origins. That is a defense for the empty
server map, not permission to add a server. The event does not carry a caller
composition, so it cannot enforce a coding-only server independently of Pi's
resource filter. Do not enable a server until the adapter has an invocation
boundary that carries a verified composition and rejects every unlisted tool.

Serena is not enabled through the adapter. Its default `codex` context at
commit `701e7c843f46c6a649203a488cece1bf19f1df90` advertised 23 tools,
including file replacement, insertion, deletion, and persistent memory, and
auto-created global and project state. A separate restricted configuration is
qualified in `packages/pi-capability-upgrade/config/serena-readonly.template.yml`:
it uses a candidate-owned `SERENA_HOME`, an external cache, no modes, and a
fixed five-tool semantic-read list. It successfully returned symbol overviews
for one TypeScript and one Python worktree. Render the placeholder once into a
candidate-owned directory and invoke the pinned commit with an explicit
`--project`; do not use `--project-from-cwd`, a shared configuration, or a
worktree-local cache.

This is a standalone qualification, not an adapter registration. The adapter
approval event has no verified caller composition, so it cannot enforce that
the restricted server appears only in `coding`. No Serena server entry ships
until that invocation-boundary gap is fixed.

The native documentation tools require `libraryName`, `version`, and a bounded
public question. They reject private-looking material and tell the service to
state when version-specific evidence is unavailable. They start without a key;
rate limits or authentication failures remain ordinary tool errors.

The browser CLI version is pinned in the root lockfile. Run it only through
the browser workflow: a named candidate session, loopback target, isolated
profile, mocked inputs, assertions, and candidate-only cleanup. Do not install
its upstream skill into global agent settings.

## State and verification

The native State integration remains the only task/claim/evidence/acceptance
authority. `runVerifiedGates` snapshots the Git baseline, full candidate
content (with a temporary index and forced mode tracking), and policy bytes
before it starts a declared non-shell gate. It repeats all three snapshots
after every successful gate. A failed or cancelled gate, policy symlink outside
the repository, or any change during the window produces no receipt.

The caller supplies `taskId`, `claimId`, baseline commit, a SHA-256 policy
identity, and the exact `approvedGates` list from an independently approved
record outside the mutable checkout. The runner hashes normalized argv, working
directory, and timeout values for both requested and approved gates, and refuses
any mismatch. It also rejects a policy whose current bytes differ from its
trusted identity. `validateReceipt` requires the same expected task, claim,
baseline, policy, and approved gate list. There is no default path, environment
lookup, or acceptance claim: the caller must pass each value explicitly. Each
gate has a five-minute maximum deadline, a 256 KiB combined output cap, and
process-group termination on cancellation. Git filters from the explicitly
trusted checkout may run while a temporary index is populated; use this only
for a reviewed checkout.

`verification-receipt/v2` is not the native State
`claim-command-proof/v1` artifact and cannot be passed to
`anvil submit --command-proof-file`. No bridge from this advisory receipt to
State command proofs or State freshness exists in this package. The native
proof verifier remains a separate boundary for commands that State itself
defines and captures.

For a task whose State metadata declares command proofs, the opt-in
`scripts/state-proof-workflow.py` reads only explicit `anvil status --json` and
`anvil show TASK --json` metadata, accepts an external approved-gates JSON file,
and writes canonical proof artifacts without submitting them. It requires the
approved argv list to exactly equal the task's passing command-proof
requirements, captures bounded output bytes, and re-reads task/claim metadata
before writing. Its caller must provide the State layout explicitly. Submission
and State approval remain separate human-controlled steps.

## Operations and observability

The portable package does not discover a monitoring instance or credentials.
An observability integration remains disabled unless an existing declared
read-only endpoint, data-source restriction, and credential reference are
provided. Any future configuration must bound time range, result count, and
query duration and deny dashboards, alerts, raw query escapes, and writes.

Rollback removes the candidate package entry or resource selection only. It
does not alter existing sessions, baseline packages, router settings, or
services.

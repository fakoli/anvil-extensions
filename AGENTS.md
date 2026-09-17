# AGENTS.md — Anvil Extensions

This repository ships Pi extensions, skills, and prompts as one pinned bundle.
Treat implementation, documentation, provenance, and resource selection as one
change. **An extension is not complete until its documentation is updated in
the same PR.** Do not defer required documentation to a follow-up task.
**Delivery also requires a new release tag and a published, verified artifact.**
Follow the release completion gate below; a commit, merged PR, or tag alone
does not finish a change.

## Orient before editing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and release rules.
2. Read [README.md](README.md) and [docs/packages.md](docs/packages.md) for the
   user-facing inventory and package purpose.
3. Read the affected package's `README.md`, `UPSTREAM.md`, `package.json`, and
   implementation before changing its behavior. Follow any nested `AGENTS.md`.
4. Inspect the root [package.json](package.json) for workspace dependencies and
   explicit `pi.extensions`, `pi.skills`, and `pi.prompts` registrations. Being
   present in `packages/` or installed as a dependency does not mean a resource
   loads by default.
5. Read [docs/forks.md](docs/forks.md) and [docs/security.md](docs/security.md)
   when changing upstream imports, dependencies, permissions, or data handling.

Preserve unrelated user changes and existing worktrees. Work on a focused
branch and use a PR; do not push feature changes directly to `main`.

## Documentation is part of every extension change

Apply this checklist when adding, removing, renaming, upgrading, or changing
an extension, skill, prompt, tool, command, configuration option, permission,
dependency requirement, or default resource selection. Cosmetic implementation
changes may have no user-facing documentation impact; explain that in the PR.
**A new extension always requires documentation.**

| Surface | Required update when affected |
| --- | --- |
| `README.md` | Add, remove, or rename the package in “What's inside”; update the description and any affected counts, installation examples, or loading guidance. Distinguish package count from default-loaded extension count and optional resources. |
| `docs/packages.md` | Update both the catalog table and the detailed entry: what it does, why it exists, how it works, and a link to the package README. State whether it is default, optional, or candidate-only. |
| `packages/<name>/README.md` | Document the actual supported interface using the checklist below. Every new package needs this file. |
| `packages/<name>/UPSTREAM.md` and `docs/forks.md` | Record provenance and local changes together. New original packages identify themselves as original work; imports include exact source/version or commit, integrity, license, and divergence. |
| Root and package `package.json` files | Keep declared resources and dependencies consistent with the documented loading behavior. Update `package-lock.json` with dependency changes. Installation is not activation. |
| `scripts/test-matrix.txt` | Add the workspace's test suite when introduced. If a package has no suite, record why; do not imply it was tested. |
| `docs/security.md` | Explain changes to permissions, network access, secret handling, persistence, dependencies, or trust boundaries. |
| `docs/pi-capability-upgrade.md` and `docs/pi-capability-upgrade-verification.md` | Update affected candidate compositions, selection instructions, verification evidence, and remaining limits. Keep default and candidate behavior distinct. |
| `docs/releases/` | When preparing an assigned release, include extension additions/removals, behavior changes, migration, and rollback in its notes. Until a release is assigned, record the change in the PR; do not invent or advertise an unpublished tag. Preserve historical release evidence. |

Update existing canonical documentation rather than creating a second catalog.
Search for the old package/tool/command name and configuration keys to catch
stale links and examples after a rename or removal. A behavior change must
update existing instructions, not merely append a contradictory new paragraph.

### Minimum package README

Cover the following for every new extension, with explicit “not applicable”
where a section has no corresponding behavior:

- **Purpose and status:** the user problem, supported workflow, and default,
  optional, candidate-only, or external installation status.
- **Requirements and setup:** supported Pi/runtime requirements, dependencies,
  native builds or services, exact selection method, and a minimal working example.
- **Public interface:** registered tools, slash commands, skills and prompts;
  inputs, outputs, defaults, limits, and representative usage. Derive names and
  flags from the implementation, not an older example or memory.
- **Configuration:** keys, defaults, scope, file locations, and environment or
  protected-file secret references. Never include real credentials or host identities.
- **Effects and boundaries:** files read/written, persistence, network/provider
  calls and possible cost, permission checks, cancellation, and failure behavior.
  Document any limitations that matter when deciding whether to enable it.
- **Verification:** the supported test command, what it checks, and any live
  smoke-test procedure. Clearly separate passing offline tests from live evidence
  and from blocked or unperformed tests; do not fabricate verification results.
- **Disable, upgrade, and rollback:** resource deselection, migration requirements,
  retained data, and how to return to the previous pin without deleting user state.
- **Provenance:** link to `UPSTREAM.md` and retained license notices.

For a verbatim upstream import, preserve the imported bytes and supply missing
bundle-specific guidance in the catalog or a separate local integration document
linked from it. If modifying an imported README, reclassify the package as a
patched fork and record that divergence; do not keep claiming byte identity.

## Verification and completion gate

Before requesting merge:

1. Compare the changed files with the documentation table above. Update every
   affected surface in the same PR, including user-visible changes discovered
   during debugging or review.
2. Check documented tool names, flags, defaults, entrypoints, and relative links
   against the final tree. Keep copyable instructions short and examples generic.
   Do not enable resources, call paid services, or mutate a host simply to check
   a documentation example.
3. For behavior changes, run the affected workspace's declared suite with
   `npm test --workspace <workspace-name>`. Use the package's declared tooling
   and the committed locks; inspect [scripts/test-matrix.txt](scripts/test-matrix.txt)
   for the CI/release matrix. Add meaningful regressions for changed behavior.
   For documentation-only edits, check links, referenced paths, accuracy, and
   `git diff --check`; a full runtime suite is not required solely for prose edits.
4. Complete [.github/pull_request_template.md](.github/pull_request_template.md).
   List documentation files updated, verification actually run, and any applicable
   exclusions with a reason. Missing docs are unfinished work, not an exclusion.
5. State remaining failures or blocked live tests accurately. Never turn an
   implementation claim or a model's self-assessment into verification evidence.

These instructions and the PR checklist are review requirements. Do not claim
the existing CI automatically checks documentation coverage: it currently runs
the dependency audit and offline test matrix.

## Release completion gate

Deliver repository changes, including documentation-only changes, through a
release by default. This is standing release intent; do not stop at a local
branch or merged PR. An explicit user request for a draft, local-only work, or
no publication takes precedence. Group the coherent task into one release;
do not cut a release for every intermediate commit.

1. Choose the next unused `anvil-vMAJOR.MINOR.PATCH` after checking published
   releases and remote tags. Use a patch for compatible fixes/documentation, a
   minor version for compatible new capabilities, and a major for breaking changes.
2. Update `docs/releases/<tag>.md` in the PR with the resulting behavior,
   validation, migration/rollback, and known limitations. Update current install
   examples when the recommended pin changes; preserve historical evidence.
3. Merge through the normal PR process and wait for green CI on the exact
   merged commit. Run `scripts/release.sh <tag>` from its clean checkout. The
   script performs clean-room verification and creates the immutable tag.
4. **Publish the artifact too.** The current script only creates/pushes the tag.
   Follow the artifact-publication steps in `CONTRIBUTING.md`: archive the exact
   tagged tracked source, publish that `.tar.gz` and `SHA256SUMS` as GitHub Release
   assets, and publish the prepared release notes. Include manifests, locks,
   source, documentation, and license/provenance records; exclude installed
   dependencies, credentials, operator state, and unrelated working-tree files.
   GitHub's automatic source links or a temporary CI artifact alone do not
   satisfy this release requirement.
5. Download the published assets, verify their checksum, and confirm the remote
   tag resolves to the verified merge commit. Record the release URL, tag,
   commit, artifact name/digest, and relevant check results in the handoff.
6. Mark delivery complete only after publication and verification succeed. If
   an external gate blocks publication, report the exact gate and retained
   progress; do not claim release completion or bypass protections. A retry
   uses the same verified bytes and commit, never a moved tag or overwritten
   asset. Inspect any existing release/assets before resuming a partial publish.

Release publication does not authorize changing an installed Pi pin or deploying
to hosts. Retain the user's working baseline and document the previous release
as the rollback target.

## Runtime and release boundaries

- Keep offline tests independent of network and provider calls. Preserve
  cancellation, bounded outputs, and permission boundaries when adding tools.
- Preserve explicit resource selection and the working baseline. Adding a
  package must not silently activate optional/candidate resources on a host.
- Keep private paths, topology, corpora, tokens, and operator configuration out
  of tracked files. Use generic examples and protected secret references.
- Keep imports auditable, retain notices, and commit lockfile changes alongside
  dependency changes. Do not silently run unreviewed dependency install scripts.
- Release only through the workflow in `CONTRIBUTING.md`: reviewed merge, clean
  exact commit, green CI, and a new immutable `anvil-vMAJOR.MINOR.PATCH` tag.
  Publication and local/fleet activation are separate actions. Do not overwrite
  tags or change a user's Pi pin as an incidental documentation update.

## Extension and plugin license policy

- MIT extensions and plugins may be admitted for reviewed forks or modifications,
  with exact provenance, integrity information, and their license retained.
- Apache-2.0 extensions and plugins may be used as official, unmodified upstream
  installations directly in Pi or as external tools. Do not fork, patch, vendor,
  or bundle their extension/plugin code into `anvil-extensions`.
- Record external installations in `fakoli/ai-infra`, including the exact source
  and version, dependency lock, install command, explicit Pi selection, verification,
  and rollback. Keep host paths and credentials in private configuration.
- This is the operator's maintenance policy, not a claim that Apache-2.0 legally
  forbids modification. Transitive libraries retain their own license notices.
- Context7 uses only the official MIT-licensed plugin, as an optional explicit
  selection. Do not restore the custom wrapper or enable Context7 by default.

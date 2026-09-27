# Anvil Extensions 0.15.1

Restructures the `pi-ship-loop` skill (added in 0.15.0) into a
**repository-agnostic core loop** plus a **filled-in repository
profile** for anvil-extensions. The bundle contains 20 packages and 17
registered extension entrypoints (unchanged).

The skill's core loop (worktree prep → draft PR → fresh-context
adversarial review → fix + sign-off → merge → immutable versioned tag
→ published, checksummed artifact → download-verify → user-authorized
install → handoff record) now degrades gracefully for repositories
without CI (recorded no-CI; tag the merged commit) and without
release-gate tooling (tag + publish directly), so the procedure can be
generated for any repository setup. The anvil-extensions profile keeps
the repo-specific parameters: `anvil-vX.Y.Z` tags,
`scripts/release.sh` from a clean `origin/main` checkout,
`docs/releases/<tag>.md` committed in the PR,
`anvil-extensions-<tag>.tar.gz` artifact naming, and the
user-authorized `pi install` step.

**Validation:** the generic core was executed end-to-end on a scratch
repository (`fakoli/ship-loop-test`) with no release tooling and no CI:
worktree → PR → fresh-context review → merge → `v0.1.0` immutable tag
on the exact merge commit → published tarball + `SHA256SUMS` →
download/checksum/byte-identity verification. Package docs (README,
UPSTREAM) record the derivation and the validation.

## Verification and limits

The package ships no executable code, so it has no test suite
(recorded in `scripts/test-matrix.txt`). Verification is by inspection:
`git diff --check` clean, relative links resolve, and the skill's
commands match `CONTRIBUTING.md`'s publication procedure and
`scripts/release.sh` behavior. No trust boundary changes (prompt text
only). The full bundle test matrix runs green in CI on the tagged
commit.

## Upgrade and rollback

Install `git:github.com/fakoli/anvil-extensions@anvil-v0.15.1` and start
a fresh Pi session; the updated `ship-loop` skill loads with the
bundle's default skill set. No existing host pin or running session is
changed by publication.

To roll back, install
`git:github.com/fakoli/anvil-extensions@anvil-v0.15.0` and start a
fresh session. The skill stores no state; there is nothing to migrate.

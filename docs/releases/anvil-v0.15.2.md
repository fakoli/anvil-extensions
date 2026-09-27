# Anvil Extensions 0.15.2

Strengthens the `pi-ship-loop` skill's merge/verification band from
corpus mining of the operator's actual shipping sessions (72 Codex
session files + Pi coding-agent sessions). The bundle contains 20
packages and 17 registered extension entrypoints (unchanged).

Added to the repository-agnostic core:

- **Pinned merges** — `gh pr merge N --<strategy> --match-head-commit
  <sha>`; a plain merge silently takes a moved head (the corpus's
  dominant pattern, ~76 session files).
- **Pre-merge identity checks** — `headRefOid` must equal the
  reviewed/CI-tested SHA; tree-diff when the base moved.
- **Stale-head CI guard** — watch with `gh pr checks --watch`, verify
  the green run's `headSha`, cancel stale runs after a push.
- **Post-merge verification** — `state,mergedAt,mergeCommit`; the
  `mergeCommit` is the tag target.
- **SHA-pinned review verdicts** — the review verdict names the exact
  head SHA it reviewed; a push voids it.
- **Commit-pinned releases** — `--target <sha>` / `--verify-tag`, never
  a branch.
- **Approval records** — user authorization for publish/install is
  recorded before acting.
- **Receipt-backed handoff record** — every claim points to a stored
  receipt re-verifiable from the remote.

The anvil-extensions profile gained the merge convention
(`--merge --match-head-commit`) and notes that
`docs/releases/<tag>.md` doubles as the release ledger.

## Verification and limits

The package ships no executable code, so it has no test suite
(recorded in `scripts/test-matrix.txt`). Verification is by inspection:
`git diff --check` clean, relative links resolve, and the skill's
commands match `CONTRIBUTING.md`'s publication procedure and
`scripts/release.sh` behavior. No trust boundary changes (prompt text
only). The full bundle test matrix runs green in CI on the tagged
commit.

## Upgrade and rollback

Install `git:github.com/fakoli/anvil-extensions@anvil-v0.15.2` and
start a fresh Pi session; the updated `ship-loop` skill loads with the
bundle's default skill set. No existing host pin or running session is
changed by publication.

To roll back, install
`git:github.com/fakoli/anvil-extensions@anvil-v0.15.1` and start a
fresh session. The skill stores no state; there is nothing to migrate.

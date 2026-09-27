# Anvil Extensions 0.15.0

Adds `pi-ship-loop`, a default-discovered skill that encodes this
repository's release completion gate as an agent-executable procedure.
The bundle now contains 20 packages and 17 registered extension
entrypoints (the new package adds a skill, no extension entrypoint and
no runtime dependency).

**pi-ship-loop** is a pure prompt resource: one skill file
(`skills/ship-loop/SKILL.md`), no tools, no commands, no code, no
dependencies. It turns the prose gate in `AGENTS.md` / `CONTRIBUTING.md`
— reviewed merge → clean exact commit → green CI → immutable
`anvil-vMAJOR.MINOR.PATCH` tag → published, checksum-verified artifact →
handoff record — into ten ordered steps an agent can execute without
re-deriving them: worktree prep with all doc surfaces in one PR, draft
PR, fresh-context read-only adversarial review with severity +
`file:line` findings, fix + sign-off, merge on green CI,
`scripts/release.sh` from a clean `origin/main` checkout, artifact
publication (tarball + `SHA256SUMS` + `gh release create --verify-tag`),
download-and-verify, user-authorized `pi install`, and the handoff
record (release URL, tag, commit, digest, rollback target).

It is a generalization of the procedure executed end-to-end for
`anvil-v0.14.0`; operator-specific host details are deliberately kept
out of the tracked text, per the repository's rule to keep operator
configuration untracked.

## Verification and limits

The package ships no executable code, so it has no test suite (recorded
in `scripts/test-matrix.txt`). Verification is by inspection: relative
links resolve, the skill's commands match `CONTRIBUTING.md`'s
publication procedure and `scripts/release.sh`'s actual behavior
(tag-only; publication is separate), and the full bundle test matrix
runs green in CI on the tagged commit. The skill changes no trust
boundary: it is prompt text and grants no new permissions.

## Upgrade and rollback

Install `git:github.com/fakoli/anvil-extensions@anvil-v0.15.0` and start
a fresh Pi session. The `ship-loop` skill loads with the bundle's
default skill set; no existing host pin or running session is changed by
publication, and no optional/candidate resource is activated.

To disable, deselect the `ship-loop` skill with `pi config`. To roll
back, install `git:github.com/fakoli/anvil-extensions@anvil-v0.14.0`
and start a fresh session. The skill stores no state; there is nothing
to migrate.

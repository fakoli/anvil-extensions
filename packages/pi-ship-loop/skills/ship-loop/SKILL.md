---
name: ship-loop
description: Ship a coherent change end-to-end through a release gate: worktree, PR, adversarial review, sign-off, merge, immutable versioned tag, published checksummed artifact, verification, optional install, handoff record. Generic core plus a filled-in profile for this repository.
---

# Ship-Loop — delivering a change through a release gate

A release gate makes "published and verified" the definition of done: a
merged PR or a tag alone is not delivery. This skill is the
agent-executable procedure for that gate. The **core loop is
repository-agnostic**; the **repository profile** at the bottom fills in
the parameters for this repo. To use the skill in another repository,
keep the core and write its profile (tag convention, gate tooling,
artifact name, install step).

## Core loop (any repository)

1. **Prep.** Work in a dedicated worktree on a feature branch off the
   default branch. Every affected surface (docs, manifests, test
   registries, provenance ledgers) is updated in the SAME PR. Missing
   docs are unfinished work.
2. **Draft PR.** Push the branch; open a draft PR with: summary,
   wiring/manifest changes, verification actually run (state
   environment-blocked suites accurately), docs updated, exclusions.
3. **Adversarial review.** Dispatch a fresh-context, read-only reviewer
   subagent against the diff (`git diff <base>..<head>`). Give it the
   semantics to verify and the attack vectors relevant to the change;
   require severity + `file:line` findings and a
   ship / ship-with-fixes / reject verdict. Restate any facts that
   exist only in omitted tool output — the reviewer sees none of this
   session.
4. **Fix + sign-off.** Address findings in a visible commit; re-run the
   review on the fixed diff until the verdict is approve-merge.
5. **Merge.** If the repo has CI, it must be green on the exact head
   before merging. If it has no CI, record that explicitly and tag the
   merged commit (optionally add a minimal CI workflow first).
6. **Immutable versioned tag** on the exact merged commit, following
   the repo's tag convention (e.g. `vX.Y.Z` or a prefixed form; minor
   for new capability, patch for fixes/docs, major for breaking). If
   the repo ships a release-gate script, run it from a clean checkout
   of the default branch (it typically enforces clean tree + CI green +
   tag); otherwise create and push the tag directly. Never move or
   overwrite a tag.
7. **Publish the artifact.** Archive the exact tagged source
   (`git archive`), add a checksum file (`SHA256SUMS`), and publish
   both as release assets with the release notes
   (`gh release create --verify-tag --notes-file ...`). The notes file
   lives in the PR when the repo requires it; otherwise a temp file is
   fine.
8. **Verify publication.** Download the published assets;
   `shasum -a 256 -c`; compare local vs downloaded bytes; confirm the
   remote tag resolves to the exact merged commit.
9. **Activate/install — only when the user authorizes it.**
   Publication never changes an installed selection. The install step
   is repo-specific (e.g. a package-manager pin update for a bundle);
   verify the installed state afterwards.
10. **Handoff record.** Release URL, tag, commit SHA, artifact name +
    SHA-256 digest, check results, and the previous version as the
    rollback target.

## Pitfalls (generic)

- Release notes (wherever the repo keeps them) must exist before
  publication; the gate does not create them for you.
- Tags are immutable: after a partial publish, re-publish the SAME
  verified bytes and inspect the existing release/assets first — never
  `--clobber`, overwrite, or move the tag.
- Do not claim completion from a merged PR or a tag alone: the
  published, checksum-verified artifact is the delivery.
- The reviewer must be fresh context and read-only; pass it everything
  it needs in the prompt.
- Environment-blocked checks are reported as blocked, never papered
  over; an authoritative clean-room run (if the repo has one) is the
  final word.
- New selections activate only in fresh sessions; the running session
  keeps the old tree.
- Keep operator-specific configuration (host paths, personal tool
  locations, private topology) out of tracked files.

## Repository profile: anvil-extensions

- **Tag convention:** `anvil-vMAJOR.MINOR.PATCH` (immutable via
  repository rulesets).
- **Gate tooling:** `bash scripts/release.sh <tag>` from a clean
  checkout at `origin/main` (fresh temporary clone is safest). It
  runs the clean-room verification (scratch archive, `npm ci` against
  the committed lockfile, static checks, full `scripts/test-matrix.txt`
  matrix), waits for green CI on that exact commit, then creates and
  pushes the tag. Ensure `gh` and `bun` are on PATH (the script
  prepends the standard locations itself).
- **Release notes:** `docs/releases/<tag>.md` MUST be committed in the
  PR before merge; publication uses it as `--notes-file`.
- **Artifact:** `anvil-extensions-<tag>.tar.gz`
  (`git archive --format=tar --prefix=anvil-extensions/ <tag> |
  gzip -n`) + `SHA256SUMS`, published with
  `gh release create <tag> --repo fakoli/anvil-extensions
  --verify-tag --title "Anvil Extensions <version>" --notes-file
  docs/releases/<tag>.md`.
- **Verify:** `gh release download` both assets; `shasum -a 256 -c
  SHA256SUMS`; `cmp` local vs downloaded; `git ls-remote origin
  refs/tags/<tag>` → the exact green merge commit.
- **Install (user-authorized only):**
  `pi install git:github.com/fakoli/anvil-extensions@<tag>`; verify
  the checkout commit, the settings pin, and run new packages'
  offline suites from the installed tree.
- **Rollback target:** the previous `anvil-v*` tag.

## Verification

- The remote tag resolves to the exact green merge commit.
- The published archive + checksum file are on the release; the
  downloaded copies checksum-verify and are byte-identical to the local
  artifact.
- After an authorized install, the installed state matches the release
  commit and the new resources' checks pass.
- The handoff record contains release URL, tag, commit, artifact
  digest, and the rollback target.

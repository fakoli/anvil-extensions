---
name: ship-loop
description: Ship a coherent change to anvil-extensions end-to-end: draft PR, adversarial review, sign-off, merge, release gate (immutable tag + published, checksum-verified artifact), optional host install, and the handoff record.
---

# Ship-Loop — delivering a change to anvil-extensions

The repository's AGENTS.md makes a release the completion gate: a merged PR
or a tag alone is not delivery. This skill is the agent-executable
procedure for that gate, from "work is done in a worktree" to "verified,
published, and (optionally) installed".

## When to Use

- A coherent change (package, fix, or docs) is finished in a worktree and
  the user says ship / merge / release.
- A merged PR still needs its release gate completed (tag + artifact).
- Resuming a partially published release (inspect the existing release
  first; publish only the missing pieces with the same verified bytes).

## Procedure

1. **Prep.** Work in a dedicated worktree on a feature branch off the
   default branch. Every affected doc surface is updated in the SAME PR:
   root `README.md`, `docs/packages.md`, the package `README.md` +
   `UPSTREAM.md`, `docs/forks.md`, `docs/security.md` (when trust
   surfaces change), `scripts/test-matrix.txt`, root `package.json` +
   lockfile. A new extension always requires documentation; missing docs
   are unfinished work.
2. **Draft PR.** Push the branch and open a draft PR with: summary
   (per-package table), bundle wiring, verification actually run (state
   environment-blocked suites accurately — e.g. a suite that needs a
   runtime not installed here), docs updated, exclusions.
3. **Adversarial review.** Dispatch a fresh-context, read-only reviewer
   subagent against the diff. Give it the exact diff range
   (`git diff <base>..<head>`), the semantics to verify against the
   originals, and attack vectors: semantic fidelity, security (paths,
   PIDs, file writes, HTML/XSS, exec injection), Pi extension API
   misuse, bundle-convention gaps, test quality. Require severity +
   `file:line` findings and a ship / ship-with-fixes / reject verdict.
   Facts that exist only in omitted tool output must be restated in the
   review prompt — the reviewer sees none of this session.
4. **Fix + sign-off.** Address findings in a visible commit, then re-run
   the review on the fixed diff until the verdict is approve-merge.
5. **Merge.** CI must be green on the exact head (`gh pr checks`), then
   `gh pr ready` + `gh pr merge --merge` (repo convention: merge
   commits).
6. **Release gate.** From a CLEAN checkout at `origin/main` (a fresh
   temporary clone is safest; the script hard-fails on dirty trees or
   non-main HEADs):
   - Ensure `gh` and `bun` are on PATH (the release script prepends the
     standard locations itself).
   - Pick the next unused `anvil-vX.Y.Z`: check `git ls-remote --tags`
     and `gh release list`. Minor for new packages/capabilities, patch
     for fixes/docs, major for breaking changes.
   - `bash scripts/release.sh <tag>` — runs the clean-room verification
     (scratch archive, `npm ci` against the committed lockfile, static
     checks, full test matrix), waits for green CI on that exact commit,
     then creates and pushes the immutable tag.
7. **Publish the artifact.** The script tags only; publication is
   separate:
   ```bash
   ASSET="anvil-extensions-<tag>.tar.gz"
   git archive --format=tar --prefix=anvil-extensions/ <tag> | gzip -n > "$ASSET"
   shasum -a 256 "$ASSET" > SHA256SUMS
   gh release create <tag> --repo fakoli/anvil-extensions --verify-tag \
     --title "Anvil Extensions <version>" \
     --notes-file "docs/releases/<tag>.md" "$ASSET" SHA256SUMS
   ```
8. **Verify publication.** `gh release download` both assets;
   `shasum -a 256 -c SHA256SUMS`; `cmp` local vs downloaded;
   `git ls-remote origin refs/tags/<tag>` must resolve to the exact
   green merge commit.
9. **Install to host — only when the user authorizes it.** Publication
   never changes an installed pin. When authorized:
   `pi install git:github.com/fakoli/anvil-extensions@<tag>`; verify the
   checkout commit, the settings pin, and (for new packages) run their
   offline suites from the installed tree.
10. **Handoff record.** Release URL, tag, commit SHA, artifact name +
    SHA-256 digest, check results, and the previous tag as the rollback
    target.

## Pitfalls

- `docs/releases/<tag>.md` must be committed IN THE PR before merge —
  the release script does not create it and publication needs it.
- Tags are immutable (repository rulesets). Never move or overwrite a
  tag; after a partial publish, re-publish the SAME verified bytes and
  inspect the existing release/assets before resuming.
- Do not claim release completion from a merged PR or a tag alone: the
  published, checksum-verified artifact is the delivery.
- The adversarial reviewer must be fresh context and read-only; pass it
  everything it needs in the prompt — it cannot see the parent
  session's pruned context.
- Environment-blocked suites (e.g. one requiring a runtime that is not
  installed in the current shell) are reported as blocked, never papered
  over; the release script's own clean-room run is the authoritative
  matrix check.
- A new pin activates resources only in FRESH sessions; the running
  session keeps the old tree.
- Keep operator-specific configuration (host paths, personal tool
  locations, private topology) out of tracked files; this skill is the
  generic procedure, and host specifics belong in private notes.

## Verification

- The remote tag resolves to the exact green merge commit.
- The published tarball + SHA256SUMS are on the GitHub Release; the
  downloaded copies checksum-verify and are byte-identical to the local
  artifact.
- After an authorized install: `pi list` shows the new pin, the
  installed checkout is at the release commit, and new packages' offline
  suites pass from the installed tree.
- The handoff record contains release URL, tag, commit, artifact digest,
  and the rollback target.

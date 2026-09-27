# pi-ship-loop

Agent-executable **ship-loop** skill for this repository: the complete
delivery procedure from "change is done in a worktree" to "verified,
published release, optionally installed" — the release completion gate
that [AGENTS.md](../../AGENTS.md) makes the definition of a finished
change.

## Purpose and status

The bundle's release gate (reviewed merge → clean exact commit → green CI
→ immutable `anvil-vMAJOR.MINOR.PATCH` tag → published, checksum-verified
artifact → handoff record) is prose in `AGENTS.md` and `CONTRIBUTING.md`.
Agents executing it re-derive the ordered steps, the exact commands, and
the failure classes every time. This package turns that loop into a
discoverable skill so any agent session in this repository can run it
without re-deriving it.

Status: **default-discovered skill** (registered in the root
`package.json` `pi.skills`). It is a pure prompt resource: no extension
entrypoint, no tools, no commands, no runtime code, no dependencies.

## Requirements and setup

- No install step beyond the bundle: the skill is discovered with the
  bundle. Any host with `git`, `gh` (authenticated to
  `fakoli/anvil-extensions`), and `bun` available for the release script
  can follow it.
- Selection: the skill loads with the bundle's default skill set;
  deselect it with `pi config` if unwanted.
- Minimal use: ask the agent to "ship this change" / "complete the
  release gate" in a session where the skill is loaded, or invoke it
  explicitly by name.

## Public interface

One skill: `ship-loop`
([skills/ship-loop/SKILL.md](skills/ship-loop/SKILL.md)).

- **When to use:** a coherent change is finished in a worktree and needs
  to be shipped; a merged PR still needs its release gate; resuming a
  partially published release; or when the procedure needs to be
  generated for a *different* repository (keep the core loop, write
  the repo's profile).
- **Structure:** a **repository-agnostic core loop** (ten steps: prep →
  draft PR → SHA-pinned fresh-context adversarial review → fix +
  sign-off → **pinned merge** (`--match-head-commit`, headSha-verified
  CI, post-merge verification) → immutable versioned tag → published
  checksummed artifact pinned to an exact commit → download-verify →
  user-authorized install with an approval record → receipt-backed
  handoff record) plus a **filled-in repository profile for
  anvil-extensions** (tag convention, merge convention, `scripts/release.sh`
  gate, `docs/releases/<tag>.md` in-PR rule that doubles as the release
  ledger, artifact naming, `pi install` step). The core degrades
  gracefully: no-CI repos record that and tag the merged commit; repos
  without gate scripts tag + publish directly.
- **Limits:** it is a procedure, not automation — the agent executes
  each step with its normal tools. For this repository it assumes the
  repository's own release tooling (`scripts/release.sh`,
  `scripts/release-verify.sh`, `scripts/test-matrix.txt`) is present and
  unmodified; the generic core has no such assumption.

## Configuration

None. The skill carries no settings, environment variables, or secret
references.

## Effects and boundaries

- **Reads:** the repository tree, git state, and (during execution) the
  release tooling's own outputs.
- **Writes:** only what the normal ship steps write — PR/branch commits,
  the release tag, the GitHub Release assets, and (only when the user
  authorizes it) the host's Pi pin via `pi install`.
- **Network:** `gh` calls to the repository's own GitHub remote; `git
  archive`/`gh release` for the artifact. No other network access, no
  provider/model calls, no cost.
- **Trust boundaries:** unchanged by this package — a skill is prompt
  text; it grants no new permissions. The steps it describes carry the
  same (already-documented) authority as `CONTRIBUTING.md` itself.
- **Failure behavior:** every step degrades to the documented
  stop-condition — an external gate blocks publication, the loop stops
  and reports the exact gate; it never bypasses tag immutability or
  publishes unverified bytes.

## Verification

Not applicable in the code sense: the package ships no executable code,
so it has no test suite (recorded in
[scripts/test-matrix.txt](../../scripts/test-matrix.txt)). Verification
is by inspection and live execution:

- `git diff --check` clean; all relative links resolve.
- The skill's commands match `CONTRIBUTING.md`'s publication procedure
  and `scripts/release.sh`'s actual behavior (tag-only; publication is
  separate).
- Live evidence (this repository): the procedure was executed
  end-to-end for `anvil-v0.14.0` and `anvil-v0.15.0` (PR → tag →
  published artifact → verified download → host install).
- Live evidence (any-repo generality): the generic core was executed
  end-to-end on a scratch repository (`fakoli/ship-loop-test`) with no
  release tooling and no CI — worktree → PR → fresh-context review →
  merge → `v0.1.0` tag on the exact merge commit → published tarball +
  `SHA256SUMS` → download/checksum/byte-identity verification.
- Pattern grounding (0.15.2): the pinned-merge, stale-head CI, and
  receipt-discipline steps were added after mining 72 Codex session
  files + Pi sessions for actual shipping commands; the corpus's
  dominant pattern (`gh pr merge … --match-head-commit <sha>`, ~76
  session files) was absent from the skill and is now step 5.

## Disable, upgrade, and rollback

- **Disable:** deselect the `ship-loop` skill with `pi config`, or
  install a bundle pin that predates this package.
- **Upgrade:** install the next bundle pin and start a fresh session.
- **Roll back:** install the previous pin (e.g.
  `git:github.com/fakoli/anvil-extensions@anvil-v0.14.0`) and start a
  fresh session. The skill stores no state; nothing to migrate or
  delete.

## Provenance

Original work for this bundle — see [UPSTREAM.md](UPSTREAM.md). The
skill is a generalized codification of the repository's own release
completion gate; operator-specific host details are deliberately kept
out of the tracked text.

# Provenance ledger

## Classification

**Original work** for the `anvil-extensions` bundle. No upstream source:
this package contains no vendored or forked code.

## Contents

- `skills/ship-loop/SKILL.md` — the ship-loop procedure (ten ordered
  steps, pitfalls, verification checks).
- `README.md` — the package README (minimum-package-README checklist).
- `package.json` — workspace manifest registering the skill directory
  under `pi.skills`.

## Derivation

The skill is a generalized codification of the release completion gate
already defined in this repository's `AGENTS.md` (release completion
gate section) and `CONTRIBUTING.md` (release + publication procedure).
It was written after executing that loop end-to-end for `anvil-v0.14.0`
(PR #24: merge → `scripts/release.sh` → published tarball +
`SHA256SUMS` → download verification → `pi install`).

In the 0.15.1 revision the skill was restructured into a
**repository-agnostic core loop** plus a **filled-in repository
profile** for anvil-extensions, so the procedure can be generated for
any repository setup. The restructuring was validated by executing the
generic core end-to-end on a scratch repository
(`fakoli/ship-loop-test`): no release tooling, no CI — worktree → PR →
fresh-context adversarial review → merge → `v0.1.0` immutable tag on
the exact merge commit → published tarball + `SHA256SUMS` →
download/checksum/byte-identity verification. The core's no-CI and
no-gate-script degradations come from that run.

In the 0.15.2 revision the merge/verification band was strengthened
from corpus mining of the operator's actual shipping sessions (72
Codex session files + Pi sessions): head-pinned merges
(`--match-head-commit`), pre-merge identity checks, post-merge
verification, SHA-pinned review verdicts, stale-head CI guards,
commit-pinned release creation, approval records, and receipt-backed
handoff records. The anvil-extensions profile gained the merge
convention (`--merge --match-head-commit`) and notes that
`docs/releases/<tag>.md` doubles as the release ledger.

## Deliberate omissions

Operator-specific host details (personal tool install locations,
named-reviewer conventions, private paths) are intentionally NOT
tracked here, per the repository's rule to keep operator configuration
out of tracked files. The skill states the generic procedure only;
hosts with environment specifics keep them in private notes.

## License

MIT, same as the rest of the bundle.

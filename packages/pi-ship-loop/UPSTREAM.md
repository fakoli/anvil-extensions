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

## Deliberate omissions

Operator-specific host details (personal tool install locations,
named-reviewer conventions, private paths) are intentionally NOT
tracked here, per the repository's rule to keep operator configuration
out of tracked files. The skill states the generic procedure only;
hosts with environment specifics keep them in private notes.

## License

MIT, same as the rest of the bundle.

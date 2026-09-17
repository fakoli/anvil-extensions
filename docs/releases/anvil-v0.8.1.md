# Anvil Extensions 0.8.1

Repository guidance now requires documentation and release delivery as part of
every completed change. New extensions must ship package instructions, catalog
entries, provenance, verification guidance, and rollback in the same PR.
Existing extension changes update every affected documentation surface.

The new agent guide, contributor rules, and PR template define completion as
a reviewed merge, green checks, a new immutable release tag, published release
notes, and a downloadable tagged-source archive with verified SHA-256 checksums.
They distinguish the existing tag-creation script from the remaining GitHub
artifact-publication steps, including recovery after partial publication.

MIT fork eligibility, external-only unmodified Apache-2.0 extension/plugin
installations tracked in ai-infra, and official optional Context7 selection
remain the repository policy. No extension runtime behavior or default resource
selection changes in this release.

Validation includes documentation path/link and whitespace checks, repository
CI, the clean-room install/audit/test matrix, and downloaded release-asset
verification. Publication is complete only after those release checks pass.

The release asset contains the exact tagged tracked source, manifests, lockfile,
documentation, and notices. It excludes installed dependencies and operator
state. Existing Pi installations stay pinned as configured; no migration is
required. To undo a deliberate upgrade to this release, restore the prior
known-good selection (the preceding bundle release is `anvil-v0.8.0`).

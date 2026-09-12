# Pi capability-upgrade resources

This candidate-only package adds small, explicit resources to the reviewed
bundle. It does not create a task database, a service lifecycle interface, a
general shell MCP server, or an automatic deployment path.

It contains:

- workflow skills and the deterministic changed-path router;
- a local gate runner that fingerprints the full intended Git surface and a
  caller-supplied externally trusted policy before and after each gate, without
  mutating the real Git index;
- a guarded native documentation lookup that requires a package version and
  refuses private-looking query material;
- an isolated MCP adapter factory with no configured servers, no discovery,
  no scripting, and no sampling; and
- a browser-verification skill for a pinned local CLI.

The package includes a Serena read-only configuration template for persistent,
candidate-owned external state and standalone qualification only. The extension
never loads it: adapter registration stays empty until its call boundary can
receive a verified composition.

The local receipt is feedback for the existing State workflow. It is not an
acceptance record. Its caller must explicitly supply the expected task, claim,
baseline, policy SHA-256, and exact approved gate argv list from an
independently approved record outside the checkout. State remains authoritative
for claims, evidence, and human
acceptance until it has a native receipt attachment contract.

Use the selectable compositions in `docs/pi-capability-upgrade.md`; do not
enable an example operational server by copying it into a shared or project
MCP discovery file.

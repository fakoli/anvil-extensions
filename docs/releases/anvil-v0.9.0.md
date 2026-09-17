# Anvil Extensions 0.9.0

First release carrying **pi-brag**, a new extension package ported from
[latent-spaces/brag](https://github.com/latent-spaces/brag) v0.2.2 (MIT,
commit `1f8d9ad`). `/brag` turns the current project into a short, shareable
launch video: the agent inspects the code, plans a 15–25s concept, builds a
Hyperframes composition, passes a programmatic quality gate (WCAG contrast +
layout), renders `brag-output/brag.mp4`, bakes the poster frame, and writes
share copy.

The package registers the `/brag` and `/brag-doctor` commands and four tools
(`brag_doctor`, `brag_render`, `brag_poster`, `brag_fetch_assets`), and ships
the four-step skill workflow. The creative workflow is upstream's (step-1,
step-2, and tones verbatim); the pi glue is original. Music/SFX assets are
deliberately not vendored (~16.5 MB, unclear music license): one tool fetches
them from the pinned upstream commit, and the skill degrades gracefully to a
silent video. The cue-analysis Python script (184 KB) is vendored verbatim
with per-file SHA-256 integrity hashes in the package's `UPSTREAM.md`.

Root-manifest changes: `package.json` gains the `pi-brag` extension and skill
entries (13 extensions total), `scripts/test-matrix.txt` gains the `pi-brag`
workspace, and the catalog/provenance docs (`README.md`, `docs/packages.md`,
`docs/forks.md`, `docs/security.md`) cover the new surface. The bundle now
declares root dependencies (`@upstash/context7-pi`, `pi-mcp-adapter`) and the
pinned `@earendil-works/pi-coding-agent` dev dependency, merged from main
during this cycle.

Validation: 51 offline tests in `packages/pi-brag` (injected executables, real
`tar` extraction, fake render children — no network, no engine in CI), the
full offline matrix via `scripts/test-matrix.txt`, `npm ci` against the
committed lock, and a live pi smoke test of the extension and doctor tool.
An end-to-end render was not run in CI (ffmpeg and the engine CLI are absent
from CI hosts by design); `brag_doctor` reports those prerequisites on the
target host.

No migration is required. To undo an upgrade to this release, restore the
prior known-good selection (the preceding bundle release is `anvil-v0.8.1`);
removing the package directory and its test-matrix line fully removes the
extension.
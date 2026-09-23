# Security and supply-chain posture

This repository is the agent toolchain for a fleet of hosts. That role sets the threat model: **anything that reaches a host executes with full user privileges**, so the discipline here is about keeping every path from "code exists somewhere" to "code runs here" explicit, reviewed, and reversible.

## The model: pins, not floats

Nothing moves unless a maintainer moves it:

- Hosts install from an **immutable tag** (`anvil-v0.6.0`), never a branch, never `latest`.
- **Repository rulesets protect release tags** (`anvil-v*` and the legacy `fakoli-v*` patterns) against deletion and modification, and protect `main` against deletion and force-push.
- Rollback = point the pin at the previous tag. One line, one command.

## Dependency integrity

- `package-lock.json` is committed and must be updated **in the same change** as any dependency change. Transitive dependencies resolve to exact versions with SHA-512 integrity hashes — a reinstall cannot silently pull a different tarball.
- Vendored packages pin their upstream import by **registry integrity hash** (see each package's `UPSTREAM.md`), so even the import step is content-addressed, not version-addressed.
- **Install scripts are gated.** Package lifecycle scripts (the classic npm supply-chain vector) run only for packages explicitly approved by the installer's allowlist. An unapproved script blocks the install rather than executing.

## Identity hygiene

- Commit history carries no real names or personal emails — contributors should commit as their GitHub handle with a noreply email (`git config user.email "<handle>@users.noreply.github.com"`).
- **The retroactive scrub gate:** before any release, all history is re-scanned for real names, personal emails, hostnames, credentials, and identifier-shaped strings. The scan covers commit metadata *and* every blob ever committed; findings are rewritten out of history, not deleted forward.
- Credential material never enters the tree: no `.env` files, no tokens, no capability URLs. Runtime configuration referencing secrets uses environment variables or credential references by name.

## What is trusted, stated plainly

- **Extensions are trusted code.** They run with the user's privileges. The pin protects against upstream drift and accidental mutation — it does not defend against a compromise of this repository or of the maintainers' GitHub accounts. Standard account defenses (2FA, signing) are the mitigations.
- **Atomic cuts both ways.** A bad release reaches every host atomically — which is also why every release is preceded by the offline test suite and why rollback is one command.
- **Vendored forks are owned code.** Patched packages are audited line-by-line at import time and every later diff; verbatim vendored packages stay verbatim so upstream diffs are always reviewable.
- **pi-observations is explicit and bounded.** Its registered entrypoint is inert without `--observation` on a fresh session. Trusted user-agent configuration contains only an exact registered provider/model/profile, never credentials or endpoints. It checks canonical base64 and declared/decoded MIME for PNG, JPEG, WebP, and GIF, normalizes with the existing pinned Sharp dependency (8 MiB input/output, 8M pixels, five-second deadline), and strips metadata. Embedded Pi uses a bounded, cancellable Node 24 decoder child with pipe-only image input/output and no model calls. Animated GIF is explicitly limited to frame one; other animation is refused. Every saved image source must remain exact, unique and ordered even when text-only hooks transform surrounding context. It persists metadata/receipts/tombstones/ledger only under a private user-agent directory, keeps no second raw-image store, and rejects raw or nested media before the primary provider request. Ancestor-only cycle detection permits shared tool schemas, rejects actual cycles, and counts every object occurrence toward the 8,192 traversal limit. Its owner has source, byte, retention, attempt, cumulative-time, and per-call caps; cancellation is propagated. Marked sessions must be closed before deselecting the resource, because deselection removes this guard.
- **pi-brag's trust surface is explicit.** It spawns local processes (`npx hyperframes`, `ffmpeg`/`ffprobe`, `tar`) in the project directory and writes only `brag-output/` plus its own `skills/brag/assets/` directory. The engine child and the ffmpeg/ffprobe steps get a PATH extended with `~/.pi/agent/bin` and `~/.local/bin` (appended, existing dirs only), so binaries in those user-owned directories can be executed by the engine and ffmpeg steps; the `tar` exec keeps the inherited environment, and no other PATH or environment rewriting happens. Network egress is a single tool (`brag_fetch_assets`) fetching a pinned-commit tarball from `codeload.github.com/latent-spaces/brag`; no other brag code path touches the network, and the skill workflow itself runs offline. Renders are long-lived child processes killed by process group on timeout/abort.

## Verification commands

For anyone auditing an install on their own host:

```bash
# What is pinned?
grep -n "packages" ~/.pi/agent/settings.json

# What integrity hashes back the lockfile?
python3 -c "import json; d=json.load(open('package-lock.json')); \
  print(len(d['packages']), 'packages locked')"

# Which lifecycle scripts were approved?
npm install-scripts ls
```
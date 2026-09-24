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
- **pi-browser is explicit and closed.** Its registered entrypoint is inactive unless an empty, fresh Pi 0.85.1 session starts with `--browser`. Startup requires a private, protected `pi-browser.json`: its Pi-user-owned parent is a directory and its file is regular; neither may be a symlink or group- or world-writable. It holds only an absolute configured Chrome/Chromium executable, one or two same-origin public HTTPS page IDs and URLs, a bounded timeout, and an optional fixed Jev export policy; it contains no credentials, provider settings, router endpoint, or arbitrary destination. Linux Node 24 launches the pinned Playwright 1.63.0 worker. Pi receives only configured page IDs in guidance and four closed, read-only tools; the worker returns bounded public-DOM text receipts. It never exposes a page object, screenshot, pixel buffer, raw media, page scripting, form submission, or arbitrary navigation. A partial coverage receipt is incomplete evidence and cannot establish that an element is absent. Observations bind to one Pi session; switching, fork/tree attempts, shutdown, cancellation, deadline, malformed frames, or worker failure close the client. Linux cleanup sends TERM to the detached worker group, then a second TERM after 150 ms for Playwright's own cleanup; the KILL fallback from 300 ms targets that worker group. Jev is off by default and, when enabled, receives only the fixed configured export for an existing opaque observation; it cannot initiate a browser action. Omit `--browser` for a normal session, or restore the prior bundle pin and start a fresh session to roll back. This browser path is independent of `pi-observations`; enabling or disabling one does not alter the other.
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

## Repository diagram skill

`pi-repo-graph` is default-discovered but runs only when its workflow is used.
It invokes Python through Pi's normal bash tool and permission/cancellation
handling; there is no hook, server or new tool authority. Local scans read source
and metadata, then write generated paths/import summaries and caches outside
the source repository. Generated diagrams may reveal private repository names
and paths and should be reviewed before sharing. The HTML loads no remote assets.
Public HTTPS inputs use Git and persist shallow clones in the user's cache.
`--refresh` mutates only that clone. No source files are executed.

The scanner has no model traffic by default. Explicit `--jev` sends at most
16 top-level directory names to TypeSafe System One in one request, potentially
billable. It obtains only `TYPESAFE_API_KEY` from the environment or its exact
entry in `~/.env`; it never sources or logs that file. The skill respects project
credential-access restrictions before invoking this option. Keys and raw source
are absent from the request and generated output. Names and labels are escaped
for HTML; labels cannot create imports. Cancellation can leave partial output;
failed classification falls back to the local diagram. See the package README
for limits, cache cleanup and rollback.

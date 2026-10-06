# Security and supply-chain posture

This repository is the agent toolchain for a fleet of hosts. That role sets the threat model: **anything that reaches a host executes with full user privileges**, so the discipline here is about keeping every path from "code exists somewhere" to "code runs here" explicit, reviewed, and reversible.

## The model: pins, not floats

Nothing moves unless a maintainer moves it:

- Hosts install from an **immutable tag** (`anvil-v0.6.0`), never a branch, never `latest`.
- **Repository rulesets protect release tags** (`anvil-v*` and the legacy `fakoli-v*` patterns) against deletion and modification, and protect `main` against deletion and force-push.
- Rollback = point the pin at the previous tag. One line, one command.

## Dependency integrity

- `package-lock.json` is committed and must be updated **in the same change** as any dependency change. Registry dependencies resolve to exact versions with SHA-512 integrity hashes — a reinstall cannot silently pull a different tarball.
- Git product dependencies record their exact resolved commit in the lock. npm 11 does not record or verify tarball integrity for the Repo Graph Git dependency; its verified release asset checksum is a separate provenance check. Native resource discovery explicitly selects its reviewed skill.
- Vendored packages pin their upstream import by **registry integrity hash** (see each package's `UPSTREAM.md`), so even the import step is content-addressed, not version-addressed.
- **Install scripts are gated.** Package lifecycle scripts (the classic npm supply-chain vector) run only for packages explicitly approved by the installer's allowlist. An unapproved script blocks the install rather than executing.

The bundle's development harness pins unmodified upstream Pi 1.0.4. A root npm
override resolves workspace development/peer references to that single tested
runtime while preserving vendored package manifests. This replaces Pi 0.85.1's
published shrinkwrap, which held vulnerable brace-expansion/undici versions that
ordinary npm overrides could not update. The lock also records patched
source-map-js 1.2.2 and smol-toml 1.9.0. The installed host Pi pin is separate;
publication does not change it. Clean installs must pass the full offline test
matrix and dependency audit before a release.

The two image packages pin unmodified Sharp 0.35.5. Its upstream librsvg fix
addresses [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
added to the advisory database on 2026-10-06. The prior 0.35.4 pin failed the
release audit; this compatible dependency patch changes no image-tool interface.
Registry platform packages and their integrity hashes are recorded in the lock.
The fresh post-patch audit reported zero vulnerabilities; installed Sharp 0.35.5
uses librsvg 2.63.2, and both affected image suites passed.

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
- **pi-anvil-pulse runs a local HTTP server.** `anvil_pulse_start` spawns a detached `node src/server.mjs` bound to `127.0.0.1` by default (the `host` param can change the bind host; the default keeps it off any external interface) and records its PID under `<project>/.anvil-pulse/`. Every check/stop first verifies the recorded PID is THIS package's server for THIS project (`ps` command-line match on the server path and `--pulse-project` marker); a stale or foreign PID is cleaned, never signalled. The server polls the local `anvil` CLI (read-only `status`/event log) and serves the self-contained `dashboard.html`; it makes no external network calls. `anvil_pulse_read` reads from the running dashboard only. On native Windows `ps` is unavailable, so identity verification degrades to a liveness check and stop refuses to signal.
- **pi-handoff writes private files.** Notes are written atomically (tmp + rename) with mode 0600 under `~/.pi/agent/handoff/<repo-key>/` (or `HANDOFF_DATA_DIR`), keyed by project identity (normalized `origin` remote, or git common dir). It runs `git` (read-only `rev-parse`, `remote get-url`, `status --porcelain`, `merge-base --is-ancestor`) to resolve identity and capture state; it never writes into the repository. The session-start banner injects the saved note (capped at 16,000 chars) as a message, not executable code. No network.
- **pi-session-retro reads home session logs and writes one HTML file on request.** It reads `~/.pi/agent/sessions`, `~/.claude/projects`, and `~/.codex/sessions` JSONL (local only, no network, no provider calls) and renders deterministic reports. The `html` mode writes a single self-contained file to a path the agent supplies (no stronger boundary than the built-in write tool); embedded data is `<`-escaped to prevent `</script>` breakout and narrative link schemes are restricted to http/https/mailto. No writes other than the requested HTML path.

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

The root manifest explicitly discovers the locked canonical Repo Graph skill
from `node_modules/repo-graph-agent/skills`; it runs only when its workflow is used.
The Git dependency is fetched during bundle installation. Its runtime and skill
are maintained once upstream; `pi-repo-graph` contains compatibility scripts and
native integration tests only. No install hook, daemon or provider setting is added.
It invokes Python through Pi's normal bash permissions and cancellation. The
scanner reads bounded source/metadata and writes generated diagrams, file
synopses, vectors and caches outside the source. Source files are not executed.
Generated indexes and diagrams can reveal private paths and source evidence;
review them before sharing. The HTML loads no remote assets. Public HTTPS
inputs invoke Git and retain a shallow clone; `--refresh` updates that clone.

Keyword mapping/search uses Python stdlib. Optional semantic setup installs the
committed Python lock and downloads public BGE weights; optional local reranking
downloads MiniLM. FastEmbed is an unmodified distribution library and no model
weights are bundled. Subsequent model queries use cached CPU weights. Local
mapping/search makes no inference API calls. File contents and embeddings remain
local unless explicit Jev export is authorized.

`serve` starts an explicit foreground server bound to `127.0.0.1`, with Host,
Origin and JSON request checks. Status and static files remain responsive during
inference. At most one expensive search runs at once; another receives a busy
response. Stop the process to stop the server. No background service or new Pi
tool authority is installed.

`map --jev` exports up to 16 top-level directory names for advisory labels.
`search --rerank jev` exports the query and up to 32 paths with at most 900 bytes
of evidence per file, under a 48 KiB request cap. Browser Jev use additionally
requires `serve --allow-jev` and explicit reranker selection. These requests may
incur API cost. Project source-export and credential-access rules still apply.
Only `TYPESAFE_API_KEY` is read from the environment or its exact entry in `~/.env`;
that file is never sourced, displayed or logged. Requests pin `jev-1.13.0`, refuse
redirects and make one attempt under bounded socket timeouts and response size.
Failures retain local labels/ranking; unknown failed-call usage is not reported
as free. Model labels cannot create edges, and rerankers cannot add source paths.

A maximum of 512 canonical, validated ranking receipts are cached in the local
index using exact request hashes. Provider extras/echoed requests are discarded;
keys are absent from artifacts. The underlying corpus already contains bounded
source synopses. HTML names and labels are escaped. Cancellation can leave partial
scan/index output; re-run mapping/indexing to recover. See the package README for
limits, retained cache data, disablement and rollback.

# Package catalog

Sixteen packages, fifteen registered extension entrypoints, one pinned unit. `pi-observations` and `pi-browser` are registered but inert until a fresh session opts in with `--observation` or `--browser`. Their image and browser workflows are independent. Each entry covers what it does, why it exists, and how it works. Provenance (original vs vendored vs forked) is summarized here and detailed in [forks.md](forks.md); every package ships an `UPSTREAM.md` ledger beside its code.

| Package | Provenance | Category |
|---|---|---|
| [pi-stratus](#pi-stratus) | original | diagram engine |
| [pi-condense](#pi-condense) | vendored, verbatim | context management |
| [pi-insights](#pi-insights) | original | observability |
| [pi-commentary](#pi-commentary) | original | observability |
| [pi-subagents](#pi-subagents) | vendored, verbatim | orchestration |
| [pi-plan-mode](#pi-plan-mode) | vendored, verbatim | workflow |
| [pi-tool-repair](#pi-tool-repair) | vendored, verbatim | reliability |
| [pi-permission-system](#pi-permission-system) | vendored, verbatim | safety |
| [pi-hermes-memory](#pi-hermes-memory) | forked + patched | memory |
| [pi-sandbox-config](#pi-sandbox-config) | original | safety |
| [pi-nano-banana](#pi-nano-banana) | original (port) | capabilities |
| [pi-voice-clone](#pi-voice-clone) | original (bridge) | capabilities |
| [pi-capability-upgrade](#pi-capability-upgrade) | original + adapted workflow ports | workflow |
| [pi-brag](#pi-brag) | original (port) | capabilities |
| [pi-observations](#pi-observations) | original | optional PNG/JPEG/WebP/GIF vision mediation |
| [pi-browser](#pi-browser) | original | optional read-only public-page observations |
| [pi-stratus](#pi-stratus) | original | cloud/network diagram engine |

## pi-condense

**What:** After the agent settles, completed tool-call batches are summarized; raw outputs are replaced by short stubs in context, and closed chains are compressed. Any pruned output can be recovered on demand through `context_tree_query` by its short ref.

**Why it exists:** Context is the finite resource of every agent session. Raw tool output — file dumps, command logs, search results — dominates tokens long after it is useful. Summarize, stub, and recover beats truncating blind.

**How it works:** A summarizer model runs per batch after `agent-settled` events; the original output is retained retrievable; a pruner-summary message lists the refs so the agent (and you) know what was collapsed.

## pi-insights

**What:** A subtle widget reflecting what the session has actually done — a deterministic, privacy-safe activity ledger, not model narration.

**Why it exists:** Session visibility usually means asking a model to describe itself, which is expensive, lossy, and hallucination-prone. This package derives activity deterministically from the session itself — no second model in the loop, no prompt surface.

**How it works:** Bookkeeping over real events (tools run, files touched, outcomes), rendered as a widget. Observational only: it never modifies context or calls a provider.

## pi-commentary

**What:** A small secondary-model prose commentary rendered below the editor when the agent goes idle — a calm paragraph, not a status line.

**Why it exists:** Dashboards tell you *that* something happened; a paragraph can tell you what it *means*. A cheap secondary model reading the settled session can surface friction, patterns, and one-line observations the primary agent is too busy to note.

**How it works:** On idle, a fixed-size observation of the settled session goes to a configured secondary model; the result renders in a TUI widget. Silence on quiet sessions and on failure; consumed observations restore via supersession; every behavior is covered by an offline test suite (52 tests).

## pi-subagents

**What:** Delegate work to subagents: single tasks, sequential chains, parallel fan-out, forked-context review, async background runs, and intercom coordination.

**Why it exists:** One agent holding all context is the bottleneck — for broad reads, adversarial review, and long side-quests, a fresh-context child with a bounded budget beats polluting the main session.

**How it works:** Registers a `subagent` tool plus supervisor channels; children get their own sessions with budgeted turns/tool-calls; results return hash-verified. Ships its own skill and prompt templates.

## pi-plan-mode

**What:** A read-only plan collaboration mode: exploration stays read-only, the agent asks structured clarification questions, and the final action is a decision-ready plan submission.

**Why it exists:** Planning and execution have different risk profiles. A mode where the worst failure is a bad paragraph — not a deleted file — changes how honestly an agent can explore and propose.

**How it works:** Mode switch gates mutating tools off; a dedicated question tool gathers decisions with meaningful options; plan submission ends the mode. Read-only enforcement is the whole point.

## pi-tool-repair

**What:** Validate-then-repair for common LLM tool-call mistakes — null-filled required fields, stringified arrays, wrong field names, anchor bleed — before the tool executes.

**Why it exists:** Models mis-serialize arguments constantly, and the default outcome is a failed turn and a retry tax. Deterministic repair turns a whole class of failures into non-events, without teaching the model to be sloppier.

**How it works:** A validation pass over the tool-call schema with known repair strategies; repairs are logged so you can audit what was fixed.

## pi-permission-system

**What:** Permission enforcement for tool execution.

**Why it exists:** Agents execute; not every execution should be allowed. Explicit allow/deny/ask grants turn tool access into policy instead of vibes.

**How it works:** Intercepts tool calls against a grant table; denied calls never run, ask-grants require explicit confirmation.

## pi-hermes-memory

**What:** Persistent memory with a token-aware policy (lean core store by default), SQLite FTS5 full-text search across memory and past sessions, secret scanning on writes, auto-consolidation, and procedural skills. 863 tests.

**Why it exists:** Sessions end; work shouldn't evaporate. The policy is deliberate: core memory stays small and curated (pointers over duplication), the long tail lives in searchable stores, and nothing sensitive gets persisted — writes pass a secret scanner first.

**How it works:** Markdown files remain the durable source of truth (human-readable, agent-editable); a SQLite store with FTS5 indexes mirrors them for search; background consolidation keeps the core under cap; skills capture *how*, not just *what*. This fork carries local patches — see [forks.md](forks.md#pi-hermes-memory).

## pi-sandbox-config

**What:** Fail-closed editing of the sandbox run configuration (image, network, caps, container ceiling) with a read-only launch precheck and a `/sandbox` dialog flow.

**Why it exists:** Sandbox configuration is security-relevant configuration. Freeform edits to a security boundary are how boundaries disappear; every write here is validated against the platform's own fail-closed resolver before it lands on disk, and validation failures never touch the file.

**How it works:** Tools expose read-only config resolution/preview plus validated atomic writes (tmp + rename, restrictive modes); project-scope writes accept only the safest field subset.

## pi-nano-banana

**What:** Image generation as native, LLM-callable tools: `image_generate`, `image_edit`, `image_remix` (webpage-styled), and `image_optimize` (local resize/encode), plus an image skill.

**Why it exists:** Images belong in the agent's hand, not on the side. The design carries a budget discipline from its plugin ancestor: one billable call per request, no automatic retries, atomic no-clobber writes, and explicit caps on every input and response.

**How it works:** Tools build typed Gemini requests, stream progress, cancel via signal, and render results in the TUI; `sharp` does all image processing (loaded via dynamic import — see the embedded-runtime note in [forks.md](forks.md#pi-nano-banana)); configuration is shared with sibling tooling via a common config file.

## pi-observations

**What:** An optional, bounded mediator for a fresh Pi session's PNG, JPEG, WebP, and GIF attachments. It replaces primary-model image input with opaque retained references and bounded, text-only inspection envelopes.

**Why it exists:** A primary coding model can use visible-image facts without receiving raw image data, while tool-produced images require an explicit model question instead of an inferred caption.

**How it works:** The registered entrypoint is inert until `--observation` starts an empty fresh session. A trusted user-agent config chooses one exact registered image-capable provider/model; the extension normalizes bounded, MIME-checked images to strict PNG in memory with the existing Sharp library; animated GIF uses only its first frame with an explicit coverage notice, retains no second raw-PNG store, and calls Pi's native registered client with one image and a bounded question. It admits 64 source lifetimes (including tombstones), 256 MiB active bytes, one-hour retention, 32 attempts, 120 seconds cumulative reservation, and 30 seconds per call. Every image-bearing message must exactly match one saved source in order; text-only hook transforms are supported. Altered or missing image sources and compacted history are refused. The primary guard permits shared tool schemas while rejecting actual cycles, media, and traversal beyond 8,192 object occurrences. Its `observation_inspect` tool accepts an opaque reference, a question up to 512 UTF-8 bytes, and optional `follow_up`. Compaction, fork, and tree actions are cancelled while enabled. See [the package README](../packages/pi-observations/README.md).

## pi-browser

**What:** An optional bounded, read-only mediator for one or two same-origin public HTTPS pages. It exposes four tools — capture, resolve, release, and fixed-policy Jev resolve — that exchange only opaque references and text receipts.

**Why it exists:** Public-page facts can be useful in an agent session without giving the primary model browser media, arbitrary navigation, page scripting, or an action channel. This workflow is separate from image observation mediation and does not enable it.

**How it works:** The registered entrypoint is inert until `--browser` starts an empty fresh session with a protected `pi-browser.json`. That configuration fixes the browser executable, one or two page IDs at one HTTPS origin, a per-worker deadline, and the optional fixed Jev policy. The package starts one session-bound client, announces only the configured page IDs in enabled-session guidance, and exposes no configured URLs or settings. Closed tool schemas limit capture intent, predicates, scope, paging, and opaque follow-up IDs. Results are bounded text only; raw media is refused before Pi or its model provider receives it. Session changes and shutdown close the client; fork and tree actions are cancelled while it is active. See [the package README](../packages/pi-browser/README.md).

## pi-brag

**What:** `/brag` turns the current project into a short, shareable launch video: the agent inspects the code, plans a 15–25s concept, builds an engine composition, passes a programmatic quality gate (WCAG contrast + layout), renders `brag-output/brag.mp4`, bakes the poster frame, and writes share copy. Tools: `brag_doctor` (environment checks), `brag_render` (long-running engine-CLI runner with streamed progress and timeouts), `brag_poster` (poster extract + frame-0 bake), `brag_fetch_assets` (one-time music/SFX download). `/brag-doctor` checks prerequisites without an agent turn. Spawned children resolve ffmpeg/ffprobe from the system PATH plus `~/.pi/agent/bin` and `~/.local/bin`, and the skill references record the engine lint patterns that recur in brag-sized compositions (inline timeline registration, tween-owned music volume, SFX-heavy file size).

**Why it exists:** Shipping is the moment worth marking, and the work of making a launch video is exactly what an agent is good at — reading the project and scripting it. Ported from [latent-spaces/brag](https://github.com/latent-spaces/brag) (MIT); the creative workflow is upstream's, the pi glue is ours. Music/SFX assets are fetched on demand rather than vendored (bundle size; music licensing), and the skill degrades gracefully to a silent video.

## pi-voice-clone

**What:** `voice_prompt` assembles a measured-voice writing brief from a style corpus; `voice_check` lints a draft against the owner's mechanical hard rules; `/voice` drives the flow.

**Why it exists:** Imitating a specific person's writing from scratch fails in characteristic ways — filler pleasantries, marketing puffery, hedging stacks, exclamation marks. A registered style corpus plus mechanical rules beats improvised imitation, and the corpus stays style-only: current-task facts come from you, never from the reference documents.

**How it works:** The prompt tool registers the profile, pulls 2–3 real documents as few-shot style references, and attaches the hard rules; the checker lints drafts and every violation must be fixed before delivery.

## pi-capability-upgrade

**What:** Candidate-only resources for deterministic changed-path checks, receipt freshness feedback, guarded public documentation, a pinned local browser workflow, and deliberately disabled-by-default MCP operations.

**Why it exists:** A coding session needs reproducible workflow support without silently importing host configuration, creating another State database, or granting a generic operations surface.

**How it works:** The receipt uses a temporary Git index to bind content and policy identities without changing the operator's index. The documentation wrapper requires an explicit package version and bounded public question. The adapter has an isolated empty configuration, no discovery, scripting, or sampling, and denies every MCP tool call unless a later reviewed candidate supplies a complete policy boundary. See [the candidate guide](pi-capability-upgrade.md).

## How the bundle loads

The root `package.json` declares `pi.extensions`, `pi.skills`, and `pi.prompts` entries; pi loads each entry file through a TypeScript runtime at session start. Runtime modules (`typebox`, the agent core) resolve against pi's own bundled copies, so extensions share the host's versions rather than vendoring their own. Package dependencies install once into the monorepo's node_modules under the committed lockfile.

## pi-stratus

**What:** A cloud/network diagram engine as native, LLM-callable tools: `stratus_render`, `stratus_validate`, `stratus_presets`, `stratus_export`, `stratus_evaluate`, `stratus_jev_status`, `stratus_jev_assess`, and `stratus_cli`, plus `/stratus` and `/stratus-doctor` commands and the `/stratus-evaluate` skill.

**Why it exists:** Agent-created cloud diagrams are usually eyeballed. Stratus makes them deterministic artifacts: a typed JSON spec validates against schema/containment/placement/routing/CIDR/edge-separation gates with supported fixes, then renders reference-grade standalone HTML/SVG for AWS/GCP/Azure — with an evaluation skill that judges agent-created diagrams against gold-standard dimensions instead of impressions.

**How it works:** A typed spec compiles through a deterministic pipeline (normalize → layout → validate → render) with role-aware font floors, measured label masks, and a collision repair that guarantees zero intersecting label pairs; exports cover svg, html, pdf, png, jpeg, and pptx; the JEV bridge is strictly advisory-only (never a gate). See [the package README](../packages/pi-stratus/README.md).

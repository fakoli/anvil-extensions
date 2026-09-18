# pi-brag

Turn the current project into a short, shareable launch video. Port of
[latent-spaces/brag](https://github.com/latent-spaces/brag) (MIT) to the pi
extension ecosystem — see [UPSTREAM.md](UPSTREAM.md) for provenance.

You built it. Now brag about it: the agent inspects your project, plans a
15–25s concept, builds a Hyperframes composition, passes a programmatic
quality gate (WCAG contrast + layout), renders `brag-output/brag.mp4`, picks
and bakes the poster frame, and writes share copy.

## Usage

```
/brag                          # auto tone/format/duration
/brag --tone chaotic           # seven presets, or freeform direction
/brag --tone polished --format vertical
/brag --duration 20 --title "Ship faster"
/brag --no-music --no-sfx      # silent video (also the fallback without assets)
/brag --voice                  # opt-in Kokoro narration
```

`/brag-doctor` checks prerequisites instantly (no agent turn).

## What the extension registers

| Piece | Kind | Purpose |
|---|---|---|
| `/brag` | command | Parses flags, hands the agent a structured kickoff prompt that runs the skill workflow |
| `/brag-doctor` | command | Instant environment check |
| `brag_doctor` | tool | node/ffmpeg/engine-CLI/asset/domain-skill checks |
| `brag_render` | tool | Long-running `npx hyperframes` runner: streamed progress, timeouts, abort-safe |
| `brag_poster` | tool | Poster extraction + frame-0 bake (ffmpeg) |
| `brag_fetch_assets` | tool | One-time download of bundled music/SFX from upstream |

The creative workflow lives in the bundled skill (`skills/brag/SKILL.md` +
references); the tools are pi glue around the fiddly parts.

## Requirements

- Node.js ≥ 22.19
- **ffmpeg + ffprobe** (render, poster, bake) — on PATH, or a static build in
  `~/.pi/agent/bin` or `~/.local/bin`: the tools append both dirs to the PATH
  they give every child process, so installs living there need no shell
  configuration
- The video-engine CLI (`npx hyperframes ...`; first run downloads it) and its
  domain skills (`hyperframes-core` et al.) — `brag_doctor` verifies both
- Network, once, for `brag_fetch_assets` (bundled music/SFX are not vendored;
  see `skills/brag/assets/README.md`)

## Output

```
brag-output/
  brag.mp4                — the rendered video (poster baked as frame 0)
  brag.jpg                — the poster (best settled frame)
  brag-plan.md            — plan and storyboard
  composition-brief.md    — the engine handoff brief
  share-copy.txt          — the share caption
  composition/            — the engine project
```

## Configuration

None. Defaults are in code: output paths under `brag-output/`, per-subcommand
timeouts (`DEFAULT_TIMEOUT_SECONDS` in `src/render.ts`), and the pinned
upstream commit for asset fetches (`src/provenance.ts`). Flags like `--tone`,
`--format`, `--duration` are per-invocation, documented by `/brag --help`
behavior in the skill.

## Effects and limits

- **Writes:** `brag-output/` in the project (video, poster, plan, brief, share
  copy, composition) and, once, `skills/brag/assets/` via `brag_fetch_assets`.
- **Runs:** `npx hyperframes` (long-lived, killed by process group on
  timeout/abort), `ffmpeg`/`ffprobe`, `tar`. Nothing else. Spawned children
  get a PATH extended with `~/.pi/agent/bin` and `~/.local/bin` (existing dirs
  only, appended after the system PATH — system resolution order is
  preserved), so ffmpeg installs in those locations are found without shell
  configuration.
- **Network:** only `brag_fetch_assets`, to `codeload.github.com`.
- **Limits:** durations 5–90s; a canceled poster bake never replaces the
  video; renders settle (rather than hang) if engine descendants keep pipes
  open after a kill. Without assets, videos are silent (`--no-music
  --no-sfx`); voiceover does not depend on the assets.

## Disablement and rollback

Remove the `pi-brag` entries from `pi.extensions`/`pi.skills` in the root
`package.json` (or the whole `packages/pi-brag/` directory plus its
`scripts/test-matrix.txt` line) and re-pin. Nothing persists outside the
project's `brag-output/` and the package's own assets dir — delete those to
fully undo. Downgrade by restoring the previous bundle pin; there is no
migration.

## Tests

```bash
cd packages/pi-brag && node tests/run-tests.mjs
```

Fully offline: flag parsing, argument builders, doctor checks (injected
executables), asset inventory (planted temp trees), poster command builders,
render lifecycle with fake children, real-`tar` extraction end-to-end,
download failure/abort paths. No network, no engine calls.
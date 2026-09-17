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
- **ffmpeg + ffprobe** on PATH (render, poster, bake) — the one thing this
  package cannot do for you
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

## Tests

```bash
cd packages/pi-brag && node tests/run-tests.mjs
```

Fully offline: flag parsing, argument builders, doctor checks (injected
executables), asset inventory (planted temp trees), poster command builders.
No network, no engine calls.
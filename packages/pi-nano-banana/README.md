# pi-nano-banana

Generate, edit, and remix images with Google's Gemini image models (Nano
Banana), or optimize local images to a size and width limit — as native,
LLM-callable pi tools. TypeScript port of the Claude plugin
`fakoli/fakoli-plugins` `nano-banana-pro`, redesigned for the pi ecosystem.

## Requirements

- pi ≥ 0.9.0 (installed as a pi package; see Installation)
- A `GEMINI_API_KEY` with access to the selected model for generation,
  editing, and remixing. The key is read from the environment, then project
  `.env`, then `~/.env` — never pasted into chat, never logged, never stored
  by this package. No API key is needed for optimization or configuration.
- Node ≥ 22.19 and the `sharp` dependency (installed with the package).

## Installation

This package lives in the `fakoli/pi-extensions` monorepo and is activated by
the root manifest (`pi.extensions`) when the repo is installed as a git-pinned
pi package:

```
pi install git:github.com/fakoli/anvil-extensions@<tag>
```

Then bump the pin in `~/.pi/agent/settings.json` (`packages` list).

## Tools (LLM-callable)

| Tool | Purpose | Notes |
|---|---|---|
| `image_generate` | Text → image | `model` (`pro` default, `flash`) or explicit `modelId`; `aspect` (1:1…21:9; extremes need flash); `size` (512/1K/2K/4K); `search` grounding; `out` (.png/.jpg/.jpeg/.webp) |
| `image_edit` | Image + prompt → image | `source` path or `"last"`; static PNG/JPEG/WebP ≤ 12 MiB input, sniffed from bytes; save to a NEW path by default |
| `image_remix` | Webpage style → image | HTTP(S) URL without credentials; page metadata treated as UNTRUSTED reference data; 0–4 downloaded references |
| `image_optimize` | Local resize/encode to a limit | `preset` github/slack/web/thumbnail or explicit `maxSize` + `width`; no API call; source preserved |

All four report the absolute output path in the result text. Existing outputs
are never clobbered without an explicit `overwrite` choice; publication is
atomic (the final path only ever holds a complete image).

### Opt-in image attachment (pi-native critique loop)

By default the generated image is NOT added to the model's context — it renders
inline in the TUI (Kitty/iTerm2/Ghostty/WezTerm/Warp with
`terminal.showImages`) and lives on disk. Pass `attach: true` to also feed the
image back into the model context, enabling direct multimodal
inspect-and-refine loops at a context-token cost (~1–2K tokens/image).

## Commands

- `/image-gallery` — list this session's generated images;
  `/image-gallery last` shows the newest (usable as `source: "last"`).
- `/image-config` — set defaults (model, aspect, size, output dir, remix
  references): user config file, this session only, or reset.

## Configuration

The user config is shared with the Claude plugin:
`${XDG_CONFIG_HOME:-~/.config}/nano-banana-pro/config.json`

```json
{
  "default_model": "pro",
  "default_aspect": "1:1",
  "default_size": "",
  "output_dir": "./.nanobanana/out",
  "max_remix_images": 2
}
```

`NANOBANANA_CONFIG` selects an explicit settings file. The legacy per-project
`.claude/nano-banana-pro.local.md` frontmatter file still overrides user
defaults. A legacy `gemini_api_key` in settings still works as a fallback and
is never echoed or rewritten. Keys are never stored by `/image-config` —
`saveUserSettings` strips any credential field on write.

Relative output paths resolve per tool call from the tool's working directory.

## Models and image parameters

Aliases verified against Google's official documentation on 2026-09-05 and
re-checked 2026-09-12:

| Value | Model ID | Use |
|---|---|---|
| `pro` (default) | `gemini-3-pro-image` | Complex compositions and professional assets |
| `flash` | `gemini-3.1-flash-image` | Faster general image generation and editing |
| explicit ID | supplied Gemini model ID | Pin another model (including previews; preview IDs use the `v1beta` endpoint) |

Both aliases support 1K/2K/4K and Google Search grounding. Flash adds 512 and
extreme aspect ratios (1:4, 4:1, 1:8, 8:1). Known-incompatible
parameter/model pairs are rejected before any API call. Requests use the
documented `generateContent` `imageConfig` fields.

For `search`, grounding source links are returned as untrusted reference
data and surfaced in the tool result for attribution.

## Remix behavior and limits

Remix fetches up to 2 MB of page HTML and reads metadata, inline CSS
colors/fonts, social image URLs, and icons. It handles HTML attribute order,
entities, and relative image URLs; every redirect hop is validated. It does
not render JavaScript or fetch linked stylesheets. Page content is labeled as
untrusted style-reference data in the prompt.

`maxImages` accepts 0–4 (default from config, 2). Reference downloads are
capped at 12 attempts, 20 s per request, and 4 MB per image (`maxBytes` up to
12 MB). Invalid or animated images are skipped. Uploads are limited to 12 MiB
per inline image and 20 MB per request; responses to 64 MiB.

## Optimization

Preset maximums (powers-of-1024 KB/MB): `github` 500 KB / 1280 px (default),
`slack` 128 KB / 800 px, `web` 200 KB / 1200 px, `thumbnail` 50 KB / 400 px.
Preserves aspect ratio, applies the width constraint, then shrinks (bounded
64-pass loop) until the encoded output fits — or fails without writing
anything. Animated inputs are rejected. Output defaults to
`<stem>-optimized.png`.

## Safety model (inherited from the original plugin)

- ONE billable API call per generation; failures and timeouts are NOT retried
  automatically (completion and billing would be uncertain).
- HTTP status errors omit response bodies (they may echo the prompt or
  credentials).
- No-image responses report finish/block reasons and write nothing.
- API keys never appear in logs, errors, or tool results.

## Differences from the Claude plugin

- Native typed tools instead of `uv run --script` shell-outs; no Python.
- sharp instead of Pillow; minimal .env/YAML-frontmatter parity parsers.
- Opt-in multimodal attach replaces the separate critic-agent persona.
- Generated images are stored on disk; session records hold paths only.
- Same on-disk config file, key precedence, safety caps, and output behavior.

## Development

```
npm install            # workspace install (sharp + peers)
node packages/pi-nano-banana/tests/run-tests.mjs   # offline suite (35 tests)
```

Tests are offline: Gemini traffic is stubbed, sharp exercises real bytes.

## License

MIT — see UPSTREAM.md for provenance.
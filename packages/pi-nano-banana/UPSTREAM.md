# pi-nano-banana — upstream provenance

- Package: pi-nano-banana v0.1.0 (2026-09-12)
- Status: **original (this repo)** — TypeScript port, not verbatim
- Source of the port: `fakoli/fakoli-plugins` `plugins/nano-banana-pro` v1.4.0
  (same author, MIT), at commit `c9f0e35` (2026-09-05-era plugin state)
- License: MIT

## Port notes

Faithful port of the Python engine (`nanobanana.py`, `image_io.py`,
`optimize.py`) to TypeScript with identical request-building, validation,
safety, and output behavior. Host glue was redesigned for pi:

- Claude Code slash commands + `uv run --script` subprocess → native
  `pi.registerTool()` tools (`image_generate`, `image_edit`, `image_remix`,
  `image_optimize`) and `/image-config`, `/image-gallery` commands
- 5 optional agent personas → the driving model's native multimodal critique
  loop (opt-in `attach` parameter feeds the generated image back into context)
- Pillow → sharp; python-dotenv/PyYAML → minimal parity parsers
- Generated images live on disk; tool details store paths, not base64 blobs
  (session-file bloat guard). TUI renderers load images at render time.

Preserved from the original, non-negotiable:

- One billable API call; no automatic retries (completion and billing are
  unknown after a failure or timeout)
- Atomic output publication; existing outputs never clobbered without an
  explicit overwrite choice
- Key precedence `GEMINI_API_KEY` env → project `.env` → home `.env` → legacy
  settings key; placeholders ignored; keys never echoed or logged
- 12 MiB inline input / 20 MB request / 64 MiB response caps; static PNG,
  JPEG, or WebP only
- Remix page metadata is untrusted style-reference data, never instructions
- Search-grounding attribution surfaced as untrusted reference data
- HTTP status errors omit response bodies (may echo prompt or secrets)

Registry-integrity hashes: N/A — original package.
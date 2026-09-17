# pi-brag — upstream provenance

- Package: pi-brag v0.1.0 (2026-09-17)
- Status: **port** — creative workflow adapted, host glue rewritten; not verbatim
- Upstream: `latent-spaces/brag` v0.2.2 (Claude Code plugin / agent skill),
  at commit `1f8d9ade17d0ad4419cca9305fbc1398a4dd5b39` (2026-08-17)
- Upstream license: MIT (© 2026 Shunit Haviv Hakimi)
- Upstream URL: https://github.com/latent-spaces/brag

## What was ported

The full creative workflow — the four-step skill (inspect → plan → compose →
deliver), the seven tone presets, the audio guidance, and every creative law —
carried over with wording preserved wherever it is agent-agnostic.

## What changed and why

Host glue was redesigned for pi; the skill was adapted, not rewritten:

- Claude Code plugin install/trigger → pi extension package: `/brag` and
  `/brag-doctor` commands via `pi.registerCommand()`, skill discovered through
  the package manifest (`pi.skills`)
- New pi-native tools the upstream lacked: `brag_doctor` (environment checks),
  `brag_render` (long-running engine-CLI runner with streamed progress,
  timeouts, abort support), `brag_poster` (poster extract + frame-0 bake),
  `brag_fetch_assets` (one-time asset download)
- Bundled music/SFX (~16.5 MB) **not vendored**: assets dir ships empty,
  `brag_fetch_assets` fills it from upstream (bundle size; the music's
  redistribution license is unclear). Skill degrades gracefully with
  `--no-music --no-sfx`. Kenney SFX are CC0; music is by ende.app.
- Asset-root paths (`~/.claude/skills/brag/assets/`) → package-relative
  `<skill-assets>` resolution; `brag_doctor` prints the exact path
- Vision-optional steps carry an explicit note: delegate snapshot review to a
  vision-capable subagent when the driving model is text-only
- Branding-neutralized per repo convention (no rival-product references in
  prompts or docs; one legacy harness skill directory is kept purely as a scan
  location for backward compatibility)

## Verbatim files

`references/step-1-inspect.md`, `references/step-2-plan.md`,
`references/tones.md` are verbatim from upstream commit `1f8d9ad`.

## Adapted files

- `SKILL.md` — added "pi execution notes" section; assets/cue paths
  generalized to `<skill-assets>`; "in this PR" phrasing fixed; everything
  else preserved
- `references/step-3-compose.md` — `<skill-assets>` resolution paragraph
- `references/step-4-deliver.md` — pi execution note (brag_render/brag_poster),
  vision-delegation note on the snapshot gut-check
- `references/audio.md` — asset-root paths → `<skill-assets>`; repo-copy
  duplication removed

## Original code (this repo)

`index.ts`, `src/*` (flags, paths, doctor, render, poster, fetch-assets),
`tests/run-tests.mjs`, `README.md`, `skills/brag/assets/README.md` — original
TypeScript, MIT, this repo.

Vendored verbatim from upstream (small, referenced directly by the skill's
audio guidance): `skills/brag/scripts/` (`analyze_music_cues.py`,
`pyproject.toml`, `uv.lock`).

Registry-integrity hashes: N/A — source is a public GitHub repository, not an
npm dependency; pinned by upstream commit above.
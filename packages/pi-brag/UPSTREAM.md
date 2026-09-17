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

## Import integrity

Source is a public GitHub repository, not an npm dependency, so there is no
registry integrity hash; the pin is upstream commit `1f8d9ade17d0ad4419cca9305fbc1398a4dd5b39`
(v0.2.2). For the files imported verbatim, integrity is pinned by SHA-256
(generated with `sha256sum` over the files as imported; `tests/run-tests.mjs`
verifies the tree still matches):

```
f296266757dad8e5a0f7f42fb812277d724856215b4b3b5c4bb3c19e35c40e70  skills/brag/references/step-1-inspect.md
f89e99efce1a5dccbdd38b92812437b885a7ec4aac81c4b00069b09fe1fb0072  skills/brag/references/step-2-plan.md
e6ea8c6d3061a8734194cdad2c176b371f3ec41cb85c89306ac549baeebaa59e  skills/brag/references/tones.md
1e5d719289536dd3e8555dda77da58ef89857487b94f8f5f1ba7812f15405deb  skills/brag/scripts/analyze_music_cues.py
47c9a79037ac77732a45e2dc2daf79d286b6cb3b50650b5ed89a2bc093a84c76  skills/brag/scripts/pyproject.toml
b00499c44800f15678e12eae49d1fd798bd3b23ea63e340cd6a42ea2adf0da87  skills/brag/scripts/uv.lock
```
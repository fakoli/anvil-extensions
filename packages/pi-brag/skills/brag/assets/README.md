# Bundled assets (music + SFX)

This directory is intentionally **empty** in the package. The upstream brag
plugin vendors ~16.5 MB of audio here; we do not, for two reasons:

1. **Bundle size** — the pi-brag package is distributed as part of a pinned
   extension bundle; 16.5 MB of audio would dominate every install and update.
2. **Licensing** — the SFX are Kenney assets (CC0, fine to redistribute), but
   the music is by ende.app (via their free music library) and its
   redistribution terms are not clearly stated upstream. Downloading it
   directly from the upstream repository for personal use is the same act the
   upstream plugin performs at install time.

## Getting the assets

Run the **`brag_fetch_assets`** tool once (it downloads the upstream repo
tarball and copies `skills/brag/assets/*` into place), or do it manually:

```bash
curl -L https://github.com/latent-spaces/brag/archive/refs/heads/main.tar.gz -o /tmp/brag.tar.gz
tar -xzf /tmp/brag.tar.gz -C /tmp
cp -R /tmp/brag-*/skills/brag/assets/* .
```

The `brag_doctor` tool reports what is present (music tracks, SFX sets, cue
files) and prints this directory's exact path.

## Working without assets

The skill degrades gracefully: plan and render with `--no-music --no-sfx`.
The video still passes the same check gate; it is just silent. Voiceover
(`--voice`, Kokoro via the engine) does not depend on these assets.

## Layout (after fetch)

```
assets/
  music/            — ende.app tracks (mp3) + cues/ (music-cues.md/.json)
  sfx/              — Kenney impact packs: casino/, impact/, interface/, ui/
                      + keyboard/ (individual keypress set)
  sfx-analysis.md   — SFX inventory and selection guidance
```
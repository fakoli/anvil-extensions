# Anvil Extensions 0.9.1

Patch release fixing a pi-brag tool failure observed in a real `/brag` run,
plus repository hygiene for the files that run creates.

**Behavior fix — ffmpeg resolution.** `brag_render` failed with
"FFmpeg not found" on a host where a static ffmpeg build existed in
`~/.pi/agent/bin` but was not on the parent process's PATH. The pi-brag
engine child (`brag_render`), the ffmpeg/ffprobe steps (`brag_poster`), and
the doctor probes (`brag_doctor`) now hand their children a PATH extended
with `~/.pi/agent/bin` and `~/.local/bin` — existing directories only,
appended after the system PATH so system resolution order is preserved. The
doctor's ffmpeg verdict uses the same augmented PATH, so it reports what the
render and poster tools will actually resolve, and its hint names the two
locations. The `tar` exec in `brag_fetch_assets` keeps the inherited
environment (it never needs user-bin dirs).

**Repo hygiene — generated files stay untracked.** `.gitignore` gains
`brag-output/` (render outputs) and the runtime-fetched
`packages/pi-brag/skills/brag/assets/music/` and `.../sfx/` payloads, so a
completed `/brag` run and a `brag_fetch_assets` fetch leave `git status`
clean. The tracked `assets/README.md` is unaffected.

**Skill documentation — recurring engine lint patterns.** The brag skill
references now record three lint behaviors that cost real iterations in a
brag-sized composition: keep the timeline registration inline in the
composition HTML (an external script file fails `missing_timeline_registry`);
when a tween touches music volume, set `data-volume="1"` and let the tween
carry the absolute level (avoids `audio_volume_tween_overrides_gain`); and
SFX-heavy single-file compositions may trip `composition_file_too_large`,
where consciously accepting the warning usually beats fragmenting global beat
locks into sub-compositions.

Validation: 54 offline tests in `packages/pi-brag` (three new: PATH
augmentation appends only existing dirs and dedupes, `childEnv` preserves
PATH-key casing without mutating its input, and the spawned engine child
receives the augmented env), the full offline matrix via
`scripts/test-matrix.txt`, `npm ci` against the committed lock, and a live
smoke test resolving ffmpeg through the augmented PATH from a stripped
environment. The end-to-end render that motivated the fix was produced with
the pre-fix workaround (explicit PATH export) and is not re-run in CI.

No migration is required. To undo an upgrade to this release, restore the
prior known-good selection (the preceding bundle release is `anvil-v0.9.0`).
The PATH augmentation only adds directories; removing the package or
reverting to `anvil-v0.9.0` restores the previous behavior exactly.

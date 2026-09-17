# pi-condense — upstream provenance

- Upstream: https://github.com/jjuraszek/pi-condense
- Imported at tag v2.10.3, commit 76c2c09b7d273f77f09ac6da2b73295e0704054d (2026-09-07)
- License: MIT (LICENSE retained in this directory). Author: Jacek Juraszek.
- At import, verified against npm tarball pi-condense@2.10.3: shipped files identical.
- Zero runtime dependencies; peerDeps on host @earendil-works/pi-* only.
- Policy: never re-tag fakoli-* refs; import upstream changes only after diff review.

## Local changes

- Apply the existing pruning pipeline to built-in compaction history and split-turn
  prefixes, which bypass the normal context event. Preserve original session entries
  and compaction boundaries; disabled pruning and cancelled compaction remain inert.

- 2026-09-12: package.json development Pi SDKs aligned to the tested 0.85.1
  runtime. This dependency maintenance changes no runtime source files.

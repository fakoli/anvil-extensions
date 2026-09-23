# Anvil Extensions 0.11.1

Fixes `pi-observations:media_guard` aborting ordinary text prompts with the full
registered bundle. Pi shares parameter-schema objects between tools; the guard
previously treated every repeated object as a cycle and aborted before reading
an image or contacting the primary model. It now detects cycles only along the
current ancestor path. Shared non-cyclic schemas pass; actual cycles, image
content, inline image data, and more than 8,192 object occurrences still fail
closed. Every occurrence of a shared subtree counts toward that limit.

## Verification

Regressions cover shared plain schemas, shared media, direct/indirect cycles,
and the traversal limit. The native Pi 0.85.1 loopback probe loads the full
registered bundle and uses the built-in JPEG reader followed by explicit
observation inspection. It checks canonical PNG at vision, no primary media,
and original transcript preservation. Earlier filtered bundle fixtures did
not exercise shared schemas. The full offline clean-room matrix, independent
review, exact-commit CI, and artifact download verification gate delivery.
These are integration checks, not model qualification.

## Upgrade and rollback

Install `anvil-v0.11.1`, preserve local package artifacts/state, and reload Pi.
No transcript migration or configuration change is required. Providers, image
normalization (including first-frame-only animated GIF), session limits,
resource selection, and services are unchanged. Close marked sessions before
rolling back to `anvil-v0.11.0`; that release retains this shared-schema abort.

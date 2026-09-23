# Anvil Extensions 0.11.0

Pi observation sessions accept PNG, JPEG, WebP, and GIF attachments and tool
images. Images normalize in memory with the existing pinned Sharp library;
orientation is applied, metadata is removed, and original transcript entries
remain unchanged. Animated GIF makes only the first frame available for inspection and explicitly
reports that motion and later frames are not included. Other animated and
multi-page formats remain unsupported.

Fixes a reproducible `pi-observations:context_failed` trigger: earlier hooks may
transform text-only context without aborting observation preparation. Every
image-bearing message must still match a unique saved source in order, including
its question and tool identity. Missing, altered, added, or ambiguous image
sources fail closed with a specific error. Invalid inputs produce bounded,
actionable text errors without exposing native decoder messages or raw images.

The 8 MiB input/output and 8 million pixel limits apply to normalization, with a
five-second deadline. Embedded Pi decodes through a bounded Node 24 child because
its native dependency resolver cannot load Sharp; the same normalizer runs in
the child, with pipe-only input/output and cancellation cleanup. Existing source, retention, inspection-budget, lifecycle,
and primary-media guards remain in force. The bundle's resource selection and
primary/vision model configuration are unchanged; `--observation` still opts in
only a fresh session. Sharp 0.35.4 is now an explicit package dependency, reused
from the bundle's existing dependency closure.

## Verification

The package suite passed 22 checks covering formats, orientation, metadata removal, malformed and
oversized inputs, cancellation, first-frame GIF pixels, and exact image-source
mapping. The native Pi 0.85.1 fixture passed preceding text-only transforms,
registered bundle context hooks, common formats, GIF coverage, original
transcript preservation, zero primary media, resume/cache, and lifecycle limits.
The full offline matrix and clean-room release gate are required before push;
exact-commit CI and downloaded artifact verification are required for delivery.
These are integration checks, not model qualification.

## Upgrade and rollback

Install the immutable `anvil-v0.11.0` pin, preserve local package artifacts/state,
and reload Pi. No transcript migration is required. Running sessions are not
restarted by publication. Close marked sessions before returning to
`anvil-v0.10.0`; that release accepts strict PNG only and retains the earlier
text-context compatibility limitation. Normal bundle activation, providers,
credentials, serving routes, and services are not changed by this release.

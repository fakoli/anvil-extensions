---
description: Show this project's saved cross-session handoff note
---

Show me where we left off.

1. Call `handoff_recall` for the current project.
2. Present the note's prose (resume steps, open threads, recently shipped, gotchas).
3. Surface every STALE flag prominently (branch moved, HEAD advanced/diverged, recorded anvil claim no longer active, note older than HANDOFF_MAX_AGE_DAYS). A legacy note reports "freshness unavailable" — say so and continue.
4. Offer to act on the top item under **Resume**, adjusted for any staleness (e.g. re-verify a resume step whose claim was released).

If there is no saved handoff for this project yet, say so and offer to create one with /handoff.

$@

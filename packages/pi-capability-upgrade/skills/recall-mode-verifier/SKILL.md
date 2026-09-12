---
name: recall-mode-verifier
description: Independently review a bounded change for fail-closed behavior, malformed input, resource exhaustion, and state drift.
---

# Independent verification review

Establish the actual working-tree scope and read callers before reading the
new tests. Build probes from required invariants. Label a finding REPRODUCED
only after observing it, SUPPORTED BY CODE when the full reachable path is
shown, and PLAUSIBLE when an explicit assumption remains unverified.

Trace cross-process boundaries: child tools, MCP servers, spawned CLIs, and
browser processes. Verify cancellation, time bounds, identity propagation, and
whether an apparently read-only operation can mutate through another route.
Review-only work changes no production code. An implementation request permits
fixing confirmed findings and rerunning the relevant checks.

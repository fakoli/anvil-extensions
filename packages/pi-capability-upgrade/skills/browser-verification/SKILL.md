---
name: browser-verification
description: Verify a candidate-owned local web flow with the pinned browser CLI and deterministic assertions. Never operate personal accounts or delivery controls.
---

# Browser verification

Use the package-local pinned CLI only. Start a candidate-owned development
server on `127.0.0.1`, use a unique session name and an isolated profile under
the candidate state directory, and record its process id. Do not attach to an
existing browser, use a persistent personal profile, real account, or a
production endpoint.

Assert the intended result and also inspect console and network failures.
Capture bounded screenshots/traces only as supplementary evidence. Cover an
ordinary flow, stale approval or changed mocked head, visible API failure,
console error, rejected action with no mutation request, accessible labels and
keyboard access, and session isolation. Close only the recorded candidate
session and process; do not use global browser or process kill commands.

---
description: Do a session retro — token economy, workflows, steering pattern, and recommendations
---

Run a session retro using the `session_retro` tool.

1. **Locate the session(s) — any session, not only the current one.**
   - `session_retro({ mode: "list", substr? })` — browse sessions (Pi, Claude Code, and Codex logs) with date/runtime/branch/topic breadcrumbs. The newest file is only a candidate: background agents or other projects may be newer.
   - `session_retro({ mode: "find", keyword, substr? })` — find sessions whose **content** mentions a keyword (a PR number like `#93`, a feature name, a filename, an error message), ranked by hit count. This is how to locate "the session where we did X" when I don't remember which one.

   Use the breadcrumbs to select the session; clarify only if several remain equally plausible. Default to the current (newest) session only when I don't name one. For Codex, a main rollout path automatically includes sibling subagent rollouts.

2. **Detect a multi-session arc (optional but valuable).** A feature often spans sessions in different worktrees: look for adjacent timestamps (one ending minutes before the next begins) or the same repo family. Pass every related JSONL path — they combine.

3. **Generate the deterministic report.** `session_retro({ mode: "report", paths })`. It fills: session shape, token economy (generated vs delegated + the cache lines), workflow taxonomy + most-expensive runs, tool distribution — and lists the human turns under "Interaction analysis (fill in)".

4. **Write the narrative — an honest retro, not a victory lap.** Read the human-turn list and skim the session for the key events (merges, failures, course-corrections, retries). Fill in:
   - **Interaction analysis** — one autonomous directive or step-by-step? Where did I intervene, and were those the right calls to reserve for a human? Friction signals (repeated "is it stuck?" = a visibility gap).
   - **Retrospective:**
     - **What went well** — and *why*, so it can be repeated.
     - **What went wrong** — the real problems and the rework they caused.
     - **Where we got lucky** — outcomes that worked out but were not *earned* by the process: a near-miss caught by chance, a guess that happened to be right, an error that surfaced before it mattered. Luck is not skill; naming it shows where the process is fragile.
     - **Five Whys** — take the most important problem and ask "why" five times to reach the root cause, then name the systemic fix (not a band-aid).
   - **Recommendations** — concrete, grounded in the numbers and the Five Whys.

5. **Deliver.** Present the filled-in retro. Optionally build the interactive site: `session_retro({ mode: "html", paths, narrative, writeHtml: "<project>/post-session-findings/retro-<date>.html" })` with the narrative as markdown.

Reads only local session logs (~/.pi, ~/.claude, ~/.codex). Sends nothing externally.

$@

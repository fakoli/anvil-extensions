---
description: Save or update this project's cross-session handoff note
---

Save or refresh the durable, cross-checkout resume note for the current project so the next session — in another clone or a linked worktree — picks up exactly where this one left off.

If I supplied a summary, lead with it. Otherwise inspect the current worktree state (git status, recent commits, open work) and compose a concise handoff.

Steps:

1. Call `handoff_recall` first. If a previous note exists, preserve its still-open items — do not clobber them. (The frontmatter block is machine metadata; never carry it forward.)
2. Compose a tight, scannable note:
   - **Resume** — the 1–3 concrete next actions, most important first (real commands, task IDs, file paths, PR numbers — not vague prose).
   - **Open threads** — pending decisions, WIP, blockers.
   - **Recently shipped** — one or two lines for context.
   - **Gotchas** — non-obvious context the next session will need.
3. Call `handoff_save` with the composed prose (and my summary as `summary` if I gave one). The state frontmatter is captured automatically.
4. Confirm: the path written and a one-line summary of what was saved.

This is the LIVE resume note — overwrite it in place, don't append endlessly. It complements durable memory: memory is for durable facts/preferences; the handoff is "where we are right now."

$@

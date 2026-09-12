---
name: dispatch-packet
description: Produce a self-contained, bounded subagent packet from an already-decided task. It never dispatches or delivers work by itself.
---

# Dispatch packet

Read the task, specification, and target repository first. Refuse to invent
unresolved choices: put them under `Open decisions (BLOCKING)` and return a
blocked packet. Every packet must state its task identity, repository/worktree,
writable scope, constraints, bounded inputs, required tests, and return format.

Start with these two lines verbatim:

```
Begin editing within about five tool calls; the listed anchors are sufficient.
If blocked for more than about five tool calls on open-ended reading, stop and report the blocker.
```

Require file:line anchors that were checked in the target worktree, exact
verification commands, an operator-only section for live/credential work, and
no commit, push, branch change, or merge unless the task explicitly delegates
that authority. A review packet also requires a repro per finding, severity,
and an explicit SHIP / DO-NOT-SHIP verdict.

---
name: ship-loop
description: Carry a bounded change through isolation, grounded implementation, deterministic verification, and review. Use for a requested implementation workflow; stop before external delivery unless separately authorized.
---

# Shipping workflow

Read repository instructions, inspect status and worktrees, and use an isolated
worktree. State task identity, owning repository, writable paths, constraints,
required tests, and return format before delegating. A delegate may not inherit
broader tools than that assignment requires.

Use `gate-check` to select changed-path verification. Create a local receipt
only after passing gates. The receipt is advisory feedback only: it is neither
the native State `claim-command-proof/v1` artifact nor submit-ready evidence.
Do not attach it to `anvil submit --command-proof-file` and do not claim State
freshness or acceptance from it. Review must be independent and must cover
malformed inputs, resource bounds, state drift, and process boundaries.

When the State task already requires command proofs, the separate
`../../scripts/state-proof-workflow.py` can run the exact declared commands
using the pinned Anvil Python environment and an external approved argv policy.
Keep its evidence outside the writable project. Its `--submit-existing` mode
refuses content, policy, claim or proof drift before calling State submit.
It never approves acceptance; direct State calls do not inherit this local guard.

Stop at local commits or a review-ready result unless delivery is authorized.

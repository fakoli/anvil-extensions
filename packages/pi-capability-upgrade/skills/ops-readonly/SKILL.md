---
name: ops-readonly
description: Inspect declared service state, capacity, readiness, and bounded evidence through explicitly configured read-only operations.
---

# Read-only operations

Resolve the declared resource owner first. Inspect state, capacity, readiness,
and bounded logs or evidence. Distinguish observed facts from inferences, and
propose changes separately from executing them. A diagnosis request never
restarts, redeploys, promotes, or changes routing.

Only explicitly enabled server-operation pairs may run. Unknown tools,
renamed tools, repaired calls with changed targets, missing authorization,
undeclared resources, mutation actions, generic API escape hatches, scripting,
and sampling are denied. Keep logs, result count, time window, and timeout
bounded. The portable bundle provides no live operational server by default.

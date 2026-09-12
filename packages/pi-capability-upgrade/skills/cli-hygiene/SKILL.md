---
name: cli-hygiene
description: Review portable CLI changes for encoding, interpreter, quoting, subprocess, and expected-failure handling hazards.
---

# CLI hygiene

Use this only when a task contains portable CLI or shell changes. Check that
output is safe for redirected legacy consoles, interpreter selection is
explicit, literal heredocs are quoted, arguments never become shell code, and
expected failing probes do not terminate a hook prematurely. This is advisory;
pair it with the repository's platform tests. The optional hygiene scanner is
not loaded by the default macOS candidate composition.

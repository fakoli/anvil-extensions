---
name: gate-check
description: Route committed, staged, unstaged, deleted, and untracked paths to trusted project verification commands.
---

# Changed-path verification

The installed package root is the directory that contains this skill's
`../../scripts/gate-router.py`; resolve that path explicitly from the selected
bundle, never by scanning host or project configuration. Run:

```bash
python3 <installed-package-root>/scripts/gate-router.py . --list --json
python3 <installed-package-root>/scripts/gate-router.py . --run
```

Rules come only from the explicit trusted project policy
`.claude/gate-router.local.md`. Treat policy changes as separately reviewed
changes. The router reads NUL-delimited Git paths, includes deleted and
untracked paths, and passes matched names as argv rather than executable text.
Malformed rules, unreadable Git state, and invalid bases fail visibly.

After successful gates, record command, exit result, task identity, content
identity, policy identity, and the externally approved argv list in the local
receipt. A changed content, policy, or approved gate list invalidates the
advisory receipt; it is not a native command proof.

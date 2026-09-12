# Agent instructions

Read `CONTRIBUTING.md` before changing this bundle.

## Extension and plugin license policy

- MIT extensions and plugins may be admitted for reviewed forks or modifications,
  with exact provenance, integrity information, and their license retained.
- Apache-2.0 extensions and plugins may be used as official, unmodified upstream
  installations directly in Pi or as external tools. Do not fork, patch, vendor,
  or bundle their extension/plugin code into `anvil-extensions`.
- Record external installations in `fakoli/ai-infra`, including the exact source
  and version, dependency lock, install command, explicit Pi selection, verification,
  and rollback. Keep host paths and credentials in private configuration.
- This is the operator's maintenance policy, not a claim that Apache-2.0 legally
  forbids modification. Transitive libraries retain their own license notices.
- Context7 uses only the official MIT-licensed plugin, as an optional explicit
  selection. Do not restore the custom wrapper or enable Context7 by default.

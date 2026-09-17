# Anvil Extensions 0.8.0

This release adds an explicitly selectable Pi capability candidate and fixes
tool repair removing meaningful whitespace from file-edit arguments. The root
Pi resource selections remain unchanged; candidate capabilities require explicit
selection and publication does not activate a host or fleet.

- Add five workflow skills for shipping, dispatch, verification, recall checks,
  and CLI hygiene, with source provenance and installed-path checks.
- Bind verification receipts to Git content and modes, approved policy and argv,
  task/claim identity, successful gate results and ordered timestamps. A bounded
  State proof workflow rechecks freshness before the existing submit CLI.
- Preserve string whitespace while removing explicit tool grammar markers.
- Pin the official MIT Context7 plugin as optional only. Keep the restricted MCP
  foundation empty and deny all calls until caller authorization is qualified.
- Keep Apache-2.0 extensions/plugins as official unmodified external installations,
  tracked in `ai-infra`; the browser skill uses a separately pinned Playwright CLI.
- Make release tagging require the merged commit, exact-commit green CI and a
  clean install; preserve local Pi selections by default.

Validation includes the offline workspace matrix and clean-install audit, native
State proof tests, and bounded private integration checks. Three synthetic live
coding tasks passed after the whitespace fix; this is not a general quality
benchmark. Streaming, a real file read and model continuation also passed.

The companion native Anvil integration must include bounded command-proof
forwarding. Session import and bounded evaluation changes live in `fakoli-plugins`.
Standalone restricted Serena and local browser fixtures were tested on macOS.
Pi MCP Serena/Serving integration remains disabled pending caller authorization;
Grafana lacks an admitted read-only configuration. Exact version-specific Zod
3.24.1 documentation and host-level Linux qualification remain unconfirmed.

Receipts are unsigned claim-owner evidence; unrestricted direct State calls can
bypass the local freshness helper. State acceptance remains a separate human gate.
Rollback selects the previous `anvil-v0.7.3` resources and preserves sessions.

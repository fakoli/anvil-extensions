# Provenance ledger

## Original code

`src/receipt.ts`, `src/mcp-policy.ts`, `src/docs-guard.ts`, and `index.ts` are
original code in this bundle. They implement portable candidate feedback and
do not claim to replace the State acceptance boundary.

## Adapted workflow material

Source: `fakoli/fakoli-plugins` commit
`06717850ad79914a5bbe33e768abaea0e8008f95`, MIT.

- `scripts/gate-router.py` is an adapted copy of
  `plugins/gate-router/scripts/gate_router.py`. The only changes are the
  public module description and package-local invocation paths.
- Skills under `skills/` are concise ports of the named workflow contracts:
  `ship-loop`, `dispatch-packet`, `gate-check`, `recall-mode-verifier`, and
  `cli-hygiene`. They replace host-specific commands with Pi package-relative
  paths and stop before delivery actions.

## Reviewed registry dependencies

- `@upstash/context7-pi@0.1.2`, MIT,
  `sha512-uxYqDF/A32nuKJBeUCWuBQqLmRJJ3eUI6zsM7TPEds7KUK/a/PdicEZRC2ja/b1Zl1uhjbyLWmQynQC4cID+Zg==`.
  Its exported native tool definitions are called only through `docs-guard`.
- `pi-mcp-adapter@2.33.0`, MIT,
  `sha512-W1wFtd8NOz9+yAZZEoyEDfz4YMUxHSitPejZo4Yvol1YXQGeYiCfoFqd2k6GulP6k+w/p+L3NU2IcA/nlTkFEQ==`.
  It is instantiated with an isolated empty configuration; unreviewed files
  and host discovery are never consulted.
- `@playwright/cli@0.1.19`, Apache-2.0,
  `sha512-eGXIsYa5D+dC6wHGf+9uEislhPGip1djK+yiNAD7BVsXN3WzzR1J4ClFAhYhyu7wSEFqhcPrqXAYeBJF1dKJ7A==`.
  It is a local CLI dependency for the browser skill and is not an MCP server.

## Evaluated, not enabled

`serena-agent` was evaluated at upstream MIT commit
`701e7c843f46c6a649203a488cece1bf19f1df90` using a pinned `uvx` invocation.
It is not a dependency and no server is registered. The included standalone
template fixes its tool list to five semantic reads and places all generated
state in a candidate-owned external directory. The default `codex` context
advertised mutating and memory tools and created configuration state at startup,
so it remains unsuitable for adapter registration without a caller-scope
boundary.

The committed root lockfile is the authoritative resolved tree and integrity
record. No lifecycle script is enabled by this package.

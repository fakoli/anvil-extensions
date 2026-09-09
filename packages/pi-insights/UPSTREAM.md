# pi-insights — provenance

- Original work, written for the fakoli pi-extensions monorepo (2026-09-09).
- No upstream; design reviewed by gpt-6-astra (deterministic activity ledger
  with persistent widget; observational only).
- License: MIT. Author: Fakoli.
- Design constraints honored: observational only — never mutates tool results,
  never injects LLM-context messages, never writes memory, never summarizes
  tool output (pi-condense's domain), never reads pruned content.
---
name: stratus
description: Author or edit Stratus cloud/network architecture diagrams — turn architecture intent into a typed JSON spec, validate it through the deterministic gates, and render reference-grade standalone HTML/SVG for AWS/GCP/Azure. Use when asked to draw a cloud or network architecture (VPC, EKS, firewalls, service networks) or to validate/render a Stratus spec.
---

# Stratus kickoff

Turn architecture intent into a validated Stratus spec and a reference-grade
diagram. Status: **wired** — the engine is complete (T001–T014); the contract
below is implemented: `/stratus` kickoff, `stratus_render`/`stratus_validate`
tools, deterministic gates, and reference-grade rendering.

## Contract

1. **Surface unresolved facts first.** Ask only for facts the spec requires and
   the user did not supply (provider, region, CIDRs, subnet tiers, gateways,
   resources). Never invent topology.
2. **Author schema-conforming JSON** per `schemas/cloud.schema.json`:
   provider-discriminated scopes (AWS VPCs / GCP VPC networks / Azure VNets),
   zones where applicable, subnets, resources with explicit placement,
   semantic edges, overlapping visual frames — without a containment tree.
3. **Validate through the shared deterministic gates** (same gates as
   hand-authored specs). Invalid drafts return actionable diagnostics and
   cannot receive a reference-grade claim.
4. **Revalidate after every revision.** No LLM output bypasses a gate or
   relaxes a diagnostic.
5. **Render** to standalone HTML/SVG; exports (SVG, PDF, raster, slides) carry
   the validation receipts.
6. **JEV annotations are advisory metadata only** — never proof, approval,
   execution authority, or spec changes; export only the consented payload.

## Sizing system

Element sizing, boundary nesting tokens, label masks, and routing side
contracts: see `docs/algorithms.md` and `docs/stratus-renderer-spec.md`.
Deterministic layout from the spec — no hand-tuned coordinates.

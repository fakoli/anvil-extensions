---
name: stratus-evaluate
description: Judge agent-created Stratus diagrams against gold-standard references. Use after rendering a Stratus diagram (or on request) to score containment tree, placement truth, routing explainability, CIDR truth, and edge separation against the standard.
---

# Stratus evaluate

Judge a compiled Stratus diagram against the gold-standard dimensions.

## When to use

- After rendering any Stratus diagram (kickoff: `/stratus`).
- When the user asks whether a diagram meets the standard.
- Before delivering corrected proof diagrams.

## Procedure

1. Run the `stratus_evaluate` tool with the diagram spec. It scores five
   dimensions (0..1 each), measured against the compiled scene:
   - **containment-tree** — every VPC has AZ slices; the boundary stack nests
     Cloud ⊃ Region ⊃ Network ⊃ AZ ⊃ subnet (one region boundary per declared
     region).
   - **placement-truth** — every declared resource (cloud, regional, AZ,
     subnet, linked instances) paints inside a declared scope; unpainted
     resources reduce the score.
   - **routing-explainability** — routing facts (route tables, routing
     decisions, listeners, target groups) explain why packets take a path;
     route cards render as first-class Destination|Target tables.
   - **cidr-truth** — VPC AND subnet CIDRs are known, not silently unknown.
   - **edge-separation** — association, request, and service→target edges are
     distinct kinds with distinct serialized paint styles.
2. Read the overall score. ≥ 0.75 passes; any dimension below 0.5 must be
   fixed before delivery.
3. For deeper judgment, pass `referenceDir` of gold-standard reference specs
   and report per-dimension notes.

## Hard rules

- The evaluation is advisory: it never replaces the validation gates.
- A diagram that fails any validation gate is blocked regardless of score.
- Report scores truthfully — never inflate a dimension to pass.

## Verification

- `node tests/proof-diagrams.test.mjs` — all four corrected proof diagrams
  compile eligible and score ≥ 0.75 overall.

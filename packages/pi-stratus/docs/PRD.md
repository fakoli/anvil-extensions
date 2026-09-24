# Stratus — cloud/network diagram engine

## Summary

Stratus is our own cloud/network diagram engine: overlapping spatial frames
(VPC outline × dashed AZ columns × subnet blocks × SG bands), deterministic
layout and validation, reference-grade output for AWS/GCP/Azure. Architecture
intent enters as natural language and is authored into the typed spec by the
LLM agent layer; JEV (anvil's TypeSafe System-One advisory model) adds
advisory-only annotations on specs and diagnostics. An evaluation skill
compares every created diagram against the reference standard —
deterministic structural checks plus perceptual review — so quality is
measured, not asserted.

## Goals

Stratus turns cloud and network architecture intent into validated, interactive,
reference-grade HTML diagrams. It is our own engine — Archify
(tt-a1i/archify, MIT) is the contract inspiration only: small typed JSON spec →
deterministic validation → standalone interactive HTML with inline SVG,
dark/light themes, and truthful receipts. The rewrite exists because cloud
topology needs **overlapping spatial frames** with provider-true scope
(VPC/VNet outlines, zone columns where applicable, subnet blocks, and
security-group membership bands) that flat membership-list boundary
models cannot express.

Intent enters as natural language: the LLM agent layer (/stratus kickoff)
authors the typed spec, and every spec — LLM-authored or hand-written — passes
the same deterministic gates. JEV, anvil's TypeSafe System-One advisory model
(jev-1.13.0), contributes fast advisory annotations (spec triage, diagnostic
evidence triage) that ride on receipts as metadata — never authority.

The element system is repeatable: boundary containers, gateway/compute icons,
route-table cards, badges, and edge families are library elements, not one-off
artwork. Four proof diagrams (VPC Lattice, EKS IPv6, centralized and
distributed Network Firewall) exercise the element system against the archify
contract and validate clean with browser evidence; the measured sizing system
is recorded in `docs/stratus-renderer-spec.md`.

## Requirements

- **R001:** The spec schema validates deterministically (offline) with
  actionable diagnostics.
- **R002:** The AWS three-tier VPC example (ALB in two public subnets, private
  app ASG, RDS Multi-AZ) is expressible without hand-tuned coordinates.
- **R003:** Same spec → same layout bytes (deterministic layout).
- **R004:** Labels fit their frames at the desktop-readable minimum or the
  validator reports a label-fit diagnostic.
- **R005:** Output opens standalone (no network, no external JS).
  Spec-provided text is rendered as data, never executable markup or code.
- **R006:** Dark/light themes; legend explains line/border semantics.
- **R007:** Every validation gate is deterministic and offline; receipts are
  machine-readable.
- **R008:** Violations block reference-grade claims; unknowns are reported
  truthfully, never upgraded to secure.
- **R009:** Icon glyphs are generated original geometric marks (lettermark +
  brand hex); no trademark reproduction.
- **R010:** Pi tools return structured receipts; timeouts and abort honored.
- **R011:** Reference presets cover AWS, GCP, and Azure; each renders and
  validates clean on attempt 1 with provider-true placement and labels.
- **R012:** The offline test suite passes; golden artifacts are deterministic.
- **R013:** /stratus kickoff uses the agent skill to author a typed spec draft
  from natural-language intent, surfaces unresolved facts without inventing
  them, and invokes the same deterministic gates as hand-authored specs.
  Every revision is revalidated; no LLM output bypasses a gate or relaxes
  a diagnostic.
- **R014:** JEV results are separately attributed advisory metadata, never
  proof, approval, execution authority, or changes to specs or gate results.
  Export requires explicit per-operation consent for the selected payload.
  Disabled, unavailable, or failed advice leaves deterministic validation
  and rendering unchanged. Confidence, when supplied, is labeled
  provider-reported and uncalibrated.
- **R015:** The same validated spec renders to standalone HTML (primary),
  SVG, PDF, raster image, and slide deck output; each export carries the
  validation receipts and is deterministic where the format allows.
- **R016:** Every rendered diagram can be evaluated against the reference
  standard: deterministic structural checks (spacing minimums, overlap
  detection, boundary-hierarchy, label clearance) plus perceptual review
  against a gold-standard reference set, producing a machine-readable scored
  report with per-dimension verdicts, findings with evidence, and concrete
  fixes. Evaluation is advisory: it never mutates specs or gate results.

- **R017:** The engine handles diagram types beyond cloud/network: workflow,
  sequence, dataflow, and lifecycle views follow the same contract (typed
  spec → deterministic validation → standalone interactive HTML/SVG), with
  per-type schemas and renderers sharing the boundary/spacing/routing
  constructs.

## Features

### F001 — Cloud-native spec schema

Typed JSON spec with provider-discriminated network/resource scopes:
AWS VPCs, GCP VPC networks, Azure VNets, address ranges where applicable,
regions, zones, subnets, scaling groups, catalog resources, semantic edges,
and a strict containment tree (Cloud ⊃ Region ⊃ Network ⊃ AZ ⊃ subnet) with
visual frames derived from multi-instance membership on top of it.
Each AWS subnet belongs to one AZ; an AZ may contain multiple subnets.
GCP VPC networks are global with regional subnets; Azure VNets and subnets
are regional, not zone-bound.
Resources support explicit single- or multi-subnet/zone placement and
regional/global scope, sufficient for ALB, ASG, and RDS Multi-AZ.
Security-group membership is distinct from containment; visual bands
do not imply network isolation. Decisions D2, D5.

**Requirements:** R001, R002

### F002 — Deterministic layout algorithm

AZ columns, subnet blocks, tier rows, gateway icons above tiers, and SG bands
are computed from the spec. Label fit uses estimated text width with a shrink
policy. No hand-tuned coordinates in the spec. Decisions D3, D6.

**Requirements:** R003, R004

### F003 — Focused SVG renderer to standalone HTML

Inline SVG for frames/bands/nodes/edges; orthogonal edge routing with labeled
decisive paths; dark/light themes; legend; single-file standalone HTML.
Decisions D1, D6.

**Requirements:** R005, R006

### F004 — Deterministic validation gates

Containment truth per provider, CIDR containment + no sibling overlap, edge
endpoints exist, cross-boundary edges carry labels, label-fit estimates,
provider scope. Missing facts report as unknown, never as secure.
Decisions D2, D5.

**Requirements:** R007, R008

### F005 — Provider icon glyphs

Generated original geometric glyphs per catalog service (lettermark + brand
hex), visually distinguishable with text labels. Decisions D4.

**Requirements:** R009

### F006 — CLI and pi tool surface

Commands: render, validate, doctor, catalog, network-check. Pi tools mirror
them with structured receipts; /stratus kickoff command; /stratus-doctor
instant check. Carry over the offline service catalog and network preflight
(decision D7).

**Requirements:** R010

### F007 — Reference presets

Truth-tested presets follow the progressive-disclosure ladder: simple VPC
(3 AZs, public/private subnet pairs, IGW, route tables) → + ALB + EC2
targets → three-tier (external + internal ALBs, RDS + read replica, NAT) →
+ VPC gateway endpoint → + Site-to-Site VPN → + Transit Gateway hub/spoke
variants for GCP and Azure. Each preset is a complete, truth-tested
snapshot; complexity is added one family per step. NAT appears only when
declared; route callouts only in the network-detail variant. Each preset
exercises its provider's actual network and resource scopes.

**Requirements:** R011

### F008 — Tests

Deterministic golden SVG/HTML, offline suite, extension wiring tests.

**Requirements:** R012

### F009 — LLM spec intake + JEV advisory layer

/stratus kickoff invokes the agent's spec-authoring skill and shared
deterministic validation pipeline. `src/jev.ts` uses `anvil jev bridge`
as the optional advisory boundary without enabling JEV or broadening its
policy. Architecture-intent/spec critique is explicitly adapted to
prd_review, not presented as schema validation; diagnostics use
evidence_triage. Export only the selected, consented payload.
Keep advisory status/results separate from deterministic gate results,
layout bytes, and golden diagram artifacts.

**Requirements:** R013, R014

### F010 — Export pipeline

SVG is native renderer output; PDF and raster (PNG/JPEG) exports derive from
the same SVG through a deterministic pipeline; slide deck output emits one
slide per guided view or reference preset. Exports carry the validation
receipts; failed gates block export claims. Decisions D1, D6.

**Requirements:** R015

### F011 — Evaluation skill (/stratus-evaluate)

A packaged evaluation skill compares a created diagram against the reference
standard set: official AWS/Azure/GCP reference diagrams (gold standard), the
element specification, and the user's style preferences (spacing, overlap
care). Structural half: spacing metrics, overlap detection, boundary-
hierarchy checks, label clearance — deterministic and offline. Perceptual
half: image-capable review against the gold standard. Output: a scored
report with per-dimension verdicts, findings with evidence, and concrete
fixes. Advisory only: never mutates specs or gate results.

**Requirements:** R016

### F012 — General-purpose diagram types

Workflow, sequence, dataflow, and lifecycle diagram types share the engine
contract: small typed spec → deterministic validation → standalone HTML with
inline SVG, dark/light themes, legend, and truthful receipts. Each type has
its own schema branch and renderer; boundary/spacing/routing constructs are
shared with the cloud/network engine.

**Requirements:** R017

## Out of scope (this iteration)

- Official vendor icon artwork (licensing review required first).
- Live cloud inventory/drift review; Terraform import (parked).
- Autonomous cloud changes, deployment approval, or JEV-driven spec mutation.
- Training or hosting an LLM; the existing pi agent supplies spec authoring.
- Official vendor icon artwork (licensing review required first).
- Live reachability/security certification or a complete cloud-policy simulator.

## Tasks

Paths and verification commands are relative to the Stratus package root.
Implementation expectation: 2-3 days for the comprehensive package and
evaluation-skill slice. Final packaging target: the anvil-extensions
monorepo as `packages/pi-stratus` (pi extension entry `index.ts`, `src/`,
`skills/`, `tests/run-tests.mjs`, package.json `pi.extensions` + `pi.skills`
fields, per repo conventions); this repo is the development home. T001
establishes the local TypeScript configuration and offline test runner,
including how tests load TypeScript. Dependency installation is setup, not
verification. Every task adds acceptance tests to the shared suite;
dependencies determine readiness, not priority alone.

### T001: Cloud-native spec schema + offline validator core
**Feature:** F001
**Priority:** high
**Type:** feature
**Likely files:** schemas/cloud.schema.json, src/schema.ts, package.json, tsconfig.json, tests/run-tests.mjs
**Acceptance criteria:**
- the AWS three-tier VPC example validates clean without hand-tuned coordinates
- malformed specs produce actionable offline diagnostics
- the JSON schema and TypeScript validator agree on shared valid/invalid fixtures
- multi-subnet resources and non-zonal subnets are expressible without false containment
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Implement the provider-discriminated schema and TypeScript model from F001,
including multi-subnet/zone resource placement and overlapping frames.
Add deterministic structural diagnostics and fixtures for valid/invalid
AWS, GCP, and Azure scope relationships. Creates `tests/run-tests.mjs`;
later tasks extend the suite.

### T002: Deterministic layout algorithm
**Feature:** F002
**Priority:** high
**Type:** feature
**Likely files:** src/layout.ts, tests/run-tests.mjs
**Acceptance criteria:**
- same spec produces byte-identical layout output
- label-fit diagnostics fire when frames are too narrow
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/layout.ts`: AZ columns, subnet blocks, tier rows, gateway icons above
tiers, SG bands computed from the spec; estimated text-width label fit with a
shrink policy.

### T003: SVG renderer to standalone HTML
**Feature:** F003
**Priority:** high
**Type:** feature
**Likely files:** src/renderer.ts, tests/run-tests.mjs
**Acceptance criteria:**
- output opens standalone with no network or external JS
- dark/light themes and legend present
- adversarial labels and metadata cannot inject scripts, event handlers, or external resource loads
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/renderer.ts`: inline SVG frames/bands/nodes/edges, orthogonal labeled
edges, dark/light themes, legend, single-file HTML output.

### T004: Validation gates + network preflight carry-over
**Feature:** F004
**Priority:** high
**Type:** feature
**Likely files:** src/validator.ts, src/network.ts, tests/run-tests.mjs
**Acceptance criteria:**
- machine-readable receipts for every gate
- unknowns reported truthfully, never upgraded to secure
- failed gates block reference-grade claims
- reference-grade denotes diagram/spec conformance, not verified cloud security or reachability
- CIDR overlap checks apply within the relevant provider/network scope
- public/private/isolated labels and SG bands alone never prove routing or access
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/validator.ts`: provider-true containment, CIDR containment + no sibling
overlap, edge endpoints, cross-boundary labels, label-fit, provider scope.
Carry over `src/network.ts` preflight, adapted to the new schema.

### T005: Generated icon glyphs
**Feature:** F005
**Priority:** medium
**Type:** feature
**Likely files:** src/glyphs.ts, tests/run-tests.mjs
**Acceptance criteria:**
- original geometric glyphs cover the ~85-entry catalog with no trademark reproduction
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/glyphs.ts`: original geometric glyphs (lettermark + brand hex) for the
~85-entry catalog.

### T006: CLI + pi tools + catalog carry-over
**Feature:** F006
**Priority:** medium
**Type:** feature
**Likely files:** src/cli.ts, index.ts, src/cloud.ts, tests/run-tests.mjs
**Acceptance criteria:**
- structured receipts, timeouts, and abort honored on every pi tool
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/cli.ts` (render/validate/doctor/catalog/network-check), `index.ts` tools
with structured receipts, /stratus + /stratus-doctor commands; carry over
`src/cloud.ts` catalog.

### T007: Reference presets
**Feature:** F007
**Priority:** medium
**Type:** feature
**Likely files:** src/presets.ts, tests/run-tests.mjs
**Acceptance criteria:**
- each preset renders and validates clean on attempt 1
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

`src/presets.ts` implements the provider-specific presets in F007.
Add fixtures asserting provider-true placement as well as clean validation
and rendering on attempt 1.

### T008: Golden tests + extension wiring
**Feature:** F008
**Priority:** high
**Type:** feature
**Dependencies:** T001, T002, T003, T004, T005, T006, T007, T009
**Likely files:** tests/run-tests.mjs
**Acceptance criteria:**
- suite passes offline; golden artifacts byte-deterministic
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Extends `tests/run-tests.mjs` with deterministic golden SVG/HTML,
provider-specific placement assertions, catalog/glyph integrity checks,
and command/tool/skill wiring tests. Advisory responses are stubbed and
excluded from deterministic golden artifacts.

### T009: LLM intake skill + JEV advisory client
**Feature:** F009
**Priority:** high
**Type:** feature
**Dependencies:** T001, T004, T006
**Likely files:** src/jev.ts, index.ts, skills/stratus/SKILL.md, tests/run-tests.mjs
**Acceptance criteria:**
- /stratus kickoff loads the skill and routes authored drafts through the shared validator
- the prompt contract requires schema-conforming JSON, unresolved-fact clarification, no invented topology, and revalidation after revision
- invalid drafts return actionable diagnostics and cannot receive a reference-grade claim
- JEV exports only the explicitly consented payload under anvil's enabled policy; refusal causes no export
- disabled/unavailable JEV, missing credentials, provider errors, malformed or oversized responses, timeout, and abort leave deterministic gate results unchanged
- the adapter honors anvil limits and its 5-second default timeout; credentials are never stored or returned
- advisory results identify capability and model; confidence is provider-reported and uncalibrated
- offline tests stub agent/JEV responses and require no credentials or network
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Wire /stratus kickoff to the spec-authoring skill and shared validator.
Verify the installed bridge request/response and export-consent contract
before implementing the adapter. Keep advisory results separately
attributed; never use them to change specs, policy, or gate outcomes.

### T010: Export pipeline
**Feature:** F010
**Priority:** high
**Type:** feature
**Dependencies:** T003
**Likely files:** src/export.ts, tests/run-tests.mjs
**Acceptance criteria:**
- the same validated spec emits HTML, SVG, PDF, raster image, and slide output
- SVG export is byte-deterministic for a fixed spec and theme
- exports carry the validation receipts; failed gates block export claims
- raster and PDF exports match the SVG geometry (no re-layout)
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Implement `src/export.ts`: native SVG serialization, PDF and raster
pipelines over the same SVG geometry, and slide output per guided view or
reference preset. Library choices are recorded in the knowledge base before
implementation.

### T011: Element knowledge base
**Feature:** F010
**Priority:** medium
**Type:** modify
**Likely files:** docs/stratus-renderer-spec.md, docs/algorithms.md
**Acceptance criteria:**
- sizing algorithms, boundary nesting math, label masks, and routing
  contracts are recorded with formulas and measured constants
- every rule is cross-checked against the four proof diagrams
**Verification:**
- `node tests/run-tests.mjs`

Record the renderer specification (element shapes, math formulas, design
patterns) from `docs/stratus-renderer-spec.md` into the implementation
knowledge base: recursive boundary stack, grid pitch and label masks,
orthogonal side contracts, traffic planes, auxiliary-service boxes, and the
validation gates. Sources: official AWS reference architecture measurements,
AWS layout guidelines, Azure Well-Architected diagram guidance, and the
archify authoring contract.

### T012: Evaluation skill
**Feature:** F011
**Priority:** high
**Type:** feature
**Dependencies:** T003, T004
**Likely files:** src/evaluate.ts, bin/stratus.mjs, skills/stratus-evaluate/SKILL.md, tests/run-tests.mjs
**Acceptance criteria:**
- structural checks: spacing minimums, overlap detection, boundary-hierarchy, label clearance — deterministic and offline
- perceptual protocol: image-capable review against the gold-standard reference set with a scored rubric
- report is machine-readable with per-dimension verdicts, findings with evidence, and concrete fixes
- evaluation is advisory: never mutates specs or gate results
- reference set and rubric are versioned in the package
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Implement the evaluation skill: structural metrics over the layout scene,
the perceptual review protocol against the `docs/` reference material, the
scoring rubric (dimensions, weights, pass/fail gates), and packaging as a
CLI verb plus agent skill.

### T013: Proof-diagram corrections
**Feature:** F011
**Priority:** high
**Type:** bugfix
**Dependencies:** T012
**Likely files:** diagrams/*.architecture.json, docs/algorithms.md
**Acceptance criteria:**
- boundary wrap-sets are spatially contiguous; no overlapping boundary boxes
- boundary hierarchy is visually distinct and correctly ordered (Region ⊃ VPC ⊃ AZ ⊃ subnet)
- association, request, and service→target edges are separated
- control plane modeled outside customer VPC; addressing semantics corrected (/80 node prefixes, /128 pods)
- routing cards state the true routing stages (TGW targets the inspection VPC attachment; VPC route tables steer through firewall endpoints)
- every corrected diagram passes the evaluation skill
**Verification:**
- `node tests/run-tests.mjs`
- `stratus evaluate diagrams/*.json`

Correct the four proof diagrams per the lead-engineer judgment: spacing,
disjoint wrap-sets, boundary hierarchy, edge separation, control-plane
placement, addressing semantics, DNS64-enabled variant naming, and routing-
card corrections. Re-evaluate with the evaluation skill.

### T014: General-purpose diagram types
**Feature:** F012
**Priority:** medium
**Type:** feature
**Dependencies:** T003, T008
**Likely files:** schemas/workflow.schema.json, schemas/sequence.schema.json, schemas/dataflow.schema.json, schemas/lifecycle.schema.json, src/diagram-types.ts, tests/diagram-types.test.mjs
**Acceptance criteria:**
- workflow, sequence, dataflow, and lifecycle specs validate through the same gates
- each type renders standalone HTML with themes, legend, and truthful receipts
- shared boundary/spacing/routing constructs; no per-type layout forks
**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

Extend the engine beyond cloud/network: workflow (steps + decisions),
sequence (participants + ordered messages), dataflow (sources → transforms →
sinks), lifecycle (stages + transitions). Each type gets a schema branch and
renderer sharing the engine constructs; the cloud/network engine remains the
reference implementation.

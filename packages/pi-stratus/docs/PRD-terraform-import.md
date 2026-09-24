# Project: Stratus Terraform import

## Summary

Add an offline Terraform compiler front-end to Stratus: supplied configuration,
state, and plan artifacts become evidence-backed architecture facts, canonical
`StratusSpec` documents, and an import report. Diagrams use the existing
validation, layout, standalone interaction, and export pipeline.

This is a follow-up to `docs/PRD.md`. Implementation starts only after that
PRD's T001–T014 are completed and merged. IDs in this document are local to this
follow-up; register it as a separate Anvil PRD rather than merging its IDs into
the core task list. This document defines future acceptance, not completed work.

## Goals

- Import useful architecture without installing or executing Terraform.
- Preserve module identities, provider bindings, unknowns, and source provenance.
- Separate ownership, deployment placement, dependency, and network connectivity.
- Provide interactive overview, detail, and evidence-backed comparison views.
- Establish one shared inference layer reusable by future source adapters.

## Non-Goals

- Applying plans, provisioning, deployment approval, or writing Terraform/state.
- Executing Terraform/OpenTofu, provider plugins, provisioners, or external data programs.
- Remote module retrieval, backend access, live cloud synchronization, or live drift detection.
- Full Terraform language/provider emulation or universal resource coverage.
- Implementing AWS inventory or CDK adapters in this release.
- A separate Terraform renderer, source-aware layout, or validation bypass.
- Cloud security/reachability certification or LLM-invented architecture facts.

## Architectural decisions

### D1 — Shared inference front-end

```text
Supplied AWS inventory snapshots (future)
Terraform configuration / state / plan
Supplied CDK synthesized artifacts (future)
    → source-specific adapters
    → facts + typed relationships + provenance
    → versioned semantic mapping
    → containment / placement builder
    → canonical StratusSpec document(s) + import report
    → existing decoding and semantic validation
    → existing layout and geometry validation
    → existing interactive rendering and export
```

The fact graph is internal compiler working data. `StratusSpec` remains the
canonical diagram intermediate representation. Source adapters decode evidence;
the shared inference layer interprets relationships. Layout consumes only the
final spec and pinned rendering inputs: it never queries AWS or interprets
Terraform/CDK relationships. Future CDK intake prefers supplied synthesized
artifacts, not application execution.

### D2 — Classify before deriving containment

Keep three concepts separate: one semantic owner per entity, potentially several
deployment attachments, and potentially several linked visual instances.
Classify ownership evidence, actual deployment, candidate placement, policy
membership, dependency, route association, service target, and VPC connectivity
before constructing scopes or placements.

Security-group references, IAM dependencies, KMS references, and `depends_on`
are not owning parents. A reference is not evidence of request traffic or
reachability. Modules may organize focused views but are not cloud containers.

Mandatory AWS mapping rules:

- ALB memberships produce one semantic resource with multiple visual attachment
  instances, not independent load balancers.
- RDS subnet groups describe candidate subnets. Neither those memberships nor
  `multi_az` identifies exact primary/standby placements; never fabricate roles.
- EKS cluster subnet references configure customer-VPC interfaces, not containment
  of the provider-managed control plane within customer subnets.
- Lambda VPC connectivity does not place its execution environment inside
  customer subnets.
- `RunInstances` requires `MinCount` and `MaxCount`; `SubnetId` is optional and
  interface/launch-template paths exist. This API premise does not make an
  unresolved default placement inferable from configuration.
- `CreateSubnet` requires `VpcId`, not an explicit AZ. AWS may choose the AZ.
  A subnet ID alone cannot reveal its AZ: resolve the supplied subnet record,
  Terraform reference, or observed state; otherwise report unresolved placement.

The API premises above are supplied from Astra review 382308de, which verified
upstream botocore. Mapping implementation records the provider/model versions
used for its own fixtures; this document makes no new live API-verification claim.

### D3 — Snapshot authority and provenance

Facts distinguish declared configuration, planned values, and observed snapshot
values. Observed means recorded in a supplied artifact, not queried by Stratus.

| Mode | Authoritative evidence | Permitted supporting evidence |
|---|---|---|
| Configuration | Bounded evaluation of declarations and explicit inputs | Supplied module contents |
| State | Selected state snapshot | Configuration identity/labels |
| Plan-before | Corresponding plan before-state evidence | Configuration identity links |
| Plan-after | Planned values and change records | Configuration identity links |
| Comparison | Each side's selected snapshot | Explicit identity correspondence |

There is no global rule that state always overrides declarations. Supporting
facts cannot overwrite authoritative unknowns or conflicts. In particular, old
state must not fill a planned unknown silently. Unsupported source combinations,
ambiguous snapshot selection, and conflicts receive diagnostics rather than
implicit last-writer-wins behavior.

Record source class, logical source name, full Terraform address, attribute path,
HCL span or JSON Pointer where available, derivation rule, and selection rationale.
Distinguish known, unknown, absent, null, and redacted values where source formats
permit. Sensitivity propagates through evaluation and derivation.

### D4 — Canonical schema compatibility

`src/schema.ts` expresses concrete ownership/placement, selected unknown facts,
and `overview` / `network-detail` views. It has no universal unresolved-parent,
candidate-placement, or plan-diff branch.

Keep provenance, generic dependencies, candidate placements, and comparison
metadata in the versioned import bundle/report unless existing spec constructs
express them accurately. Do not misuse resource properties or attachment roles
to bypass semantics. Never fabricate an AZ/network to satisfy the ownership tree.

When required containment cannot be represented truthfully, withhold the affected
entity and dependent references from a partial spec, and report the omission.
Any necessary schema extension must be explicit, versioned, and validated by the
common engine. No Terraform-only schema or weaker gate is permitted.

## Requirements

- R001: Import shall use source adapters and one shared inference front-end producing canonical StratusSpec; layout shall remain source-independent. Features: F001.
- R002: Import shall parse supplied `.tf` and `.tf.json` configuration offline with documented bounded evaluation and truthful unsupported-expression diagnostics. Features: F002.
- R003: Import shall preserve module/resource instance addresses and provider aliases, resolving only approved local modules and explicit vendored-module mappings. Features: F002.
- R004: Import shall accept documented state/plan JSON formats and preserve unknown, absent, null, sensitive, and change-action distinctions without executing Terraform. Features: F003.
- R005: A versioned resource mapping table shall identify supported types/variants, required facts, relationship rules, and catalog targets; every in-scope source resource shall be accounted for. Features: F004.
- R006: Relationship classification shall precede ownership/placement derivation and enforce D2 without fabricated traffic, AZs, or database roles. Features: F004.
- R007: Reports shall expose declared/planned/observed provenance, selection rationale, conflicts, derivation rules, unresolved facts, and source-to-spec correspondence. Features: F001, F003, F005.
- R008: Equivalent inputs, selection modes, and pinned versions shall yield byte-identical canonical specs and deterministic reports; adapter, evaluator, mapping, catalog, and schema revisions shall be recorded. Features: F001, F005, F008.
- R009: Final specs shall pass the same decoding, semantic, layout, and export gates as authored specs; import completeness shall remain separate from validation, and incomplete imports shall not receive an overall reference-grade claim. Features: F005.
- R010: Imported diagrams shall preserve standalone interaction, themes, identity, guided views, and existing detail levels while visibly disclosing omissions and unknowns. Features: F006.
- R011: Comparison views shall distinguish planned changes, recorded drift evidence, snapshot differences, and unknown comparisons without claiming live drift detection. Features: F007.
- R012: CLI and pi entry points shall share structured results, deterministic status behavior, cancellation, limits, and safe artifact handling. Features: F005.
- R013: Import shall perform no external execution or network retrieval; known sensitive values shall not leak into exported artifacts, diagnostics, or reports. Features: F002, F003, F005.
- R014: Offline readiness fixtures shall prove semantic correctness, truthful incompleteness, deterministic output, safe intake, interaction, and core-engine regression compatibility. Features: F008.

## Features

### F001: Shared inference contracts

**Requirements:** R001, R007, R008
**Priority:** high

Define the adapter interface, fact/relationship graph, provenance, stable identity,
and shared mapping/builder boundaries.

**Acceptance criteria:**
- Adapters emit evidence and typed relationships, not geometry or independent containment trees.
- Fact values and source authority follow D3; inferred facts name their supporting fact IDs and versioned rule.
- Stable identity includes logical source namespace, full module path, resource mode/type/name, and instance key; provider binding is preserved separately.
- Names repeated across modules cannot collide. Changing a host directory does not change identity.
- Future adapters require no source-specific changes in layout.

**Verification:**
- Contract fixtures feed equivalent facts from two synthetic adapters and compare canonical specs.
- Identity fixtures cover nested modules, data/managed resources, numeric/string keys, and aliases.
- Architecture checks reject inference imports in layout modules.

### F002: Bounded HCL and module intake

**Requirements:** R002, R003, R013
**Priority:** high

Pin an offline HCL parser and publish its supported syntax/evaluation matrix.
Support literals, collections, variable/local references, attribute/index traversal,
known interpolation, conditionals, and a fixed whitelist of pure operations.
Support resource/module `count` and `for_each` only when expansion is known.

**Acceptance criteria:**
- `.tf` and `.tf.json` combine deterministically; duplicate/conflicting declarations have source-located diagnostics.
- Explicit variable files and CLI inputs use documented precedence; environment variables and credentials are not read implicitly.
- Supplied local/vendored modules resolve inputs, outputs, nested addresses, aliases, and module `providers` remapping.
- Module paths remain within explicitly approved roots after real-path/symlink checks; absent registry/Git modules remain unresolved without downloads.
- Unknown expansion never creates speculative instances; cycles and evaluation limits terminate with diagnostics.
- Unsupported expressions, dynamic constructs, and unresolved data sources remain unknown; no provider query or external execution occurs.
- Filesystem-reading and nondeterministic functions are outside the whitelist; sensitivity propagates through supported operations.

**Verification:**
- Fixtures cover locals, module outputs, variable precedence, aliases, known/unknown expansion, cycles, and unsupported expressions.
- Adversarial fixtures cover remote module sources, path/symlink escape, executable constructs, deep nesting, and evaluation exhaustion.

### F003: State and plan JSON adapters

**Requirements:** R004, R007, R013
**Priority:** high

Accept explicitly supported raw state versions, state JSON produced by
`terraform show -json`, and plan JSON produced by that command. Users supply the
JSON; Stratus never runs the command and does not read binary plan files.

**Acceptance criteria:**
- Detect input kind and version; reject unsupported versions/shapes with typed diagnostics.
- Preserve nested module instances, provider bindings, data resources, and deposed instances without silently merging identities.
- Keep before/after facts separate; preserve create, update, delete, replacement order, no-op, read, and supported move metadata.
- Apply unknown and sensitive masks recursively before mapping, comparison, labels, or diagnostics.
- Planned unknowns remain unknown despite old observed values; null, absent, and redacted are not conflated.
- Unsupported action shapes and missing format-specific evidence are explicit, not guessed.
- Snapshot metadata describes artifact context, never a live observation made by Stratus.

**Verification:**
- Sanitized versioned fixtures cover all supported JSON families, nested modules, replacement, moves, deletion, sensitive collections, and planned unknowns.
- Negative fixtures cover malformed/oversized JSON, binary plans, unsupported versions, and unsupported actions.

### F004: Versioned semantic mapping and placement

**Requirements:** R005, R006
**Priority:** high

Initial coverage is AWS. Engine support for GCP/Azure does not imply Terraform
mapping support. Each mapping row records provider/type/variant, supported
attributes, required facts, rule IDs, relationship classes, catalog target,
legal placement, and fixtures.

Initial mapping families:

| Family | Terraform types | Interpretation |
|---|---|---|
| Network | `aws_vpc`, `aws_subnet` | Scopes and resolved AZ slices |
| Compute | `aws_instance`, `aws_network_interface`, `aws_launch_template`, `aws_autoscaling_group` | Compute plus interface/launch/deployment evidence |
| Load balancing | `aws_lb`, `aws_lb_listener`, `aws_lb_target_group`, `aws_lb_target_group_attachment` | ALB identity, memberships, listeners, resolved targets |
| Routing | `aws_internet_gateway`, `aws_nat_gateway`, `aws_route_table`, `aws_route`, `aws_route_table_association` | Resources and supported routing facts |
| Membership | `aws_security_group` | Membership policy, not isolation certification |
| Managed services | `aws_db_instance`, `aws_db_subnet_group`, `aws_eks_cluster`, `aws_lambda_function` | Service identity, candidate placements, and connectivity |

**Acceptance criteria:**
- Every listed type has tested attribute/variant support and explicit unresolved outcomes. Application load balancers are required; unsupported `aws_lb` variants are not treated as ALBs.
- Every source resource is mapped, supporting-only, unsupported, unresolved, or explicitly excluded by user scope; supporting records need not get glyphs.
- D2 ALB/RDS/EKS/Lambda/EC2/subnet semantics have positive and counterexample fixtures.
- Resolved interfaces/launch templates may supply EC2 placement; unknown provider defaults remain unresolved.
- No dependency is promoted to ownership or traffic; unsupported relationships remain in the report.
- Resource names never establish AZ, public/private classification, routing, or ownership.
- Known candidate placement is preserved as such, not converted to deployment; unresolved required placement makes the result incomplete.

**Verification:**
- Independent semantic assertions check ownership, placement, attachment identity/roles, and edge kinds for every mapping family.
- Golden diagrams supplement these assertions; they do not substitute for them.

### F005: Import pipeline, reports, and entry points

**Requirements:** R007, R008, R009, R012, R013
**Priority:** high

Expose `stratus import-terraform` and `stratus_import_terraform` over one API.
Inputs select source kind/namespace, mode, explicit variable inputs, approved
module roots/mappings, version pins, and output destinations.

The import bundle contains a versioned manifest, canonical spec document(s),
source-to-spec correspondence, deterministic report, and existing validation
receipts. Validated artifacts are optional outputs of the existing pipeline.

**Acceptance criteria:**
- Report import status as complete, incomplete, or failed, separately from gate results. Complete requires all in-scope resources accounted for without unsupported architectural omissions or unresolved required facts.
- Candidate placement or unknown optional detail may remain explicit; complete never means all provider attributes or runtime placements are known.
- Incomplete results permit only clearly marked partial drafts; omit unresolved entities and dependent references without dangling IDs. If no useful truthful subset exists, return no spec.
- Invalid specs receive failed receipts and no success export; validation gates are never weakened for imports.
- Diagnostics carry stable codes, severity, logical source location, affected addresses, rule IDs, redacted evidence, and remediation.
- Pin adapter, parser/evaluator, mapping, catalog, importer/report schema, canonical schema, and rendering versions. Fingerprint sanitized canonical inputs, not secret-bearing raw files.
- Exclude wall-clock timing, absolute host paths, raw source files, arbitrary attribute maps, and unordered enumeration effects from canonical outputs.
- Honor source sensitivity marks and credential-field redaction before logging, hashing exported payloads, or rendering. Export only allowlisted attributes; document that unmarked secrets require input sanitization.
- Enforce documented input-size, depth, evaluation, instance-expansion, timeout, and cancellation limits.
- CLI zero means complete import and required gates passed; document distinct nonzero incomplete, failed, and cancelled outcomes. The pi tool exposes the same statuses structurally.
- Write output atomically; never overwrite input configuration/state. No network, backend, binary, plugin, provisioner, or external-program execution occurs.

**Verification:**
- API/CLI/pi parity fixtures compare results, statuses, limits, and abort handling.
- Invalid imported specs fail the same existing gates as invalid authored specs.
- Canary-secret and hostile-text fixtures inspect specs, reports, receipts, diagnostics, and HTML.
- Repeated imports compare exact canonical bytes with fixed pins and sanitized inputs.

### F006: Interactive imported views

**Requirements:** R010
**Priority:** medium

Generate `overview` and `network-detail` using the existing `DiagramView`
contract, plus deterministic focused views for selected modules/networks.
Module focus selects entities; it does not invent a semantic cloud boundary.

**Acceptance criteria:**
- Existing view switching, themes, legend, entity selection, and detail display work standalone without network access.
- One semantic resource remains linked across attachment glyphs and views.
- Network detail exposes supported route cards and membership without implying verified traffic or reachability.
- Visible summaries and `omittedContext` identify unsupported, excluded, or unresolved content; unknowns do not disappear in focused views.
- Entity details show sanitized Terraform identity/provenance through inert report associations, not raw executable source.
- Dense diagrams produce focused views or existing density diagnostics, never silently dropped resources or relaxed readability gates.
- Exports preserve selected-view semantics and receipts; static formats do not claim HTML interaction.

**Verification:**
- Pinned offline browser tests exercise view switching, themes, identities, safe details, omission notices, and zero external requests.
- Existing export fixtures are extended with imported specs and both detail levels.

### F007: Plan changes and snapshot comparison

**Requirements:** R011
**Priority:** medium

Produce separately validated before/after specs and a comparison manifest.
Comparison metadata links those specs; it is not an alternate unvalidated
schema or a new `DiagramView.detail` value.

**Acceptance criteria:**
- Show planned create/update/delete/replace/read/no-op and supported moves, preserving replacement order and removed-entity inspection.
- Match by logical namespace/full Terraform address and explicit move evidence; physical IDs alone are not universal identity.
- Unknown/redacted attributes cannot prove equality or inequality. Attribute-only changes remain in the report even when geometry is unchanged.
- Label supplied plan drift records as recorded drift evidence and two-snapshot differences as snapshot differences.
- Configuration/state disagreement alone is not proven cloud drift; missing baselines or incompatible namespaces produce diagnostics.
- Before/after navigation and change legends work offline; each snapshot retains its own detail views, provenance, completeness, and receipts.
- Comparison rendering cannot bypass validation or imply that the plan was applied.

**Verification:**
- Fixtures cover replacements, moves, deletions, metadata-only changes, unknown/redacted differences, recorded drift, and insufficient evidence.
- Browser tests check navigation, legends, removed-resource inspection, and status visibility.

### F008: Readiness and regression evidence

**Requirements:** R008, R014
**Priority:** high

Maintain offline readiness fixtures and a release report tied to exact version
pins, support boundaries, and verification commands.

**Acceptance criteria:**
- Positive, incomplete, invalid, and hostile inputs have explicit expected outcomes.
- Repeat runs and permutations of unordered input collections produce identical canonical specs/reports; ordered action sequences and view order remain intact.
- Semantic correctness is asserted independently of image goldens.
- Core engine regressions pass without weakening gates or assertions.
- Readiness records unsupported Terraform constructs and provider variants, fixture coverage, and browser/export evidence.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`
- `node tests/terraform-browser.test.mjs` (introduced by T006; pinned offline browser).

## Tasks

Paths and commands are relative to the Stratus repository root. Before T001,
verify that core `docs/PRD.md` T001–T014 are completed and merged and the core
suite passes. Dependency installation is setup, not verification. Every task
adds executable coverage; no task is accepted from implementation prose alone.

### T001: Shared import contracts and semantic boundaries

**Feature:** F001
**Priority:** high
**Type:** feature
**Likely files:** src/import/types.ts, src/import/identity.ts, src/import/canonical.ts, schemas/import-report.schema.json, tests/import-contract.test.mjs

Implement adapter/fact/report contracts, stable identity, snapshot selection,
and the shared mapping boundary without introducing layout coupling.

**Acceptance criteria:**
- Contracts implement D1–D4 and F001; schema gaps are recorded explicitly.
- Synthetic adapter equivalence, nested identity, and architecture-boundary tests pass.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

### T002: HCL evaluation and supplied modules

**Feature:** F002
**Priority:** high
**Type:** feature
**Dependencies:** T001
**Likely files:** src/import/terraform/hcl.ts, src/import/terraform/evaluate.ts, src/import/terraform/modules.ts, package.json, package-lock.json, tests/terraform-hcl.test.mjs

Select and pin an offline parser; implement the bounded evaluator, module
resolver, provider bindings, and source-located diagnostics.

**Acceptance criteria:**
- F002 support/limit matrix and parser license/dependency choice are documented.
- Known expansion, aliases, inputs/outputs, sensitivity, cycles, and unsupported expressions have fixtures.
- Root/symlink escape and execution attempts fail safely without network access.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

### T003: State and plan JSON adapters

**Feature:** F003
**Priority:** high
**Type:** feature
**Dependencies:** T001
**Likely files:** src/import/terraform/state.ts, src/import/terraform/plan.ts, src/import/terraform/formats.ts, tests/terraform-json.test.mjs

Decode supported supplied JSON formats into the shared facts with separate
snapshot authority and recursive unknown/sensitivity handling.

**Acceptance criteria:**
- Accepted format versions and unsupported outcomes are documented and tested.
- F003 identities/actions/masks are preserved; observed values cannot overwrite planned unknowns.
- Binary plans, malformed data, and unsupported actions produce structured diagnostics.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

### T004: Semantic mappings and canonical spec builder

**Feature:** F004
**Priority:** high
**Type:** feature
**Dependencies:** T001, T002, T003
**Likely files:** src/import/mappings/aws.ts, src/import/classify.ts, src/import/build-spec.ts, tests/terraform-mapping.test.mjs

Implement versioned AWS mapping families and relationship classification before
constructing canonical scopes, resources, attachments, and supported facts.

**Acceptance criteria:**
- Every F004 mapping family has positive and unresolved/counterexample fixtures.
- ALB, RDS, EKS, Lambda, EC2, and missing-AZ semantics satisfy D2.
- Resource accounting is exhaustive; truthful partial specs have no synthetic parents or dangling references.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

### T005: Import results, validation, CLI, and pi tool

**Feature:** F005
**Priority:** high
**Type:** feature
**Dependencies:** T004
**Likely files:** src/import/pipeline.ts, src/import/report.ts, src/cli.ts, bin/stratus.mjs, index.ts, tests/terraform-import.test.mjs

Wire the shared import API into CLI/pi and the existing validation/export
pipeline, returning deterministic manifests, reports, and truthful statuses.

**Acceptance criteria:**
- F005 completeness, receipts, diagnostics, pins, and exit/status contracts are tested across entry points.
- Invalid imports cannot bypass common gates; partial output is visibly incomplete.
- Secret redaction, limits, cancellation, no-execution behavior, and atomic output handling have adversarial coverage.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`

### T006: Imported overview and network-detail interaction

**Feature:** F006
**Priority:** medium
**Type:** feature
**Dependencies:** T005
**Likely files:** src/import/views.ts, src/renderer.ts, tests/terraform-views.test.mjs, tests/terraform-browser.test.mjs, tests/fixtures/terraform/interactive/

Build deterministic guided/focused views and safe report associations through
the shared renderer; establish the pinned offline browser verification command.

**Acceptance criteria:**
- F006 view switching, themes, detail levels, identities, and omission notices work offline.
- Density handling and imported export receipts use existing gates.
- Browser tests assert no external requests and safe rendering of hostile source text.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`
- `node tests/terraform-browser.test.mjs`

### T007: Plan diff and evidence-backed comparison views

**Feature:** F007
**Priority:** medium
**Type:** feature
**Dependencies:** T003, T005, T006
**Likely files:** src/import/compare.ts, src/import/comparison-views.ts, tests/terraform-compare.test.mjs, tests/terraform-browser.test.mjs

Implement before/after correspondence and change presentation over independently
validated snapshots, with explicit limitations on drift claims.

**Acceptance criteria:**
- F007 action ordering, moves, removals, unknown/redacted changes, and attribute-only changes have fixtures.
- Recorded drift, snapshot differences, and insufficient evidence have distinct labels/statuses.
- Browser navigation preserves snapshot completeness, provenance, detail views, and receipts.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`
- `node tests/terraform-browser.test.mjs`

### T008: Adversarial and deterministic readiness suite

**Feature:** F008
**Priority:** high
**Type:** feature
**Dependencies:** T005, T006, T007
**Likely files:** tests/run-tests.mjs, tests/terraform-readiness.test.mjs, tests/fixtures/terraform/, tests/goldens/terraform/

Consolidate the readiness matrix, deterministic byte comparisons, semantic
assertions, hostile-input coverage, and full core regression evidence.

**Acceptance criteria:**
- Every readiness-matrix category below has committed sanitized fixtures and expected outcomes.
- Repeat/permutation tests pass while ordered actions/views retain meaning.
- Core tests remain green without weakened gates; security and browser evidence is reproducible offline.

**Verification:**
- `npx --no-install tsc --noEmit`
- `node tests/run-tests.mjs`
- `node tests/terraform-browser.test.mjs`

### T009: Support documentation and release evidence

**Feature:** F008
**Priority:** medium
**Type:** modify
**Dependencies:** T008
**Likely files:** README.md, docs/terraform-import.md, docs/terraform-import-readiness.md, skills/stratus/SKILL.md

Publish usable examples, the precise support matrix, operational limits, and
release evidence rather than relying on historical design-stage status prose.

**Acceptance criteria:**
- Document formats, expressions, resource variants, aliases, variable precedence, module mappings, snapshot modes, sensitivity, limits, and exit codes.
- Examples cover HCL, state/plan JSON, partial results, and comparison views without implying Terraform execution.
- Record exact pins, tested commands, remaining gaps, and evidence for R001–R014; confirm core prerequisite tasks were merged.

**Verification:**
- `node tests/run-tests.mjs`
- Execute documented CLI examples against committed sanitized fixtures.
- Review the readiness report against R001–R014 and the matrix below.

## Readiness fixture matrix

| Area | Required evidence |
|---|---|
| Basic architecture | VPC, resolved AZs/subnets, ALB, compute, routing, managed database facts |
| Modules | Repeated names, nested inputs/outputs, numeric/string keys, aliases, provider remapping |
| Partial configuration | Missing region/AZ, unknown expansion, unresolved data source/remote module |
| Placement | One multi-subnet ALB; EC2 interface/launch-template/default cases; RDS candidates without invented roles |
| Managed services | EKS control plane outside customer subnets; Lambda connectivity without execution containment |
| Relationships | SG/IAM/KMS/depends_on do not imply ownership or request traffic |
| Formats | Supported raw/show state and plan versions, malformed input, unsupported versions/actions |
| Changes | Create/update/delete/replace/read/no-op/move, planned unknowns, redacted changes, recorded drift |
| Incompleteness | Exhaustive omission accounting, no dangling references, blocked overall reference-grade claim |
| Security | Secret canaries, hostile labels, path/symlink escape, bounded failure, no network/execution |
| Determinism | Repeat/permutation equality, stable identities, pinned versions, preserved ordered sequences |
| Interaction/export | Offline views, detail levels, themes, identity linkage, notices, export receipts |
| Regression | Existing core tests and provider presets retain their meaning and validation strength |

## Risks

- Bounded HCL evaluation cannot reproduce arbitrary Terraform/provider behavior; the support matrix and unresolved diagnostics are part of the product contract.
- Supplied state/plan files may contain unmarked secrets; allowlisted export and redaction cannot certify arbitrary source files secret-free.
- Candidate placement, generic dependency, and diff metadata do not fit every current spec branch; the report is authoritative for those distinctions until explicitly versioned common-schema support exists.
- Large topologies may exceed readable geometry budgets; focused views or density failures are preferable to silent omission.
- Provider format/semantics evolution requires new versioned mappings and fixtures, never implicit reinterpretation.

## Release gate

Complete T001–T009 and attest the readiness matrix with pinned versions, offline
type/test results, and browser evidence. Completion certifies the documented
translation and diagram validation scope only: not deployment success, current
cloud state, reachability, or cloud security.

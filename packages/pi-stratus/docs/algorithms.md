# Stratus element knowledge base — algorithms & patterns

Implementation knowledge base for the Stratus diagram engine. Every rule here is
cross-checked against the four proof diagrams in `diagrams/` (vpc-lattice,
eks-ipv6, firewalls-centralized, firewalls-distributed), all of which validate
clean under the archify contract and pass browser visual-check.

Sources:
- `docs/stratus-renderer-spec.md` — full renderer specification measured from the
  official AWS IPv6 dual-stack reference diagram (lead-engineer analysis).
- `docs/aws-ipv6-dual-stack-reference.png` — the official AWS gold-standard diagram.
- AWS layout guidelines (awslabs/aws-architecture-diagram skill): spacing, edge
  routing, service placement, auxiliary-service rules.
- Azure Well-Architected "design diagrams" guidance: directional arrows, no
  bidirectional arrows, accuracy over simplicity, legend for line semantics,
  progressive disclosure, metadata.
- archify authoring contract (tt-a1i/archify): typed spec → deterministic
  validation → standalone HTML; grid placement; showcase gates.

## 1. Core formulas

### 1.1 Uniform scaling

```text
scale   = min(viewportW / referenceW, viewportH / referenceH)
offsetX = (viewportW - scale * referenceW) / 2
screenX = offsetX + scale * logicalX
```

Projected text must stay readable: `projectedFontPx = sourceFontPx × scale ≥ 6`.
At a 1440×900 desktop the available diagram width is ~930px — a viewBox wider
than ~1395px drops 9px sublabels below the floor (measured: 1430px viewBox →
scale 0.650 → 5.85px → FAIL; ≤1395px → ≥6.0px → pass).

### 1.2 Boundary nesting (per-level tokens, not depth-linear)

```text
childOriginX = boundary.x + padLeft
childOriginY = boundary.y + headerH + padTop
innerW = boundary.w - padLeft - padRight
innerH = boundary.h - headerH - padTop - padBottom - footerH
boundary.w = padLeft + contentW + padRight
boundary.h = headerH + padTop + contentH + padBottom + footerH
```

Recommended starting tokens (from the AWS reference measurements):

```text
Cloud:  headerH=44, padLeft=40, padRight=16, padTop=4,  padBottom=20
Region: headerH=44, padLeft=40, padRight=40, padTop=16, padBottom=24
VPC:    headerH=60, padLeft=32, padRight=32, padTop=24, padBottom=24
AZ:     headerH=0,  padLeft=24, padRight=24, padTop=16, padBottom=16, footerH=32
Subnet: headerH=56, padLeft=12, padRight=12, padTop=12, padBottom=12
```

Style per level: Cloud = solid corner-tab rectangle; Region/VPC/AZ = dashed;
Subnet = filled panel. AZ label is footer-centered, not header.

### 1.3 Grid pitch and cells

```text
pitchX = cellW + gapX
pitchY = cellH + gapY
cellX  = originX + col * pitchX
gridW  = cols * cellW + (cols - 1) * gapX
```

**User preference (2026-09-24): more spacing, stricter overlap handling.**
Default gaps are raised: gapX ≥ 90 for icon-class cells, gapY ≥ 56 for
boundary-heavy layouts; boundary padding +25% over the AWS-measured tokens.
Overlap rules (hard): boundary bounding boxes must not overlap unless the
overlap is the semantic point (true containment Region ⊃ VPC ⊃ AZ ⊃ subnet);
wrap-sets must be spatially contiguous — a wrap-set whose members are not
adjacent inflates its bounding box over unrelated boundaries (measured: eks
proof public-subnet box spanned rows 0–2 and swallowed the private subnet);
coincident boundary edges (identical wrap-sets) are a validation failure.

Cell classes (glyph vs occupied cell incl. labels): bare icon 48×48;
gateway+label 144×88; compact compute 112×88; public subnet ≥230×160;
private subnet ≥230×150; AZ ≥310×420 (measured AZ pitch ≈371px, gap ≈80px);
route-table card ≥190×116.

**Measured lesson (proof diagrams):** empty grid rows still consume pitch —
contiguous rows only. A diagram that skips a row rendered ~240px taller than
the viewport and failed visual-check; compacting to contiguous rows fixed it.

### 1.4 Label masks and clear gap

```text
labelMask ≈ 6.5px × ASCII units + 13px   (CJK counts as 2 units)
clear gap > labelMask + 8px breathing room
```

**Measured lesson:** with 120px cells, adjacent-column gaps need gapX ≥ 70 for
7–8 character labels ("ingress", "filtered"); 12-character labels
("allow / deny", 68px mask) do not fit any gap that keeps the font floor —
shorten the label ("filtered", 45px) instead of widening the grid.
Repair order: move label → adjust route/spacing → shorten wording preserving
meaning → omit only fully-implied wording.

### 1.5 Orthogonal routing side contracts

```text
first segment: perpendicular, OUTWARD from the named fromSide
final segment: perpendicular, INWARD to the named toSide
interior segments ≥ 16px; nonzero segments ≥ 8px
parallel traffic planes separated ~10px
```

Edges never cross unrelated opaque nodes; a long run along a container border
is a failure. Route around via clear lanes between rows/columns (L-shaped 2
waypoints, U-shaped 3).

## 2. Repeatable element library

| Element | Shape spec |
|---|---|
| Cloud boundary | solid corner-tab rectangle, logo + label top-left tab |
| Region/VPC/AZ boundary | dashed rectangle; Region+VPC title top-left with icon; AZ title footer-centered |
| Subnet panel | filled rounded panel (public=green tint, private=blue tint), lock icon + title + two-tone CIDR line (IPv4 dark, IPv6 orange) |
| Gateway icon | circle 48px with arch/gate glyph, label below (two lines) |
| Compute icon | chip/square 40px, label below: name, addresses |
| Route-table card | white card, blue header bar, Destination/Target columns, alternating row shading; placed OUTSIDE subnets as side rails |
| Numbered badge | solid circle ~22px, white numeral, anchored at source end of the decision edge, 20px offset, 10px min clearance |
| Traffic planes | separate colored line families per protocol/segment (blue=IPv4, orange=IPv6) with legend |
| Auxiliary services | dashed unfilled box, no edges (CloudWatch/CloudTrail/X-Ray/IAM only) |

## 3. Layout patterns

1. **Recursive boundary stack** — Cloud→Region→VPC→AZ→Subnet as nested insets
   with per-level style tokens; containment truth per provider (AWS subnet ∈
   one AZ; GCP regional subnets; Azure regional VNets).
2. **Tiered top-to-bottom VPC layout** — users → IGW → LB → compute → data;
   left-to-right spine with short vertical branches for pipelines.
3. **Semantic traffic planes** — one colored line family per protocol/segment;
   legend explains line/border semantics; dashed = async/auxiliary only.
4. **Auxiliary services** — dashed unfilled corner box, no edges, no step badges.
5. **Progressive disclosure** — split overloaded comparisons into focused
   diagrams (measured: a 7-column comparison diagram could not satisfy both
   the 6px font floor and label masks; two 4-column diagrams validate clean).
6. **Deterministic layout from spec** — grid placement (row/col) computed from
   the spec; no hand-tuned coordinates; same spec → same layout bytes.

## 4. Validation gates (deterministic, offline)

- schema validation with actionable diagnostics (stable codes, subjects,
  measured evidence, supported fixes)
- edge-through-node (hard failure), micro-segment floors (8/16px)
- label clearance: label-to-node, label-to-label, label-to-route ≥ 4px
- container-border-run detection
- endpoint side-direction contracts
- desktop readability: projected font ≥ 6px at 1440×900; scrollWidth/Height ≤
  viewport at 1440×900, 1600×1000, 1920×1080
- boundary-title convergence and label-fit diagnostics

## 5. Export pipeline (R015/F010)

- **SVG**: native serialization of the rendered scene — byte-deterministic for
  a fixed spec + theme; the single source geometry for all other exports.
- **PDF**: headless Chrome `page.pdf()` over the standalone HTML (vector,
  fixed viewport for determinism) or svg2pdf.js for pure-JS vector export.
- **Raster (PNG/JPEG)**: headless Chrome screenshot with fixed
  deviceScaleFactor (deterministic), or canvas rasterization of the SVG.
- **Slides**: one slide per guided view / reference preset — PptxGenJS (pptx
  with embedded raster) or a reveal.js HTML deck; print-CSS PDF as fallback.
- All exports carry the validation receipts; failed gates block export claims.

## 6. Proof-diagram receipts (element-system contract tests)

| Diagram | Validation | Browser evidence |
|---|---|---|
| vpc-lattice | showcase pass, attempt 2 (label/route repairs) | visual-check pass |
| eks-ipv6 | showcase pass, attempt 4 (side contracts, via corridors) | visual-check pass |
| firewalls-centralized | showcase pass, attempt 1 (after split) | visual-check pass |
| firewalls-distributed | showcase pass, attempt 1 | visual-check pass |

Element lessons fed back into the library: boundary kinds are provider-true
only in Stratus (archify's flat model forces region-kind VPC boxes — the
rewrite motivation); grid `row/col` requires `layout.mode: "grid"`; variant
styling belongs to edges, not nodes; auxiliary services carry no edges.

## 6. AWS network diagram DNA (cloudviz.io, 2026-09-24)

Source: https://cloudviz.io/blog/aws-network-diagram

### 6.1 Canonical VPC element vocabulary (16 first-class elements)

VPC; Subnets; Availability Zones; Internet Gateway; Route Tables; Security
Groups; NACLs (subnet-level); NAT Gateway; VPN Connections; Direct Connect;
ALB/NLB; Transit Gateway; VPN Gateway; VPC Endpoint Gateway (S3/DynamoDB);
VPC Peering Connection; VPC Endpoint Interface. The Stratus catalog
(`src/cloud.ts`) must cover this vocabulary as first-class spec objects —
each with provider-true placement rules (IGW at VPC level, NAT/ALB in public
subnets, compute/data in private subnets, Route53/CloudFront/S3/IAM/CloudWatch
outside VPC).

### 6.2 Progressive-disclosure ladder (the generator DNA)

Cloudviz builds complexity by starting simple and adding one resource family
per step, each step a complete readable diagram:

1. Simple VPC — 3 AZs, 3 public/private subnet pairs, IGW, route tables
2. + ALB + EC2 targets in an auto-scaling group
3. Three-tier — external + internal ALBs, presentation/app/data tiers,
   RDS + read replica, NAT Gateway for private egress
4. + VPC gateway endpoint — S3 access without traversing the internet
5. + Site-to-Site VPN — VPN GW (AWS) ↔ Customer GW (on-prem)
6. + Transit Gateway — hub routing between Production and Validation VPCs

Stratus presets follow the same ladder: each preset is a complete,
truth-tested snapshot; complexity is added one family per step. Never encode
every subsystem in one diagram (matches Azure "layer, don't overload").

### 6.3 Traffic-flow-first principle

A good AWS network diagram shows flow to/from the public internet (north-
south) and between VPCs (east-west via TGW/peering). Route tables determine
the flow and are rendered as first-class tables (Destination | Target), not
decorative boxes. Security Groups/NACLs are rendered as membership bands or
annotations, distinct from containment.

### 6.4 Export interoperability

Cloudviz exports to Draw.io/diagrams.net — interoperability with existing
editors is table stakes for a diagram package. Stratus: SVG/PDF/raster/slides
first (R015); draw.io XML export parked (out of scope this iteration).

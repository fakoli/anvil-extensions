Task: You are the LEAD ENGINEER for Stratus. PROGRAMMATIC SUGGESTION TASK (read-only, do NOT edit files): produce concrete programmatic suggestions — TypeScript interfaces, module structure, and algorithm pseudocode — for implementing the Stratus engine using the design constructs already measured and recorded. The implementor (pi) will code directly from your suggestions.
Read these design constructs:
- /home/fakoli/code/stratus/docs/stratus-renderer-spec.md — renderer spec measured from the official AWS IPv6 dual-stack reference (boundary nesting tokens, cell classes, label masks, routing side contracts, design patterns)
- /home/fakoli/code/stratus/docs/algorithms.md — element knowledge base (grid pitch formulas, label mask formula, clear-gap rule, projected-font floor, overlap rules incl. the user's spacing/overlap preferences, AWS network diagram DNA: 16-element VPC vocabulary, progressive-disclosure ladder, traffic-flow-first)
- /home/fakoli/code/stratus/docs/PRD.md — 16 requirements, 11 features, 13 tasks (T001 schema+validator core is next)
- The archify contract reference (read for the spec→validate→render pattern, NOT to copy): /tmp/pi-github-repos/runtime-rSvkCw/537a416f6aafeb5b762ca10d9f00382a7cff1aed5f20ceedb70aeda81e7e7a19/archify/schemas/architecture.schema.json and renderers/architecture/render-architecture.mjs
- /home/fakoli/code/stratus/diagrams/*.architecture.json — the four proof specs (known findings: overlapping boundary boxes from flat wrap-lists, conflated edges)
DELIVER concrete programmatic suggestions as one markdown report:
1. src/schema.ts — TypeScript types for the provider-discriminated spec: TRUE containment tree (Region ⊃ VPC/VNet ⊃ AZ ⊃ Subnet ⊃ resources) with overlapping spatial frames (SG bands crossing tiers) instead of flat wrap-lists; resources with explicit single/multi-subnet/zone placement; edges with semantic labels + variants + address-family traffic planes; routing facts (why packets take a path) as first-class objects; association vs request vs service→target edge kinds. Show the actual interfaces.
2. src/layout.ts — deterministic layout algorithm pseudocode: grid pitch (pitchX = cellW + gapX), boundary stack insets per level (Cloud corner-tab → dashed Region/VPC/AZ → filled subnet panels), label mask measurement (6.5px × ASCII units + 13px), clear-gap rule (gap > labelMask + 8), projected-font floor (≥6px at 1440 desktop → viewBox ≤ ~1395px), port spread on shared sides, orthogonal routing with perpendicular side contracts, micro-segment floors (interior ≥16px, nonzero ≥8px), overlap repair order.
3. src/renderer.ts — SVG generation structure: per-level boundary styles, icon shapes (circular gateways vs chip compute), two-tone CIDR text, route-table cards (header bar + Destination|Target columns), numbered badges at source ends, dark/light themes, legend, single-file standalone HTML with spec text as data (never executable markup).
4. src/validator.ts — the deterministic gates as typed checks with actionable diagnostics: containment truth per provider, CIDR containment + no sibling overlap, edge endpoints, cross-boundary edge labels, label-fit, provider scope, boundary-box overlap, coincident boundary edges, micro-segment floors, label-route clearance, border-run detection. Show the diagnostic shape (code, severity, message, evidence, supportedFixes).
5. Module structure — how the modules compose (spec → validate → layout → render → export), what each exports, and the test strategy for tests/run-tests.mjs (deterministic golden bytes, fixture valid/invalid specs per provider).
Output: one markdown report, sections 1-5, actual TypeScript interfaces and pseudocode blocks, concrete and implementable. The implementor codes directly from this.
## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.
Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable
Required evidence: review-findings, residual-risks
Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```
read: /home/fakoli/code/stratus/docs/stratus-renderer-spec.md
# AWS IPv6 Dual-Stack Diagram: Renderer Specification
**Evidence**
- Image: `/home/fakoli/code/pi-env/.pi-subagents/artifacts/aws-ref-diagrams/ipv6-dual-stack-internet.png`
- Notes: `/home/fakoli/code/pi-env/.pi-subagents/artifacts/aws-ref-diagrams/composition-notes.md`
**Notation:** **Measured** means estimated from the supplied 1134×680 raster, generally within ±2–4 px. **Recommended** means a Stratus implementation rule, not an assertion about the original artwork. Coordinates use a top-left origin.
**Important:** The image contradicts several composition notes. In particular, the VPC outline is solid, subnet borders are not visibly dashed, badges are rounded squares, the AZ gap is approximately 80 px, and internet links are diagonal. Preserve these distinctions rather than recording the notes’ approximations as measured facts.
## 1. Element Shape Description
### 1.1 Canvas and boundary containers
The background is approximately **`#FAFAFA`**, not pure white. Shapes have square corners unless explicitly stated otherwise. No drop shadows are visible.
| Element | Measured bounds `(x, y, width, height)` | Shape, styling, and label placement |
|---|---:|---|
| Internet | Glyph approximately `(705, 15, 59, 37)` | Unfilled black cloud outline with upward/downward arrows. “internet” centered below, approximately 20 px text. Entire element is above the AWS Cloud boundary. |
| AWS Cloud | `(7, 73, 1120, 598)` | Solid dark navy outline, approximately 1.5–2 px. Top-left dark tab approximately 43×44 px contains a white cloud glyph. “AWS Cloud” sits immediately right of the tab, around `(67, 89)`, approximately 17 px text. |
| Region | `(51, 121, 1063, 530)` | Blue dashed outline, approximately 1.5 px. Dash/gap approximately 4/3 px. Blue top-left tab approximately 44×46 px contains a white flag. “Region” appears right of the tab, around `(111, 137)`, approximately 16 px text. |
| Amazon VPC | `(191, 144, 767, 447)` | **Solid green** outline, approximately 1.5 px. Green corner tab approximately 44×44 px contains a white cloud-and-lock glyph. Title and CIDR occupy two lines beginning around `(251, 160)`. |
| Availability Zone 1 | `(247, 228, 291, 397)` | Blue dashed rectangle, approximately 1.5 px; dash/gap roughly 6/5 px. Label centered near `(393, 608)`, approximately 10 px text. |
| Availability Zone 2 | `(618, 228, 294, 397)` | Same styling. Label centered near `(765, 608)`. |
**Measured spacing**
- Cloud outer margins: approximately **7 px left, 7 px right, 9 px bottom**.
- Cloud top starts at **73 px**, reserving space for the internet element.
- Cloud→Region inset: approximately **44 px left, 48 px top, 13 px right, 20 px bottom**.
- Region→VPC inset: approximately **140 px left, 23 px top, 156 px right**.
- AZ-to-AZ horizontal gap: approximately **80 px**, not 50 px.
- AZ labels sit approximately **17 px above the bottom border**, rather than cutting into it.
**Containment exception:** Both AZ rectangles extend approximately **34 px below the VPC’s bottom border**. The artwork therefore does **not** implement strict recursive visual containment. Stratus should distinguish an exact-reference composition profile from a corrected, strictly nested profile.
### 1.2 Subnet panels
| Panel | Approximate bounds | Appearance |
|---|---:|---|
| AZ1 public | `(291, 244, 229, 161)` | Light green fill **`#E5EFE2`** |
| AZ2 public | `(637, 245, 226, 161)` | Same |
| AZ1 private | `(289, 416, 229, 148)` | Light blue fill **`#E2EEF4`** |
| AZ2 private | `(634, 416, 229, 148)` | Same |
- Rectangular flat fills; **no distinct dashed subnet perimeter is visible**.
- Colored lock tabs are approximately **37–39 px square**, flush with the upper-left corner.
- White lock glyphs are approximately **18×23 px**.
- Title starts approximately **44 px right of the panel’s left edge** and **8 px below its top**.
- Titles and CIDRs use approximately **13–14 px** text with **16–17 px** line spacing.
- Header occupies approximately **55–60 px**.
- Public/private panel vertical separation is approximately **10–12 px**.
- AZ1 panel inset is approximately **43 px left / 18 px right**; AZ2 reverses the emphasis, approximately **19 px left / 49 px right**. These asymmetric gutters accommodate traffic paths.
**CIDR typography**
- Public title and IPv4 text are green; private title and IPv4 text are blue.
- VPC title and IPv4 CIDR are green.
- IPv6 CIDRs are orange **`#FF9900`**.
- Preserve a shared baseline for mixed-color runs.
- Subnet headers wrap after the IPv4 CIDR and `+`; IPv6 occupies the third line.
| Panel | IPv4 | IPv6 |
|---|---|---|
| Public AZ1 | `10.0.0.0/24` | `2001:db8:1234:1a00::/64` |
| Public AZ2 | `10.0.1.0/24` | `2001:db8:1234:1a01::/64` |
| Private AZ1 | `10.0.2.0/24` | `2001:db8:1234:1a02::/64` |
| Private AZ2 | `10.0.3.0/24` | `2001:db8:1234:1a03::/64` |
A dark-IPv4/orange-IPv6 style is a reasonable library option, but it is **not an exact description of these boundary labels**.
### 1.3 Gateway and compute icons
| Type | Measured geometry | Renderer specification |
|---|---|---|
| IGW | Approximately 50×50 px; center `(672, 152)` | Purple unfilled circular enclosure with nested arch/gate strokes. Background-colored interior. Stroke approximately 2 px. |
| EIGW | Approximately 50×50 px; center `(803, 152)` | Similar circular arch/gate treatment. Distinguish through metadata and label, not merely shape. |
| NAT gateway | Approximately 41×41 px; centers `(337, 336)` and `(815, 336)` | Purple circle containing a branching/crossing-arrow glyph. |
| EC2 instance | Approximately 42×42 px including pins | Orange square chip outline, inner square approximately 30×30 px, short pins on all four sides. Panel-colored interior, not a solid orange tile. |
Representative purple is approximately **`#5630AF`**; chip stroke is approximately **`#D45B07`**.
**Label placement**
- IGW/EIGW labels: centered below icons, approximately **12–13 px**, two lines, **16–17 px** line height.
- NAT/EC2 labels: centered below icons, approximately **9–10 px**, bold, **11–12 px** line height.
- Icon-to-label gap: approximately **5–9 px**.
- Label widths exceed icon widths: allow approximately **110–145 px** for an icon-plus-label cell.
**Visible label structure**
- IGW: `internet gateway` / `(IGW)`.
- EIGW: `egress-only internet` / `gateway (EIGW)`.
- NAT: `NAT Gateway AZ1` or `AZ2` / `-IPv4-only-`.
- EC2: instance name / IPv4 address, including `+ EIP` for public instances / IPv6 address.
- Public EC2 A/B centers are approximately `(457, 334)` and `(698, 334)`.
- Private EC2 C/D centers are approximately `(407, 490)` and `(755, 490)`.
Use scalable vector icon assets where available; the raster supports approximate geometry, not exact reconstruction of every glyph contour.
### 1.4 Route-table cards
Three cards sit **outside subnet panels**, within the Region composition:
| Card | Approximate bounds |
|---|---:|
| Public subnets route table | `(67, 273, 168, 116)` |
| Private subnet AZ1 route table | `(58, 429, 183, 116)` |
| Private subnet AZ2 route table | `(918, 435, 183, 116)` |
**Structure**
1. Blue title bar, approximately **21 px high**, fill near **`#007CBD`**.
2. White centered bold title, approximately **10 px**.
3. Pale lavender column-heading row, approximately **19 px high**, fill **`#F3E4FF`**.
4. Four body rows, approximately **19 px each**.
5. Thin blue perimeter and horizontal row separators, approximately **1 px**.
6. Two aligned text columns: `Destination` and `Target`; no prominent vertical divider.
7. Body text approximately **8–9 px**, bold, **4 px** horizontal padding.
The destination column occupies roughly **70–78%** of card width, depending on the target strings. Body-row alternation is not clearly established by the raster; do not require zebra striping for fidelity.
**Contents**
- Both IPv4 and IPv6 VPC CIDRs route to `local`.
- Public table: `0.0.0.0/0 → IGW`; `::/0 → IGW`.
- Private AZ1: `0.0.0.0/0 → NATGW-AZ1`; `::/0 → EIGW`.
- Private AZ2: `0.0.0.0/0 → NATGW-AZ2`; `::/0 → EIGW`.
Cards are explanatory objects, not network hops. They have no visible connector edges.
### 1.5 Numbered badges
**Actual shape:** blue **rounded squares**, not circles.
- Size approximately **27–29 px square**.
- Corner radius approximately **4–5 px**.
- White bold numeral approximately **16 px**.
- Colors include **`#0070C0`** and **`#007CBD`**.
- No visible shadow or contrasting outline.
Examples:
- Badge 1: approximately `(445, 148, 28, 28)`, beside the VPC CIDR heading.
- Badge 2: approximately `(831, 126, 28, 29)`, beside EIGW.
- Repeated badges 3–6 identify equivalent steps in both AZ paths.
These are **semantic step annotations**. The artwork does not consistently place them a fixed distance from the source; badge 6 on the left is far along the lower IPv6 route.
### 1.6 Edge styling
| Family | Observed appearance | Meaning |
|---|---|---|
| Blue | Approximately 1.5 px solid, near `#0095D9` | Private IPv4→NAT and NAT→IGW, steps 4 and 5 |
| Orange | Approximately 1.5 px solid, `#FF9900` | Private IPv6→EIGW, step 6 |
| Green | Approximately 1.5 px solid, near `#1D8900` | Public EC2↔IGW connectivity, step 3; dual-stack by architecture facts |
| Dark navy/black | Approximately 1.5–2 px | Internet↔IGW/EIGW |
- Internal traffic routes are predominantly **orthogonal**, with square 90° bends.
- Arrowheads are **open chevrons**, roughly **10–12 px long** and **10–12 px wide** overall.
- Public green links and internet links show bidirectional indications; **target-only arrows are not a universal source rule**.
- Internet links are **diagonal**, connecting near `(735, 79)` to the two gateway tops.
- Parallel vertical tracks include approximately **10–13 px** separation.
- Some paths terminate adjacent to labels or icon envelopes rather than precisely on the visible glyph.
The image has **no explicit legend**. A Stratus legend is a recommended addition.
## 2. Mathematical Formulas
### 2.1 Coordinate system and scaling
Keep layout in logical pixels; scale the complete scene uniformly.
```text
referenceW = 1134
referenceH = 680
scale = min(viewportW / referenceW, viewportH / referenceH)
offsetX = (viewportW - scale * referenceW) / 2
offsetY = (viewportH - scale * referenceH) / 2
screenX = offsetX + scale * logicalX
screenY = offsetY + scale * logicalY
```
For responsive diagram generation, recompute layout rather than independently stretching widths and heights.
### 2.2 Boundary nesting and padding
The source does **not** imply a universal depth-linear inset. Use per-level, per-side tokens.
```text
Measured Cloud→Region:
padLeft = 44
padTop = 48
padRight = 13
padBottom = 20
Measured Region→VPC:
padLeft = 140
padTop = 23
padRight = 156
padBottom ≈ 60
```
These top insets already include any reserved header space. Do not add that space twice.
For a strictly nested Stratus profile:
```text
childOriginX = boundary.x + padLeft
childOriginY = boundary.y + headerH + padTop
innerW = boundary.w - padLeft - padRight
innerH = boundary.h - headerH - padTop - padBottom - footerH
boundary.w = padLeft + contentW + padRight
boundary.h = headerH + padTop + contentH + padBottom + footerH
```
Recommended starting tokens:
```text
Cloud:  headerH=44, padLeft=40, padRight=16, padTop=4,  padBottom=20
Region: headerH=44, padLeft=40, padRight=40, padTop=16, padBottom=24
VPC:    headerH=60, padLeft=32, padRight=32, padTop=24, padBottom=24
AZ:     headerH=0,  padLeft=24, padRight=24, padTop=16, padBottom=16,
        footerH=32
Subnet: headerH=56, padLeft=12, padRight=12, padTop=12, padBottom=12
```
Route corridors and card rails add to these minima.
If an API exposes a depth-based default, treat it as a fallback—not a measurement:
```text
fallbackInset(depth) = base + k * depth
base = 16
k = 4
effectiveInset(level, side) =
    explicitStyleToken(level, side) ?? fallbackInset(depth(level))
```
### 2.3 Grids and element cells
Distinguish **glyph size** from **occupied layout cell**, which includes labels.
| Class | Recommended cellW × cellH | gapX / gapY | Qualification |
|---|---:|---:|---|
| Bare icon | 48×48 | 16 / 16 | No external label |
| Gateway with label | 144×88 | 16 / 24 | Handles two-line label |
| Compact compute/NAT with label | 112×88 | 8 / 16 | Source-like compact profile |
| Public subnet | 230×160 minimum | 24 / 12 | Grow for labels and corridors |
| Private subnet | 230×150 minimum | 24 / 12 | Source is about 148 px high |
| AZ | 310×420 minimum | 80 / 32 | Source AZs are about 292×397 |
| Route-table card | 190×116 minimum | 16 / 40 | Grow for text |
```text
pitchX = cellW + gapX
pitchY = cellH + gapY
column = index % columnCount
row = floor(index / columnCount)
cellX = originX + column * pitchX
cellY = originY + row * pitchY
gridW = columnCount * cellW + (columnCount - 1) * gapX
gridH = rowCount * cellH + (rowCount - 1) * gapY
```
Measured AZ pitch is approximately **371 px**:
```text
AZ2.x - AZ1.x = 618 - 247 = 371
AZgap = AZ2.x - (AZ1.x + AZ1.w) ≈ 80
```
A **50 px AZ gap** can be a compact preset, but it is not the measured value here.
### 2.4 Label measurement and masks
For an initial estimate at approximately 12–13 px font size:
```text
units(text) =
    Σ(character is CJK/full-width ? 2 : 1)
estimatedMaskW = 6.5 * units(text) + 13
estimatedMaskH = lineCount * lineHeight + 2 * verticalPadding
lineHeight ≈ 1.2 * fontSize
verticalPadding = 3
```
At other font sizes:
```text
estimatedMaskW =
    6.5 * (fontSize / 13) * units(text) + 13
```
Production JavaScript should use actual font metrics:
```text
maskW = max(measureText(line).width for each line) + 2 * paddingX
paddingX = 6.5
mixedCIDRWidth =
    measureText(ipv4Run).width +
    measureText(separatorRun).width +
    measureText(ipv6Run).width
```
CJK×2 is a fallback heuristic; emoji, combining marks, and proportional Latin text require real measurement.
For a label occupying a corridor:
```text
corridorGap > labelMaskWidth + 8
```
For clearance on both sides:
```text
corridorGap >= labelMaskWidth + 2 * clearance
clearance = 8
```
Apply the corresponding height formula to vertical gaps. Labels should reserve geometry; an opaque mask must not merely conceal an intersecting edge.
### 2.5 Route-table sizing
```text
titleH = 21
columnHeaderH = 19
rowH = 19
rowCount = 4
cardH = titleH + columnHeaderH + rowCount * rowH
      = 116
destinationW =
    max(measured destination heading and cells) + 2 * cellPadding
targetW =
    max(measured target heading and cells) + 2 * cellPadding
cardW = max(
    minCardW,
    destinationW + targetW,
    measuredTitleW + 2 * titlePadding
)
cellPadding = 4
titlePadding = 8
minCardW = 168
```
Use **190 px** as a reusable default, then expand when necessary.
### 2.6 Orthogonal routing and side contracts
For rectangle `R=(x,y,w,h)`:
```text
port(left,   t) = (x,     y + t*h)
port(right,  t) = (x+w,   y + t*h)
port(top,    t) = (x+t*w, y)
port(bottom, t) = (x+t*w, y+h)
normal(left)   = (-1, 0)
normal(right)  = ( 1, 0)
normal(top)    = ( 0,-1)
normal(bottom) = ( 0, 1)
```
For circular icons, cardinal ports lie at center ± radius.
```text
sourceStubEnd = sourcePort + stubLength * sourceOutwardNormal
targetStubStart = targetPort + stubLength * targetOutwardNormal
stubLength >= 16
```
Thus the first segment exits perpendicular to the source face; the final segment travels inward, perpendicular to the target face.
For polyline points `P[0...n]`:
```text
dx = P[i+1].x - P[i].x
dy = P[i+1].y - P[i].y
orthogonalSegment:
    (abs(dx) <= epsilon) XOR (abs(dy) <= epsilon)
segmentLength = abs(dx) + abs(dy)
all nonzero segments >= 8
interior segments >= 16
recommended endpoint stubs >= 16
epsilon = 0.01 logical px
```
Remove duplicate vertices and merge collinear segments before validation. The 8/16 px floors are **Stratus recommendations**, not measurements proven for every source segment.
Parallel route families:
```text
separation = 10
trackOffset(j, trackCount) =
    (j - (trackCount - 1)/2) * separation
corridorW >=
    (trackCount - 1) * separation + strokeW + 2 * clearance
strokeW = 1.5
clearance = 8
```
Route parallel tracks as a coordinated bundle through bends; naive independent polyline offsets can create crossings.
### 2.7 Arrowheads and badges
For an arrow tip `T`, incoming unit direction `u`, and perpendicular `v`:
```text
arrowLength = 10
arrowHalfWidth = 5
wing1 = T - arrowLength*u + arrowHalfWidth*v
wing2 = T - arrowLength*u - arrowHalfWidth*v
draw open polyline: wing1 → T → wing2
```
Recommended badge anchoring uses distance along the route:
```text
badgeW = badgeH = 28
badgeRadius = 5
preferredArcDistanceFromSource = 20
minimumClearance = 10
anchor = pointAtArcLength(route, preferredArcDistanceFromSource)
```
The 20 px preference is subordinate to clearance. For a badge centered directly along an outward source segment:
```text
minimumCenterDistance ≈ badgeW/2 + minimumClearance
                      = 14 + 10
                      = 24
actualDistance = max(20, 24)
```
Include the source label envelope in collision checks. If necessary, slide farther along the route or offset perpendicular to it; do not force a badge onto the source glyph.
## 3. Reusable Design Patterns and Validation
### 3.1 Recursive boundary stack with explicit fidelity profiles
Semantic hierarchy:
```text
Cloud
└── Region
    └── VPC
        ├── regional gateways
        ├── AZ1
        │   ├── public subnet
        │   └── private subnet
        └── AZ2
            ├── public subnet
            └── private subnet
```
Maintain separate **semantic containment**, **layout ownership**, and **paint geometry**.
| Level | Reference-image profile | Optional normalized profile |
|---|---|---|
| Cloud | Solid outline + corner tab | Same |
| Region | Dashed + flag tab | Same |
| VPC | Solid green + lock tab | Dashed green if library convention requires |
| AZ | Dashed + bottom-centered label | Same, strictly inside VPC |
| Subnet | Filled rectangle + lock tab | Filled, optional dashed perimeter |
Do not label the normalized profile an exact reproduction.
### 3.2 Containment trees versus flat wrap-lists
- Use a **containment tree** for ownership and network semantics.
- Use a **flat wrap-list** for siblings sharing a row, tier, or auxiliary-service collection.
- A wrap-list is a layout operator, not necessarily a visible or semantic boundary.
- Route-table cards can reference a subnet or subnet set while occupying external side rails.
- The public route table is shared explanatory material; do not duplicate it merely because there are two AZs.
### 3.3 Tiered layout with side rails
General reusable tier model:
```text
external users / internet
→ regional ingress or gateway tier
→ optional load-balancer tier
→ compute tier
→ optional data tier
```
For this diagram:
- Internet is above the Cloud.
- IGW/EIGW occupy the top VPC area.
- Public subnets contain NAT and public compute.
- Private subnets contain private compute.
- **No load balancer or data service is present.**
Suggested horizontal composition:
```text
left route-card rail | AZ1 | inter-AZ routing corridor | AZ2 | right card rail
```
Mirror resource ordering where useful: NAT is left of EC2 in AZ1, right of EC2 in AZ2. Encode this as a deterministic mirror rule, not individual coordinates.
### 3.4 Semantic traffic planes
Represent protocol and traffic role independently:
```text
edge = {
  source,
  target,
  protocol: "ipv4" | "ipv6" | "dual",
  role: "public-egress" | "nat-egress" | "private-ipv6-egress" | "internet",
  step,
  directionality,
  sourceFace,
  targetFace
}
```
Architecture constraints from `composition-notes.md:8–13`:
- Public dual-stack resources use IGW.
- Private IPv4 uses the NAT gateway in the **same AZ**, then IGW.
- Private IPv6 uses EIGW.
- Do not route private IPv6 through NAT based on the notes’ erroneous orange-step description.
Reference palette:
- Blue: IPv4 NAT paths.
- Orange: private IPv6 path.
- Green: public dual-stack path.
- Dark: internet links.
For generated diagrams, add a compact legend: approximately **24 px line sample**, **8 px sample-to-text gap**, and **20 px row pitch**.
### 3.5 Auxiliary services and annotations
Dashed, unfilled auxiliary-service boxes are a useful library pattern, but **none is demonstrated in this image**.
Recommended auxiliary style:
- 1.5 px dashed outline, 4/4 px dash pattern.
- 16 px interior padding.
- 24 px minimum separation from the main stack.
- No inferred network edges; only edges explicitly supplied by the architecture spec.
Likewise, distinguish badges:
- Steps 1–2 attach to associations or boundary/gateway annotations.
- Steps 3–6 attach to traffic paths.
- Source-end anchoring is a default for new diagrams, not a reconstruction of all original placements.
### 3.6 Deterministic layout pipeline
```text
1. Normalize semantic spec; assign stable IDs and ordering.
2. Load fonts and icon metrics.
3. Measure text and intrinsic leaf envelopes.
4. Allocate sibling grids, tiers, card rails, and routing corridors.
5. Size boundaries bottom-up.
6. Position boundaries and children top-down.
7. Assign named-face ports and stable traffic tracks.
8. Route edges around inflated obstacles.
9. Place labels and badges.
10. Repair collisions with deterministic priorities.
11. Validate; expand and reroute within bounded iterations.
12. Emit SVG or Canvas drawing commands.
```
Derive coordinates from metrics and constraints. Source coordinates in Section 1 are evidence and possible golden-test targets, not a recommendation to hard-code every element.
Stable tie-breaking should use explicit order and then element ID. Pin font assets and wait for font loading to avoid browser-dependent reflow.
### 3.7 Label collision repair order
1. Measure with the final font.
2. Reposition labels within their permitted anchor slots.
3. Wrap at semantic separators while preserving CIDR tokens where possible.
4. Slide badges along their assigned route.
5. Move the conflicting edge to another reserved track.
6. Expand the local gap, panel, or boundary; propagate size changes upward.
7. Rerun routing and validation.
8. If still infeasible, emit a diagnostic rather than silently overlapping or shrinking text below the readability floor.
Recommended text floors:
- Standard generated diagrams: **11–12 px**.
- Compact route-table detail: **9 px**.
- The source’s approximately 8 px table text is a fidelity choice, not a comfortable general default.
### 3.8 Validation gates
| Gate | Concrete rule |
|---|---|
| Edge-through-node | Reject intersection with non-endpoint icon/body envelopes inflated by 8 px. Endpoint exemptions cover only assigned port approaches. |
| Label clearance | Reject edge or unrelated-shape intersection with label masks inflated by 8 px. |
| Orthogonality | Require horizontal/vertical segments within 0.01 px tolerance, except explicitly declared diagonal links. |
| Side contracts | First segment follows source outward normal; final segment opposes target outward normal. |
| Micro-segments | Remove zero-length segments; reject remaining segments under 8 px and interior segments under 16 px. |
| Parallel separation | Maintain approximately 10 px centerline spacing; validate arrowhead clearance separately. |
| Badge clearance | Maintain at least 10 px from unrelated glyphs/labels; intersection with its own host route is intentional. |
| Border-run detection | Flag an edge parallel to a boundary within 4 px for at least 16 px, unless explicitly allowed. |
| Boundary crossing | Permit declared crossings of semantic containers; distinguish these from passing through leaf nodes. |
| Strict containment | Require child paint bounds inside the parent content box in normalized mode. Reference-fidelity mode must declare the AZ/VPC exception. |
| Architecture | Private IPv4→same-AZ NAT→IGW; private IPv6→EIGW; public dual-stack→IGW. |
| Determinism | Same spec, theme, fonts, and dimensions must produce identical geometry. |
### Review findings and residual risks
- **Correct:** `composition-notes.md:8–13` provides a coherent architecture model; the visible private route cards agree with separate NAT/IPv4 and EIGW/IPv6 defaults.
- **Note — medium:** `composition-notes.md:20,23–24,27` misidentifies visible shape styles: solid VPC outline, filled subnets without visible dashed borders, and rounded-square badges.
- **Note — medium:** `composition-notes.md:21,24–25` has inaccurate size estimates: AZ gap approximately 80 px; private panels approximately 148 px high; route cards approximately 168–183×116 px.
- **Note — medium:** `composition-notes.md:28–29` omits green public dual-stack edges, incorrectly associates orange with steps 4–5, and overstates orthogonality and target-only arrowheads.
- **Note — medium:** The PNG at approximately `y=590–625` demonstrates AZ outlines extending below the VPC. Strict containment is a library improvement, not an observed property.
- **Fixed:** None; this was read-only analysis.
- **Blocker:** None for using this report. The contradictory note statements should not be promoted unchanged into renderer requirements.
- **Residual risks:** Exact font family, vector paths, and anti-aliased stroke colors cannot be recovered conclusively from the raster. Recommended layout and validation rules were not tested against a Stratus implementation. The linked AWS page was not independently fetched; findings concern the supplied artifact.
read: /home/fakoli/code/stratus/docs/algorithms.md
read: /home/fakoli/code/stratus/docs/PRD.md
ls: /home/fakoli/code/stratus
read: /tmp/pi-github-repos/runtime-rSvkCw/537a416f6aafeb5b762ca...
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
## Features
### F001 — Cloud-native spec schema
Typed JSON spec with provider-discriminated network/resource scopes:
AWS VPCs, GCP VPC networks, Azure VNets, address ranges where applicable,
regions, zones, subnets, scaling groups, catalog resources, semantic edges,
and overlapping visual frames without a containment tree.
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
## Out of scope (this iteration)
- Official vendor icon artwork (licensing review required first).
- Live cloud inventory/drift review; Terraform import (parked).
- General-purpose diagramming (workflow/sequence/lifecycle types).
- Autonomous cloud changes, deployment approval, or JEV-driven spec mutation.
- Training or hosting an LLM; the existing pi agent supplies spec authoring.
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
.git/
.gitignore
.pi/
.pi-subagents/
bin/
diagrams/
docs/
package.json
README.md
schemas/
skills/
src/
tests/
tsconfig.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/tt-a1i/archify/schemas/architecture.schema.json",
  "title": "Archify Architecture Diagram",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "diagram_type", "meta", "components"],
  "properties": {
    "schema_version": { "const": 1 },
    "diagram_type": { "const": "architecture" },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["title"],
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "locale": { "$ref": "common.schema.json#/$defs/locale" },
        "subtitle": { "type": "string" },
        "output": { "type": "string" },
        "animation": { "$ref": "common.schema.json#/$defs/animation" },
        "visual_preset": { "$ref": "common.schema.json#/$defs/visualPreset" },
        "quality_profile": { "$ref": "common.schema.json#/$defs/qualityProfile" },
        "engineering_profile": { "enum": ["deployment-ownership"] },
        "repository": {
          "type": "object",
          "additionalProperties": false,
          "required": ["url", "revision"],
          "properties": {
            "url": {
              "type": "string",
              "minLength": 1
            },
            "provider": { "enum": ["github", "gitee"] },
            "link_mode": { "enum": ["web", "local-only"] },
            "revision": { "type": "string", "pattern": "^[a-fA-F0-9]{40}$" }
          }
        },
        "views": { "$ref": "common.schema.json#/$defs/guidedViews" },
        "legend": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "mode": { "$ref": "common.schema.json#/$defs/legendMode" },
            "entries": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "frontend": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "backend": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "database": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "cloud": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "security": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "messagebus": { "$ref": "common.schema.json#/$defs/legendEntry" },
                "external": { "$ref": "common.schema.json#/$defs/legendEntry" }
              }
            }
          }
        },
        "viewBox": {
          "type": "array",
          "prefixItems": [
            { "type": "number", "minimum": 320 },
            { "type": "number", "minimum": 240 }
          ],
          "items": false,
          "minItems": 2,
          "maxItems": 2
        }
      }
    },
    "layout": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode"],
      "properties": {
        "mode": { "enum": ["grid"] },
        "origin": { "$ref": "common.schema.json#/$defs/point" },
        "cols": { "type": "integer", "minimum": 1, "maximum": 12 },
        "gapX": { "type": "number", "minimum": 0 },
        "gapY": { "type": "number", "minimum": 0 },
        "cellW": { "type": "number", "minimum": 40 },
        "cellH": { "type": "number", "minimum": 24 }
      }
    },
    "components": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "type", "label"],
        "properties": {
          "id": { "$ref": "common.schema.json#/$defs/id" },
          "type": { "$ref": "common.schema.json#/$defs/componentType" },
          "label": { "type": "string", "minLength": 1 },
          "sublabel": { "type": "string" },
          "tag": { "type": "string" },
          "brand": { "$ref": "common.schema.json#/$defs/brandMark" },
          "sources": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["path"],
              "properties": {
                "path": { "type": "string", "minLength": 1, "maxLength": 240 },
                "line": { "type": "integer", "minimum": 1 },
                "end_line": { "type": "integer", "minimum": 1 },
                "label": { "type": "string", "minLength": 1, "maxLength": 48 }
              }
            }
          },
          "row": { "type": "integer", "minimum": 0 },
          "col": { "type": "integer", "minimum": 0 },
          "pos": { "$ref": "common.schema.json#/$defs/point" },
          "size": {
            "type": "array",
            "prefixItems": [
              { "type": "number", "exclusiveMinimum": 0 },
              { "type": "number", "exclusiveMinimum": 0 }
            ],
            "items": false,
            "minItems": 2,
            "maxItems": 2
          }
        }
      }
    },
    "boundaries": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["kind", "label", "wraps"],
        "properties": {
          "kind": { "enum": ["region", "security-group"] },
          "label": { "type": "string", "minLength": 1 },
          "wraps": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "common.schema.json#/$defs/id" }
          },
          "pad": { "type": "number", "minimum": 0 }
        }
      }
    },
    "connections": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["from", "to"],
        "properties": {
          "id": { "$ref": "common.schema.json#/$defs/id" },
          "from": { "$ref": "common.schema.json#/$defs/id" },
          "to": { "$ref": "common.schema.json#/$defs/id" },
          "label": { "type": "string" },
          "variant": { "$ref": "common.schema.json#/$defs/variant" },
          "fromSide": { "$ref": "common.schema.json#/$defs/side" },
          "toSide": { "$ref": "common.schema.json#/$defs/side" },
          "route": { "enum": ["auto", "straight", "orthogonal-h", "orthogonal-v"] },
          "via": {
            "type": "array",
            "items": { "$ref": "common.schema.json#/$defs/point" }
          },
          "labelAt": { "$ref": "common.schema.json#/$defs/point" },
          "labelDx": { "type": "number" },
          "labelDy": { "type": "number" },
          "labelSegment": { "type": "integer", "minimum": 0 },
          "width": { "$ref": "common.schema.json#/$defs/relationshipWidth" }
        }
      }
    },
    "cards": { "$ref": "common.schema.json#/$defs/cards" }
  }
}
read: /tmp/pi-github-repos/runtime-rSvkCw/537a416f6aafeb5b762ca...
bash: cd /home/fakoli/code/stratus && git status --short && fin...
read: /home/fakoli/code/stratus/diagrams/eks-ipv6.architecture....
read: /home/fakoli/code/stratus/diagrams/vpc-lattice.architectu...
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, renderDefinitions, renderSemanticSigil, textUnits } from '../shared/utils.mjs';
import { animateAttr, focusEdgeAttrs, focusNodeAttrs, focusNodeTitle, loadDiagramWithBrandMarks, writeDiagram, svgAccessibleText, svgRootAttrs } from '../shared/cli.mjs';
import { componentBox, boundaryBox, connectionPath } from '../shared/layout-report.mjs';
import { throwDiagnosticProblems } from '../shared/diagnostics.mjs';
import { legendFootprint, relationshipLegendObstacles, resolveLegend, renderLegend as renderResolvedLegend } from '../shared/legend.mjs';
import { availableNodeTextWidth, fittedNodeFontSize, minimumNodeTextWidth } from '../shared/text-fit.mjs';
import { brandLabelFitWidth, brandMetadataFor, brandTopRailProblem, renderBrandMark } from '../shared/brand-marks.mjs';
import { minimumReadableSourceTextPx } from '../shared/desktop-readability.mjs';
import { translateMessage as i18nText } from '../shared/i18n.mjs';
import { gridLayout, resolveComponentPos, validateGridPlacement } from './grid.mjs';
import {
  asArray,
  isFinitePoint,
  rectsOverlap,
  segmentIntersectsRect,
  cleanEndpointSideProblems,
  cleanFlowProblems,
  cleanCrossingProblems,
  cleanAmbiguousCorridorProblems,
  cleanBorderRunProblems,
  cleanRouteRhythmProblems,
  cleanLabelRouteClearanceProblems,
  suggestLabelObstacleFix,
  suggestComponentSeparation,
  anchor,
  automaticPortSpread,
  automaticPortRhythmBridge,
  defaultFromSide,
  defaultToSide,
  chosenSide,
  routeHonorsEndpointSides,
  normalizeRoutePoints,
  polylinePath,
  routePointsValue,
  roundedPath,
  labelPoint,
  componentFill,
  componentText,
  arrowClassMap,
  variantAccent,
} from '../shared/geometry.mjs';
const componentTextFit = {
  sublabelPreferred: 9,
  sublabelMinimum: 6,
  tagPreferred: 7,
  tagMinimum: 6,
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const layoutJsonMode = process.argv.includes('--layout-json');
const cliArgs = process.argv.filter((arg) => arg !== '--layout-json');
const { diagram: arch, template, outPath, sourceEvidence } = await loadDiagramWithBrandMarks({
  rendererDir: __dirname,
  diagramType: 'architecture',
  defaultExample: 'web-app.architecture.json',
  argv: cliArgs,
});
const grid = gridLayout(arch);
const layout = {
  defaultW: 120,
  defaultH: 60,
  margin: 40,
  // Boundary padding — the 30/50 rule that was a hand-arithmetic footgun
  // (CHANGELOG v2.2.1): 30px on top/left/right, plus 20px extra at the bottom.
  boundaryPad: 30,
  boundaryExtraBottom: 20,
  boundaryLabelBaseline: 18,
  boundaryLabelClearance: 4,
  boundaryLabelFontPreferred: 9,
  boundaryLabelFontMinimum: 6,
  boundaryLabelMaskHeight: 16,
  boundaryLabelRailGap: 2,
  boundaryLabelFrameInset: 4,
  legendH: 28,
};
const LEGEND_CATALOG = [
  'frontend',
  'backend',
  'database',
  'cloud',
  'security',
  'messagebus',
  'external',
].map((kind) => ({ kind, label: i18nText(arch.meta.locale, `legend.architecture.${kind}`) }));
// ---- Measure components from free coordinates --------------------------------
function measureComponent(c) {
  const [x, y] = resolveComponentPos(c, grid);
  const [w, h] = Array.isArray(c.size) ? c.size : [layout.defaultW, layout.defaultH];
  return { ...c, x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2 };
}
const components = new Map(asArray(arch.components).map((c) => [c.id, measureComponent(c)]));
const enforcesBoundaryTitleComposition = Boolean(arch.meta?.quality_profile);
const componentSteps = new Map();
for (const [index, conn] of asArray(arch.connections).entries()) {
  if (!componentSteps.has(conn.from)) componentSteps.set(conn.from, index);
  if (!componentSteps.has(conn.to)) componentSteps.set(conn.to, index + 1);
}
for (const [index, c] of asArray(arch.components).entries()) {
  if (!componentSteps.has(c.id)) componentSteps.set(c.id, index);
}
// ---- Boundaries computed from the `wraps` id list ---------------------------
function boundaryRect(boundary) {
  const members = asArray(boundary.wraps).map((id) => components.get(id)).filter(Boolean);
  if (!members.length) return null;
  const minX = Math.min(...members.map((m) => m.x));
  const minY = Math.min(...members.map((m) => m.y));
  const maxX = Math.max(...members.map((m) => m.x + m.width));
  const maxY = Math.max(...members.map((m) => m.y + m.height));
  const pad = boundary.pad ?? layout.boundaryPad;
  const topPad = Math.max(
    pad,
    layout.boundaryLabelBaseline + layout.boundaryLabelClearance,
  );
  return {
    ...boundary,
    x: minX - pad,
    y: minY - topPad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + topPad + layout.boundaryExtraBottom,
    memberTop: minY,
  };
}
function rectContains(outer, inner) {
  const epsilon = 1e-9;
  return outer.x <= inner.x + epsilon
    && outer.y <= inner.y + epsilon
    && outer.x + outer.width + epsilon >= inner.x + inner.width
    && outer.y + outer.height + epsilon >= inner.y + inner.height;
}
function boundaryLabelWidth(label, fontSize) {
  return Math.max(30, textUnits(label) * fontSize * 0.6 + 10);
}
const architectureLegendEntries = resolveLegend(
  arch.meta?.legend,
  LEGEND_CATALOG,
  new Set([...components.values()].map((component) => component.type)),
);
function autoViewBoxFor(candidateBoundaries) {
  const maxX = Math.max(
    0,
    ...[...components.values()].map((component) => component.x + component.width),
    ...candidateBoundaries.map((boundary) => boundary.x + boundary.width),
  );
  const maxY = Math.max(
    0,
    ...[...components.values()].map((component) => component.y + component.height),
    ...candidateBoundaries.map((boundary) => boundary.y + boundary.height),
  );
  let width = Math.ceil(maxX + layout.margin);
  let footprint = legendFootprint(architectureLegendEntries, {
    width: Math.max(1, width - layout.margin * 2),
  });
  if (footprint.minWidth > width - layout.margin * 2) {
    width = Math.ceil(footprint.minWidth + layout.margin * 2);
    footprint = legendFootprint(architectureLegendEntries, {
      width: width - layout.margin * 2,
    });
  }
  return [
    width,
    Math.ceil(maxY + layout.margin + layout.legendH + footprint.extraHeight),
  ];
}
function resolvedViewBoxWidth(candidateBoundaries) {
  if (Array.isArray(arch.meta?.viewBox) && Number.isFinite(arch.meta.viewBox[0])) {
    return arch.meta.viewBox[0];
  }
  return autoViewBoxFor(candidateBoundaries)[0];
}
function expandBoundaryForReadableTitle(boundary, minimumFontSize) {
  if (!enforcesBoundaryTitleComposition) return boundary;
  const requiredWidth = boundaryLabelWidth(boundary.label, minimumFontSize)
    + layout.boundaryLabelFrameInset * 2;
  const extra = Math.max(0, requiredWidth - boundary.width);
  if (!extra) return boundary;
  return {
    ...boundary,
    x: boundary.x - extra / 2,
    width: boundary.width + extra,
  };
}
function measureBoundaryTitle(boundary, minimumFontSize) {
  const availableWidth = Math.max(0, boundary.width - layout.boundaryLabelFrameInset * 2);
  const units = textUnits(boundary.label);
  const fitted = units > 0
    ? (availableWidth - 10) / (units * 0.6)
    : layout.boundaryLabelFontPreferred;
  const preferredFontSize = Math.max(layout.boundaryLabelFontPreferred, minimumFontSize);
  const fontSize = Math.max(
    minimumFontSize,
    Math.min(preferredFontSize, fitted),
  );
  const desiredWidth = boundaryLabelWidth(boundary.label, fontSize);
  const height = Math.max(layout.boundaryLabelMaskHeight, Math.ceil(fontSize + 7));
  return {
    x: boundary.x + layout.boundaryLabelFrameInset,
    y: boundary.memberTop
      - layout.boundaryLabelClearance
      - height,
    width: Math.min(availableWidth, desiredWidth),
    height,
    fontSize,
    minimumFontSize,
    baselineOffset: fontSize + 4,
[859 more lines in file. Use offset=221 to continue.]
?? .pi-subagents/artifacts/557dc006-bbb1-42ec-b2dd-aa78e4db7dd9_reviewer_input.md
?? .pi-subagents/artifacts/557dc006-bbb1-42ec-b2dd-aa78e4db7dd9_reviewer_transcript.jsonl
diagrams/eks-ipv6.architecture.json
diagrams/eks-ipv6-rendered.html
diagrams/evidence-eks-ipv6.png
diagrams/evidence-firewalls-centralized.png
diagrams/evidence-firewalls-distributed.png
diagrams/evidence-vpc-lattice.png
diagrams/firewalls-centralized.architecture.json
diagrams/firewalls-centralized-rendered.html
diagrams/firewalls-distributed.architecture.json
diagrams/firewalls-distributed-rendered.html
diagrams/vpc-lattice.architecture.json
diagrams/vpc-lattice-rendered.html
tests/run-tests.mjs
{
  "name": "stratus",
  "version": "0.1.0",
  "description": "Cloud/network diagram engine — typed JSON spec → deterministic validation → reference-grade standalone HTML/SVG for AWS/GCP/Azure",
  "type": "module",
  "license": "MIT",
  "bin": {
    "stratus": "bin/stratus.mjs"
  },
  "scripts": {
    "test": "node tests/run-tests.mjs",
    "typecheck": "tsc --noEmit",
    "validate": "node bin/stratus.mjs validate",
    "render": "node bin/stratus.mjs render",
    "doctor": "node bin/stratus.mjs doctor",
    "catalog": "node bin/stratus.mjs catalog",
    "network-check": "node bin/stratus.mjs network-check"
  },
  "engines": {
    "node": ">=20"
  }
}
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "layout": { "mode": "grid", "cols": 4 },
  "meta": {
    "title": "EKS IPv6 Networking",
    "output": "eks-ipv6-rendered.html",
    "quality_profile": "showcase"
  },
  "components": [
    { "id": "users", "type": "external", "label": "Users", "sublabel": "IPv4 + IPv6", "row": 0, "col": 0 },
    { "id": "igw", "type": "cloud", "label": "Internet Gateway", "row": 0, "col": 1 },
    { "id": "alb", "type": "cloud", "label": "ALB", "sublabel": "dual-stack :443", "row": 0, "col": 2 },
    { "id": "nodes", "type": "backend", "label": "Worker Nodes", "sublabel": "pods: IPv6 /64", "row": 0, "col": 3, "tag": "IPv6" },
    { "id": "cp", "type": "cloud", "label": "EKS Control Plane", "sublabel": "AWS managed", "row": 1, "col": 2 },
    { "id": "nat64", "type": "cloud", "label": "NAT64 + DNS64", "sublabel": "public subnet", "row": 2, "col": 1 },
    { "id": "eigw", "type": "cloud", "label": "Egress-Only IGW", "sublabel": "IPv6 egress", "row": 2, "col": 2 }
  ],
  "boundaries": [
    { "kind": "region", "label": "AWS Region: us-west-2", "wraps": ["igw", "alb", "nodes", "cp", "nat64", "eigw"] },
    { "kind": "region", "label": "Public subnets — dual-stack", "wraps": ["alb", "nat64"] },
    { "kind": "region", "label": "Private subnets — dual-stack /64", "wraps": ["nodes", "cp"] }
  ],
  "connections": [
    { "id": "users-to-igw", "from": "users", "to": "igw", "label": "HTTPS", "variant": "emphasis" },
    { "id": "igw-to-alb", "from": "igw", "to": "alb", "label": "ingress" },
    { "id": "alb-to-nodes", "from": "alb", "to": "nodes", "label": "IPv6", "variant": "emphasis" },
    { "id": "nodes-to-cp", "from": "nodes", "to": "cp", "label": "API :443", "variant": "security" },
    { "id": "nodes-to-eigw", "from": "nodes", "to": "eigw", "label": "IPv6 egress", "fromSide": "bottom", "toSide": "top", "via": [[580, 266], [420, 266]] },
    { "id": "nodes-to-nat64", "from": "nodes", "to": "nat64", "label": "IPv4-only dest", "fromSide": "bottom", "toSide": "top" },
    { "id": "nat64-to-igw", "from": "nat64", "to": "igw", "label": "IPv4", "variant": "dashed", "labelDx": -22 }
  ],
  "cards": [
    { "dot": "cyan", "title": "Ingress", "items": ["Dual-stack ALB terminates IPv4 and IPv6", "Requests reach pods over IPv6"] },
    { "dot": "emerald", "title": "Pod networking", "items": ["Each subnet gets a /64 from the VPC /56", "Pods receive IPv6 addresses — no NAT pod-to-pod", "VPC CNI assigns IPv6 via the node's prefix delegation"] },
    { "dot": "rose", "title": "Egress", "items": ["IPv6 destinations leave via the egress-only IGW", "IPv4-only destinations translate via NAT64 + DNS64"] }
  ]
}
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "layout": { "mode": "grid", "cols": 4, "gapX": 100 },
  "meta": {
    "title": "VPC Lattice Service Network",
    "output": "vpc-lattice-rendered.html",
    "quality_profile": "showcase"
  },
  "components": [
    { "id": "clients", "type": "external", "label": "Clients", "sublabel": "Client VPC", "row": 1, "col": 0 },
    { "id": "lattice", "type": "cloud", "label": "VPC Lattice", "sublabel": "service network", "row": 1, "col": 1, "tag": "SN-1" },
    { "id": "svc-a", "type": "backend", "label": "Service A", "sublabel": "EC2 ASG", "row": 0, "col": 2 },
    { "id": "svc-b", "type": "backend", "label": "Service B", "sublabel": "EKS pods", "row": 1, "col": 2 },
    { "id": "svc-c", "type": "backend", "label": "Service C", "sublabel": "Lambda", "row": 2, "col": 2 },
    { "id": "authz", "type": "security", "label": "IAM Auth", "sublabel": "SigV4 + auth policy", "row": 2, "col": 1 }
  ],
  "boundaries": [
    { "kind": "region", "label": "AWS Region: us-east-1", "wraps": ["lattice", "svc-a", "svc-b", "svc-c", "authz"] },
    { "kind": "region", "label": "Client VPC", "wraps": ["clients"] },
    { "kind": "region", "label": "Service VPC A", "wraps": ["svc-a"] },
    { "kind": "region", "label": "Service VPC B", "wraps": ["svc-b"] }
  ],
  "connections": [
    { "id": "clients-to-sn", "from": "clients", "to": "lattice", "label": "SigV4 request", "variant": "emphasis" },
    { "id": "sn-to-a", "from": "lattice", "to": "svc-a" },
    { "id": "sn-to-b", "from": "lattice", "to": "svc-b" },
    { "id": "sn-to-c", "from": "lattice", "to": "svc-c", "label": "invoke" },
    { "id": "auth-attach", "from": "authz", "to": "lattice", "label": "auth policy", "variant": "security", "fromSide": "top", "toSide": "bottom" }
  ],
  "cards": [
    { "dot": "cyan", "title": "Service network", "items": ["One service network connects clients and services across VPCs", "No VPC peering, no overlapping-CIDR conflicts"] },
    { "dot": "emerald", "title": "Services", "items": ["EC2, EKS, and Lambda targets behind HTTPS listeners", "Lambda targets need no VPC attachment", "Access logs flow to CloudWatch"] },
    { "dot": "rose", "title": "Access control", "items": ["IAM SigV4-signed requests at the service network", "Auth policies attached per service network"] }
  ]
}
read: /home/fakoli/code/stratus/diagrams/firewalls-centralized....
read: /home/fakoli/code/stratus/diagrams/firewalls-distributed....
read: /home/fakoli/code/stratus/tests/run-tests.mjs
read: /tmp/pi-github-repos/runtime-rSvkCw/537a416f6aafeb5b762ca...
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "layout": { "mode": "grid", "cols": 4, "gapX": 70 },
  "meta": {
    "title": "Centralized Network Firewall Inspection",
    "output": "firewalls-centralized-rendered.html",
    "quality_profile": "showcase"
  },
  "components": [
    { "id": "internet", "type": "external", "label": "Internet", "row": 0, "col": 3 },
    { "id": "spoke-a", "type": "backend", "label": "Spoke VPC A", "sublabel": "workload", "row": 1, "col": 0 },
    { "id": "spoke-b", "type": "backend", "label": "Spoke VPC B", "sublabel": "workload", "row": 2, "col": 0 },
    { "id": "tgw", "type": "cloud", "label": "Transit Gateway", "sublabel": "hub", "row": 1, "col": 1 },
    { "id": "insp", "type": "security", "label": "Network Firewall", "sublabel": "inspection VPC", "row": 1, "col": 2, "tag": "centralized" },
    { "id": "igw-c", "type": "cloud", "label": "IGW", "row": 1, "col": 3 }
  ],
  "boundaries": [
    { "kind": "region", "label": "AWS Region", "wraps": ["spoke-a", "spoke-b", "tgw", "insp", "igw-c"] },
    { "kind": "region", "label": "Inspection VPC", "wraps": ["insp", "igw-c"] },
    { "kind": "region", "label": "Spoke VPC A", "wraps": ["spoke-a"] },
    { "kind": "region", "label": "Spoke VPC B", "wraps": ["spoke-b"] }
  ],
  "connections": [
    { "id": "a-to-tgw", "from": "spoke-a", "to": "tgw", "label": "egress" },
    { "id": "b-to-tgw", "from": "spoke-b", "to": "tgw" },
    { "id": "tgw-to-insp", "from": "tgw", "to": "insp", "label": "inspect", "variant": "emphasis" },
    { "id": "insp-to-igw", "from": "insp", "to": "igw-c", "label": "filtered" },
    { "id": "igw-to-inet", "from": "igw-c", "to": "internet", "label": "filtered egress", "variant": "emphasis" }
  ],
  "cards": [
    { "dot": "cyan", "title": "Centralized inspection", "items": ["One inspection VPC inspects all spoke traffic via Transit Gateway", "TGW route tables steer 0.0.0.0/0 to the firewall endpoints", "Single policy surface to manage and audit"] },
    { "dot": "rose", "title": "Trade-offs", "items": ["Consistent rules across all spokes", "TGW data-processing cost on every inspected flow", "Inspection VPC is a shared failure domain"] }
  ]
}
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "layout": { "mode": "grid", "cols": 3, "gapX": 70 },
  "meta": {
    "title": "Distributed Network Firewall",
    "output": "firewalls-distributed-rendered.html",
    "quality_profile": "showcase"
  },
  "components": [
    { "id": "internet", "type": "external", "label": "Internet", "row": 0, "col": 2 },
    { "id": "dist", "type": "backend", "label": "Spoke VPC", "sublabel": "workload", "row": 1, "col": 0 },
    { "id": "fw-d", "type": "security", "label": "Network Firewall", "sublabel": "per-VPC endpoint", "row": 1, "col": 1 },
    { "id": "igw-d", "type": "cloud", "label": "IGW", "row": 1, "col": 2 }
  ],
  "boundaries": [
    { "kind": "region", "label": "AWS Region", "wraps": ["dist", "fw-d", "igw-d"] },
    { "kind": "region", "label": "Spoke VPC (distributed)", "wraps": ["dist", "fw-d", "igw-d"] }
  ],
  "connections": [
    { "id": "dist-to-fw", "from": "dist", "to": "fw-d", "label": "egress" },
    { "id": "fw-to-igw", "from": "fw-d", "to": "igw-d", "label": "filtered" },
    { "id": "igw-to-inet", "from": "igw-d", "to": "internet", "label": "filtered egress", "variant": "emphasis" }
  ],
  "cards": [
    { "dot": "emerald", "title": "Distributed", "items": ["Each VPC carries its own Network Firewall endpoint", "No Transit Gateway hop for egress — lower latency", "Policy repeats per VPC"] },
    { "dot": "rose", "title": "Trade-offs", "items": ["More policy surfaces to audit as VPC count grows", "No shared east-west inspection point"] }
  ]
}
// Stratus offline test runner (T001 creates the suite; later tasks extend it).
// Deterministic, offline, no network, no credentials.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();
if (testFiles.length === 0) {
  console.log("no test files yet — suite lands with T001");
  process.exit(0);
}
let failed = 0;
for (const f of testFiles) {
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" });
  if (r.status !== 0) failed += 1;
}
process.exit(failed === 0 ? 0 : 1);
    availableWidth,
    minimumWidth: boundaryLabelWidth(boundary.label, minimumFontSize),
  };
}
function horizontalOverlap(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x;
}
function layoutBoundaryTitles(rawBoundaries, minimumFontSize) {
  const placedTitles = [];
  const measured = new Map();
  const ordered = rawBoundaries
    .map((boundary, index) => ({ boundary, index }))
    .sort((left, right) => {
      const areaDelta = left.boundary.width * left.boundary.height
        - right.boundary.width * right.boundary.height;
      return areaDelta || left.index - right.index;
    });
  for (const entry of ordered) {
    const { index } = entry;
    const boundary = expandBoundaryForReadableTitle(entry.boundary, minimumFontSize);
    const title = measureBoundaryTitle(boundary, minimumFontSize);
    let guard = 0;
    while (guard < rawBoundaries.length + components.size + 1) {
      guard += 1;
      const blockers = [
        ...placedTitles,
        ...components.values(),
      ].filter((candidate) => horizontalOverlap(title, candidate) && rectsOverlap(title, candidate));
      if (!blockers.length) break;
      title.y = Math.min(
        ...blockers.map((blocker) => blocker.y - layout.boundaryLabelRailGap - title.height),
      );
    }
    placedTitles.push(title);
    measured.set(index, { boundary, title });
  }
  return rawBoundaries.map((_boundary, index) => {
    const { boundary, title } = measured.get(index);
    const bottom = boundary.y + boundary.height;
    // Profile-less schema-v1 inputs keep their legacy boundary geometry. A
    // quality profile opts into the stricter title-composition contract and
    // may expand the frame to contain an adapted title rail.
    const y = enforcesBoundaryTitleComposition
      ? Math.min(boundary.y, title.y - layout.boundaryLabelFrameInset)
      : boundary.y;
    return {
      ...boundary,
      y,
      height: bottom - y,
      title,
    };
  });
}
const rawBoundaries = asArray(arch.boundaries).map(boundaryRect).filter(Boolean);
function resolveBoundaryTitles() {
  if (!enforcesBoundaryTitleComposition || rawBoundaries.length === 0) {
    return {
      boundaries: layoutBoundaryTitles(rawBoundaries, layout.boundaryLabelFontMinimum),
      readabilityProblem: null,
    };
  }
  const maximumIterations = 32;
  let candidateBoundaries = rawBoundaries;
  for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
    const budgetViewBoxWidth = resolvedViewBoxWidth(candidateBoundaries);
    const minimumFontSize = Math.max(
      layout.boundaryLabelFontMinimum,
      minimumReadableSourceTextPx(budgetViewBoxWidth) + 1e-6,
    );
    const nextBoundaries = layoutBoundaryTitles(rawBoundaries, minimumFontSize);
    const finalViewBoxWidth = resolvedViewBoxWidth(nextBoundaries);
    const finalMinimumFontSize = Math.max(
      layout.boundaryLabelFontMinimum,
      minimumReadableSourceTextPx(finalViewBoxWidth),
    );
    if (minimumFontSize >= finalMinimumFontSize) {
      return { boundaries: nextBoundaries, readabilityProblem: null };
    }
    candidateBoundaries = nextBoundaries;
  }
  const finalViewBoxWidth = resolvedViewBoxWidth(candidateBoundaries);
  return {
    boundaries: candidateBoundaries,
    readabilityProblem: `[composition/desktop-readability] Boundary title layout did not converge after ${maximumIterations} iterations for the final ${finalViewBoxWidth}px viewBox — shorten boundary labels, provide a wider authored viewBox, or move wrapped components closer to the left edge.`,
  };
}
const resolvedBoundaryTitles = resolveBoundaryTitles();
const boundaries = resolvedBoundaryTitles.boundaries;
const compositionFrames = boundaries.map((boundary, index) => ({
  ...boundary,
  id: boundary.id || index,
  kind: boundary.kind || 'boundary',
  radius: boundary.kind === 'security-group' ? 8 : 12,
}));
function componentContext(component) {
  const scopes = boundaries
    .filter((boundary) => asArray(boundary.wraps).includes(component.id))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))
    .map((boundary) => boundary.label);
  return scopes.length ? scopes.join(' › ') : i18nText(arch.meta.locale, 'node.context.architecture');
}
// ---- Auto viewBox: fit all geometry + the measured resolved legend ----------
const viewBox = arch.meta?.viewBox || autoViewBoxFor(boundaries);
const legendY = () => viewBox[1] - 16;
// ---- Validation: mechanical correctness, never layout taste -----------------
function validateArchitecture() {
  const problems = [];
  if (resolvedBoundaryTitles.readabilityProblem) {
    problems.push(resolvedBoundaryTitles.readabilityProblem);
  }
  const requiresNestedBoundaryMembership = arch.meta?.engineering_profile === 'deployment-ownership';
  if (components.size !== asArray(arch.components).length) problems.push('Component ids must be unique.');
  if (grid) {
    validateGridPlacement(arch, grid, problems);
  } else {
    for (const c of asArray(arch.components)) {
      if (!Array.isArray(c.pos) || c.pos.length !== 2) {
        problems.push(`Component "${c.id}" must include pos [x, y] when layout.mode is omitted (free placement).`);
      }
    }
  }
  for (const c of components.values()) {
    if (!isFinitePoint(c.x, c.y, c.width, c.height)) {
      problems.push(`Component "${c.id}" has non-finite pos/size — pos and size must be [number, number].`);
      continue;
    }
    if (c.width <= 0 || c.height <= 0) {
      problems.push(`Component "${c.id}" has invalid size ${c.width}x${c.height} — width and height must be greater than 0.`);
      continue;
    }
    if (c.x < 0 || c.y < 0 || c.x + c.width > viewBox[0] || c.y + c.height > viewBox[1]) {
      problems.push(`Component "${c.id}" falls outside the viewBox ${viewBox[0]}x${viewBox[1]} — adjust pos/size or set a larger meta.viewBox.`);
    }
    const estLabelW = textUnits(c.label) * 6.6;
    if (estLabelW > c.width + 8) {
      problems.push(`Label "${c.label}" (~${Math.round(estLabelW)}px) is wider than component "${c.id}" (${c.width}px) — shorten the label or widen size.`);
    }
    const brandRailProblem = brandTopRailProblem(c, c.width, 8, 'Component');
    if (brandRailProblem) problems.push(brandRailProblem);
    // sublabel and tag render as single unwrapped <text> elements; shrink-to-fit
    // handles the ordinary case, this rejects what it cannot rescue.
    const availableTextW = availableNodeTextWidth(c.width);
    for (const [field, value, minimum] of [
      ['Sublabel', c.sublabel, componentTextFit.sublabelMinimum],
      ['Tag', c.tag, componentTextFit.tagMinimum],
    ]) {
      if (!value) continue;
      const minimumW = minimumNodeTextWidth(value, minimum);
      if (minimumW > availableTextW) {
        problems.push(`${field} "${value}" needs ~${Math.ceil(minimumW)}px at the ${minimum}px legible minimum, but component "${c.id}" provides ${availableTextW}px — shorten the ${field.toLowerCase()} or widen size.`);
      }
    }
  }
  // Component overlap — the highest-traffic hand-placement failure mode.
  const list = [...components.values()];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (rectsOverlap(list[i], list[j], 8)) {
        problems.push(`Components "${list[i].id}" and "${list[j].id}" are less than 8px apart — move one or shrink its size.\n${suggestComponentSeparation(list[i], list[j], 8)}`);
      }
    }
  }
  // Boundaries: every wrapped id must exist; the computed box must stay in view.
  for (const boundary of asArray(arch.boundaries)) {
    for (const id of asArray(boundary.wraps)) {
      if (!components.has(id)) problems.push(`Boundary "${boundary.label}" wraps unknown component "${id}".`);
    }
  }
  const viewBoxRect = { x: 0, y: 0, width: viewBox[0], height: viewBox[1] };
  for (const boundary of boundaries) {
    if (!enforcesBoundaryTitleComposition) continue;
    if (boundary.title.minimumWidth > boundary.title.availableWidth) {
      problems.push(
        `Boundary label "${boundary.label}" needs ~${Math.ceil(boundary.title.minimumWidth)}px to fit at the `
        + `${Number(boundary.title.minimumFontSize.toFixed(2))}px desktop-readable source minimum, but its frame provides ${Math.floor(boundary.title.availableWidth)}px — `
        + 'shorten the boundary label, increase pad, or widen the wrapped component layout.',
      );
    }
    if (!rectContains(boundary, boundary.title)) {
      problems.push(
        `Boundary label "${boundary.label}" extends outside its final frame — shorten the label or increase boundary pad.`,
      );
    }
    if (!rectContains(viewBoxRect, boundary.title)) {
      problems.push(
        `Boundary label "${boundary.label}" extends outside the viewBox — move wrapped components away from the canvas edge, shorten the label, or increase the viewBox.`,
      );
    }
    for (const component of components.values()) {
      if (!rectsOverlap(boundary.title, component)) continue;
      problems.push(
        `Boundary label "${boundary.label}" overlaps component "${component.id}" — move the component, increase boundary title space, or shorten the label.`,
      );
    }
  }
  for (let leftIndex = 0; leftIndex < boundaries.length; leftIndex += 1) {
    const left = boundaries[leftIndex];
    const leftMembers = new Set(asArray(left.wraps));
    for (let rightIndex = leftIndex + 1; rightIndex < boundaries.length; rightIndex += 1) {
      const right = boundaries[rightIndex];
      if (enforcesBoundaryTitleComposition && rectsOverlap(left.title, right.title)) {
        problems.push(
          `Boundary labels "${left.label}" and "${right.label}" overlap — shorten a label or increase boundary title space.`,
        );
      }
      // Ordinary architecture boundaries are sets, not an implied ownership
      // tree: orthogonal scopes such as runtime and compliance may share some
      // components while each contains others. The opt-in deployment profile
      // does promise hierarchical region/private-scope membership, so only it
      // receives the stricter membership-to-frame containment contract.
      if (!requiresNestedBoundaryMembership) continue;
      const rightMembers = new Set(asArray(right.wraps));
      const shared = [...leftMembers].filter((id) => rightMembers.has(id));
      const leftNested = [...leftMembers].every((id) => rightMembers.has(id));
      const rightNested = [...rightMembers].every((id) => leftMembers.has(id));
      if (shared.length && !leftNested && !rightNested) {
        const leftOnly = [...leftMembers].filter((id) => !rightMembers.has(id));
        const rightOnly = [...rightMembers].filter((id) => !leftMembers.has(id));
        problems.push(
          `Boundary "${left.label}" crosses boundary "${right.label}" because their memberships partially overlap `
          + `(shared: ${shared.map((id) => `"${id}"`).join(', ')}; `
          + `only in "${left.label}": ${leftOnly.map((id) => `"${id}"`).join(', ')}; `
          + `only in "${right.label}": ${rightOnly.map((id) => `"${id}"`).join(', ')}) — `
          + 'keep one boundary fully nested by removing outside members, or split the boundary.',
        );
        continue;
      }
      if (!rectsOverlap(left, right)) continue;
      const leftContainsRight = rectContains(left, right);
      const rightContainsLeft = rectContains(right, left);
      if (!leftContainsRight && !rightContainsLeft) {
        problems.push(
          `Boundary "${left.label}" and boundary "${right.label}" final frames partially overlap — `
          + 'adjust wraps, pad, or component positions so the frames are disjoint or one fully contains the other.',
        );
        continue;
      }
      if (!shared.length) {
        problems.push(
          `Boundary "${left.label}" and boundary "${right.label}" final frames overlap even though their memberships are disjoint — `
          + 'adjust pad or component positions so the frames are disjoint, or make wraps express the intended nesting.',
        );
        continue;
      }
      const containmentMatchesMembership = (leftNested && rightContainsLeft)
        || (rightNested && leftContainsRight);
      if (!containmentMatchesMembership) {
        problems.push(
          `Boundary "${left.label}" and boundary "${right.label}" final frame containment contradicts their wraps membership — `
          + 'reduce the inner boundary pad, move its components, or correct wraps so geometry and nesting agree.',
        );
      }
    }
  }
  for (const b of boundaries) {
    if (b.x < 0 || b.y < 0 || b.x + b.width > viewBox[0] || b.y + b.height > viewBox[1]) {
      problems.push(`Boundary "${b.label}" extends outside the viewBox — its members sit too close to the canvas edge; add margin or enlarge meta.viewBox.`);
    }
  }
  for (const conn of asArray(arch.connections)) {
    if (!components.has(conn.from)) problems.push(`Connection "${conn.label || conn.from}" references unknown source "${conn.from}".`);
    if (!components.has(conn.to)) problems.push(`Connection "${conn.label || conn.to}" references unknown target "${conn.to}".`);
    if (components.has(conn.from) && components.has(conn.to)) {
      const routed = pathFor(conn);
      const [start, end] = [routed.points[0], routed.points[routed.points.length - 1]];
      const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (distance < 24) problems.push(`Connection "${conn.label || `${conn.from}->${conn.to}`}" is too short (${Math.round(distance)}px; minimum 24px) — place its components farther apart.`);
    }
  }
  problems.push(...cleanEndpointSideProblems({
    relations: arch.connections,
    endpointIds: new Set(components.keys()),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    fromSideFor: (conn) => connectionEndpointSide(conn, 'source'),
    toSideFor: (conn) => connectionEndpointSide(conn, 'target'),
    routeHint: 'keep automatic routing so the renderer can use a side-aware bridge, or set truthful fromSide/toSide with perpendicular via segments',
  }));
  problems.push(...cleanFlowProblems({
    relations: arch.connections,
    obstacles: components.values(),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    obstacleKind: 'component',
    routeHint: 'adjust fromSide/toSide, set route/via, or move the component'
  }));
  problems.push(...cleanCrossingProblems({
    relations: arch.connections,
    endpointIds: new Set(components.keys()),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    profile: arch.meta?.quality_profile,
    routeHint: 'adjust route/via or fromSide/toSide so the connections use separate corridors'
  }));
  problems.push(...cleanAmbiguousCorridorProblems({
    relations: arch.connections,
    endpointIds: new Set(components.keys()),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    profile: arch.meta?.quality_profile,
    routeHint: 'adjust route/via or fromSide/toSide so unrelated connections do not visually merge'
  }));
  problems.push(...cleanBorderRunProblems({
    relations: arch.connections,
    endpointIds: new Set(components.keys()),
    frames: compositionFrames,
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    profile: arch.meta?.quality_profile,
    routeHint: 'adjust route/via or fromSide/toSide so the connection crosses the boundary perpendicularly instead of following its border'
  }));
  problems.push(...cleanRouteRhythmProblems({
    relations: arch.connections,
    endpointIds: new Set(components.keys()),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    profile: arch.meta?.quality_profile,
    routeHint: 'move route/via points into a wider corridor or move the component so every turn has room to read'
  }));
  // Connection labels must not land on top of components.
  const labelRects = [];
  for (const [connectionIndex, conn] of asArray(arch.connections).entries()) {
    if (!conn.label || !components.has(conn.from) || !components.has(conn.to)) continue;
    const [lx, ly] = labelPoint(conn, pathFor(conn).points);
    const w = Math.max(30, textUnits(conn.label) * 4.8 + 10);
    labelRects.push({ relation: conn, relationIndex: connectionIndex, label: conn.label, x: lx - w / 2, y: ly - 10, width: w, height: 14, lx, ly });
  }
  for (const rect of labelRects) {
    for (const c of components.values()) {
      if (rectsOverlap(rect, c, -2)) {
        problems.push(`Label "${rect.label}" overlaps component "${c.id}" — adjust labelDx/labelDy/labelSegment or set labelAt.\n${suggestLabelObstacleFix(rect, rect.lx, rect.ly, c)}`);
      }
    }
    if (enforcesBoundaryTitleComposition) {
      for (const boundary of boundaries) {
        if (!rectsOverlap(boundary.title, rect)) continue;
        problems.push(
          `Boundary label "${boundary.label}" overlaps connection label "${rect.label}" — move the boundary title rail by adjusting wrapped component positions, or move the connection label with labelAt/labelDx/labelDy/labelSegment.`,
        );
      }
    }
  }
  problems.push(...cleanLabelRouteClearanceProblems({
    relations: arch.connections,
    labels: labelRects,
    endpointIds: new Set(components.keys()),
    pathFor,
    diagramType: 'architecture',
    relationCollection: 'connections',
    profile: arch.meta?.quality_profile,
  }));
  if (problems.length) {
    throwDiagnosticProblems('Architecture layout validation failed', problems, {
      subject: { diagramType: 'architecture' },
    });
  }
}
function buildLayoutReport() {
  const labels = [];
  for (const conn of asArray(arch.connections)) {
    if (!conn.label || !components.has(conn.from) || !components.has(conn.to)) continue;
    const [lx, ly] = labelPoint(conn, pathFor(conn).points);
    const w = Math.max(30, textUnits(conn.label) * 4.8 + 10);
    labels.push({
      text: conn.label,
      x: Math.round(lx - w / 2),
      y: Math.round(ly - 10),
      width: Math.round(w),
      height: 14,
      labelAt: [Math.round(lx), Math.round(ly)],
    });
  }
  return {
    ok: true,
    diagram_type: 'architecture',
    layout: grid ? { mode: 'grid', ...grid } : { mode: 'free' },
    viewBox,
    components: [...components.values()].map(componentBox),
    boundaries: boundaries.map(boundaryBox),
    connections: asArray(arch.connections)
      .filter((conn) => components.has(conn.from) && components.has(conn.to))
      .map((conn) => {
        const routed = pathFor(conn);
        const labelAt = conn.label ? labelPoint(conn, routed.points) : null;
        return connectionPath(conn, routed, labelAt);
      }),
    labels,
  };
}
// ---- Connection routing ------------------------------------------------------
function routeClearsComponents(conn, points, clearance = 2) {
[439 more lines in file. Use offset=641 to continue.]
read: /tmp/pi-github-repos/runtime-rSvkCw/537a416f6aafeb5b762ca...
bash: cd /home/fakoli/code/stratus && node tests/run-tests.mjs ...
read: /home/fakoli/code/stratus/tsconfig.json
  const endpointIds = new Set([conn.from, conn.to]);
  for (const component of components.values()) {
    if (endpointIds.has(component.id)) continue;
    for (let index = 0; index < points.length - 1; index += 1) {
      if (segmentIntersectsRect({ start: points[index], end: points[index + 1] }, component, clearance)) {
        return false;
      }
    }
  }
  return true;
}
function routeClearsEndpointComponents(points, from, to) {
  const lastSegment = points.length - 2;
  for (let index = 0; index <= lastSegment; index += 1) {
    const segment = { start: points[index], end: points[index + 1] };
    if (index > 0 && segmentIntersectsRect(segment, from)) return false;
    if (index < lastSegment && segmentIntersectsRect(segment, to)) return false;
  }
  return true;
}
const OUTWARD_SIDE_VECTOR = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
};
function outwardStub(point, side, distance = 24) {
  const [dx, dy] = OUTWARD_SIDE_VECTOR[side] || [0, 0];
  return [point[0] + dx * distance, point[1] + dy * distance];
}
function collinearBacktrack(a, b, c) {
  const first = [b[0] - a[0], b[1] - a[1]];
  const second = [c[0] - b[0], c[1] - b[1]];
  const cross = first[0] * second[1] - first[1] * second[0];
  const dot = first[0] * second[0] + first[1] * second[1];
  return Math.abs(cross) <= 0.0001 && dot < -0.0001;
}
function sideAwareBridgeCandidates(start, end, fromSide, toSide) {
  const startStub = outwardStub(start, fromSide);
  const endStub = outwardStub(end, toSide);
  const rawCandidates = [];
  const minimumBridge = 16;
  const verticalSides = new Set(['top', 'bottom']);
  const horizontalSides = new Set(['left', 'right']);
  // Port spreading can leave parallel-side anchors only a few pixels apart.
  // Route through a bounded outside channel so we keep both endpoint normals
  // without introducing a tiny, noisy connector between the two stubs.
  if (verticalSides.has(fromSide) && verticalSides.has(toSide)
      && Math.abs(start[0] - end[0]) < minimumBridge) {
    for (const channelX of [
      Math.max(start[0], end[0]) + minimumBridge,
      Math.min(start[0], end[0]) - minimumBridge,
    ]) {
      rawCandidates.push([
        startStub,
        [channelX, startStub[1]],
        [channelX, endStub[1]],
        endStub,
      ]);
    }
  }
  if (horizontalSides.has(fromSide) && horizontalSides.has(toSide)
      && Math.abs(start[1] - end[1]) < minimumBridge) {
    for (const channelY of [
      Math.max(start[1], end[1]) + minimumBridge,
      Math.min(start[1], end[1]) - minimumBridge,
    ]) {
      rawCandidates.push([
        startStub,
        [startStub[0], channelY],
        [endStub[0], channelY],
        endStub,
      ]);
    }
  }
  rawCandidates.push(
    [startStub, [endStub[0], startStub[1]], endStub],
    [startStub, [startStub[0], endStub[1]], endStub],
  );
  return rawCandidates.map((candidate) => normalizeRoutePoints([start, ...candidate, end]))
    .filter((points) => points.length >= 2)
    .filter((points) => !collinearBacktrack(points[0], points[1], points[2] || points[1]))
    .filter((points) => !collinearBacktrack(points.at(-3) || points.at(-2), points.at(-2), points.at(-1)))
    .filter((points) => routeHonorsEndpointSides(points, fromSide, toSide))
    .map((points) => points.slice(1, -1));
}
const AUTOMATIC_PORT_CORNER_GUTTER = 16;
const AUTOMATIC_PORT_ALIGNMENT_DELTA = 16;
function portHasCornerClearance(rect, side, point) {
  if (side === 'left' || side === 'right') {
    const inset = Math.min(AUTOMATIC_PORT_CORNER_GUTTER, rect.height / 2);
    return point[1] >= rect.y + inset && point[1] <= rect.y + rect.height - inset;
  }
  if (side === 'top' || side === 'bottom') {
    const inset = Math.min(AUTOMATIC_PORT_CORNER_GUTTER, rect.width / 2);
    return point[0] >= rect.x + inset && point[0] <= rect.x + rect.width - inset;
  }
  return false;
}
function alignFacingPorts(conn, from, to, start, end, fromSide, toSide, ports) {
  const hasExplicitGeometry = (
    conn.via
    || (conn.route && conn.route !== 'auto')
    || conn.channelX !== undefined
    || conn.channelY !== undefined
    || conn.labelAt
  );
  const horizontallyFacing = (
    (fromSide === 'right' && toSide === 'left')
    || (fromSide === 'left' && toSide === 'right')
  );
  const verticallyFacing = (
    (fromSide === 'bottom' && toSide === 'top')
    || (fromSide === 'top' && toSide === 'bottom')
  );
  if (hasExplicitGeometry || (!horizontallyFacing && !verticallyFacing)) return { start, end };
  const fromSpread = Boolean(ports?.from);
  const toSpread = Boolean(ports?.to);
  if (fromSpread && toSpread) return { start, end };
  const hasExplicitSides = (
    (conn.fromSide && conn.fromSide !== 'auto')
    || (conn.toSide && conn.toSide !== 'auto')
  );
  if (!fromSpread && !toSpread && hasExplicitSides) return { start, end };
  const alignmentDelta = horizontallyFacing
    ? Math.abs(start[1] - end[1])
    : Math.abs(start[0] - end[0]);
  if (alignmentDelta >= AUTOMATIC_PORT_ALIGNMENT_DELTA) return { start, end };
  // Keep the shared endpoint's distinct spread slot and move only the
  // relationship's unshared endpoint onto that axis. With no spread endpoint,
  // retain the existing least-movement choice between the two facing sides.
  // If both endpoints are shared, preserve the outside bridge so no competing
  // port is silently collapsed.
  const alignEndToStart = horizontallyFacing
    ? { start, end: [end[0], start[1]] }
    : { start, end: [start[0], end[1]] };
  const alignStartToEnd = horizontallyFacing
    ? { start: [start[0], end[1]], end }
    : { start: [end[0], start[1]], end };
  const candidates = fromSpread
    ? [alignEndToStart]
    : toSpread
      ? [alignStartToEnd]
      : [alignEndToStart, alignStartToEnd];
  for (const candidate of candidates) {
    const points = [candidate.start, candidate.end];
    if (portHasCornerClearance(from, fromSide, candidate.start)
        && portHasCornerClearance(to, toSide, candidate.end)
        && routeHonorsEndpointSides(points, fromSide, toSide)
        && routeClearsEndpointComponents(points, from, to)
        && routeClearsComponents(conn, points)) {
      return candidate;
    }
  }
  return { start, end };
}
function routeVia(conn, from, to, start, end, fromSide, toSide) {
  if (conn.via) return conn.via;
  switch (conn.route || 'auto') {
    case 'straight':
      return [];
    case 'orthogonal-h': {
      const midX = (start[0] + end[0]) / 2;
      return [[midX, start[1]], [midX, end[1]]];
    }
    case 'orthogonal-v': {
      const midY = (start[1] + end[1]) / 2;
      return [[start[0], midY], [end[0], midY]];
    }
    case 'auto':
    default: {
      // Direct line unless the anchors are clearly orthogonal-friendly.
      const deltaX = Math.abs(start[0] - end[0]);
      const deltaY = Math.abs(start[1] - end[1]);
      if ((deltaX < 4 || deltaY < 4) && routeHonorsEndpointSides([start, end], fromSide, toSide)) return [];
      const rhythmBridge = automaticPortRhythmBridge(start, end, fromSide, toSide, {
        accept: (points) => (
          routeClearsEndpointComponents(points, from, to)
          && routeClearsComponents(conn, points)
        ),
      });
      if (rhythmBridge) return rhythmBridge.slice(1, -1);
      // Automatic port spreading can leave otherwise aligned endpoints only a
      // few pixels apart. A midpoint route would split that tiny difference
      // into two unreadable endpoint stubs, so take a bounded outside channel
      // when both anchors sit on parallel component sides.
      const minimumStub = 8;
      const fromVerticalSide = start[1] === from.y || start[1] === from.y + from.height;
      const toVerticalSide = end[1] === to.y || end[1] === to.y + to.height;
      if (fromVerticalSide && toVerticalSide && deltaX < minimumStub * 2) {
        const outsideChannels = [
          Math.max(start[0], end[0]) + minimumStub * 2,
          Math.min(start[0], end[0]) - minimumStub * 2,
        ];
        for (const channelX of outsideChannels) {
          const candidate = [[channelX, start[1]], [channelX, end[1]]];
          const points = [start, ...candidate, end];
          if (routeHonorsEndpointSides(points, fromSide, toSide) && routeClearsComponents(conn, points)) return candidate;
        }
      }
      const fromHorizontalSide = start[0] === from.x || start[0] === from.x + from.width;
      const toHorizontalSide = end[0] === to.x || end[0] === to.x + to.width;
      if (fromHorizontalSide && toHorizontalSide && deltaY < minimumStub * 2) {
        const outsideChannels = [
          Math.max(start[1], end[1]) + minimumStub * 2,
          Math.min(start[1], end[1]) - minimumStub * 2,
        ];
        for (const channelY of outsideChannels) {
          const candidate = [[start[0], channelY], [end[0], channelY]];
          const points = [start, ...candidate, end];
          if (routeHonorsEndpointSides(points, fromSide, toSide) && routeClearsComponents(conn, points)) return candidate;
        }
      }
      const midX = (start[0] + end[0]) / 2;
      const horizontalFirst = [[midX, start[1]], [midX, end[1]]];
      const midY = (start[1] + end[1]) / 2;
      const verticalFirst = [[start[0], midY], [end[0], midY]];
      const candidates = [horizontalFirst, verticalFirst];
      const sideSafe = candidates.filter((candidate) => (
        routeHonorsEndpointSides([start, ...candidate, end], fromSide, toSide)
      ));
      const sideAware = sideAwareBridgeCandidates(start, end, fromSide, toSide);
      const nearParallelPorts = (
        ((fromSide === 'top' || fromSide === 'bottom')
          && (toSide === 'top' || toSide === 'bottom')
          && deltaX < minimumStub * 2)
        || ((fromSide === 'left' || fromSide === 'right')
          && (toSide === 'left' || toSide === 'right')
          && deltaY < minimumStub * 2)
      );
      const ordered = [
        ...(nearParallelPorts ? sideAware : sideSafe),
        ...(nearParallelPorts ? sideSafe : sideAware),
        ...candidates.filter((candidate) => !sideSafe.includes(candidate)),
      ];
      for (const candidate of ordered) {
        const points = [start, ...candidate, end];
        if (routeClearsEndpointComponents(points, from, to) && routeClearsComponents(conn, points)) return candidate;
      }
      // Both bounded doglegs are blocked. Keep the best endpoint-safe route
      // when one exists so the universal Clean Flow gate reports the actual
      // obstacle; otherwise preserve the historical deterministic fallback
      // and let the endpoint-direction gate explain the side mismatch.
      return sideSafe[0] || sideAware[0] || horizontalFirst;
    }
  }
}
const pathCache = new Map();
const automaticPorts = automaticPortSpread(arch.connections, components);
function connectionSides(conn) {
  const from = components.get(conn.from);
  const to = components.get(conn.to);
  return {
    fromSide: chosenSide(conn.fromSide, defaultFromSide(from, to)),
    toSide: chosenSide(conn.toSide, defaultToSide(from, to)),
  };
}
function connectionEndpointSide(conn, endpoint) {
  const field = endpoint === 'source' ? 'fromSide' : 'toSide';
  if (conn[field] && conn[field] !== 'auto') return conn[field];
  return connectionSides(conn)[field];
}
function pathFor(conn) {
  if (pathCache.has(conn)) return pathCache.get(conn);
  const from = components.get(conn.from);
  const to = components.get(conn.to);
  const ports = automaticPorts.get(conn);
  const { fromSide, toSide } = connectionSides(conn);
  const baseStart = ports?.from || anchor(from, fromSide);
  const baseEnd = ports?.to || anchor(to, toSide);
  const { start, end } = alignFacingPorts(
    conn,
    from,
    to,
    baseStart,
    baseEnd,
    fromSide,
    toSide,
    ports,
  );
  const points = [start, ...routeVia(conn, from, to, start, end, fromSide, toSide), end];
  const routed = { d: roundedPath(points, 8), points };
  pathCache.set(conn, routed);
  return routed;
}
// ---- Rendering ---------------------------------------------------------------
function renderBoundaryFrame(b, index) {
  const cls = b.kind === 'security-group' ? 'c-security-group' : 'c-region';
  const rx = b.kind === 'security-group' ? 8 : 12;
  return `        <rect data-graph-role="structural-frame" data-composition-frame-kind="${esc(b.kind || 'boundary')}" data-composition-frame-id="${index}" data-composition-frame-label="${esc(b.label)}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${rx}" class="${cls}" stroke-width="1"/>`;
}
function renderBoundaryLabel(b, index) {
  const labelCls = b.kind === 'security-group' ? 't-security' : 't-cloud';
  return `        <g data-graph-role="structural-frame-label" data-composition-frame-id="${index}" data-composition-frame-kind="${esc(b.kind || 'boundary')}" data-composition-frame-label="${esc(b.label)}">
          <rect data-graph-role="structural-frame-label-mask" x="${b.title.x}" y="${b.title.y}" width="${b.title.width}" height="${b.title.height}" rx="3" class="c-mask"/>
          <text data-boundary-label="" x="${b.title.x + 4}" y="${b.title.y + b.title.baselineOffset}" class="${labelCls}" font-size="${b.title.fontSize}" font-weight="600">${esc(b.label)}</text>
        </g>`;
}
function renderConnectionPath(conn, index) {
  const [cls, marker] = arrowClassMap[conn.variant || 'default'] || arrowClassMap.default;
  const routed = pathFor(conn);
  const strokeWidth = conn.width || (conn.variant === 'emphasis' ? 1.8 : 1.5);
  return `        <path ${focusEdgeAttrs(conn.from, conn.to, conn.label, index, conn.id)} data-composition-points="${routePointsValue(routed.points)}" d="${routed.d}" class="${cls}"${animateAttr(arch.meta, 'edge', index)} stroke-width="${strokeWidth}" marker-end="url(#${marker})"/>`;
}
function renderConnectionLabel(conn, index) {
  if (!conn.label) return '';
  const [lx, ly] = labelPoint(conn, pathFor(conn).points);
  const w = Math.max(30, textUnits(conn.label) * 4.8 + 10);
  return `        <g data-detail="context" ${focusEdgeAttrs(conn.from, conn.to, conn.label, index, conn.id)}>
          <rect x="${lx - w / 2}" y="${ly - 10}" width="${w}" height="14" rx="3" class="c-mask"/>
          <text x="${lx}" y="${ly}" class="${variantAccent(conn.variant)}" font-size="8" text-anchor="middle">${esc(conn.label)}</text>
        </g>`;
}
function renderComponent(c) {
  const fill = componentFill[c.type] || 'c-external';
  const accent = componentText[c.type] || 't-muted';
  const cx = c.cx;
  const hasSub = c.sublabel != null && c.sublabel !== '';
  const labelY = hasSub ? c.y + c.height / 2 - 2 : c.y + c.height / 2 + 4;
  const sub = hasSub
    ? `\n        <text data-detail="context" x="${cx}" y="${c.y + c.height / 2 + 14}" class="t-muted" font-size="${fittedNodeFontSize(c.sublabel, c.width, componentTextFit.sublabelPreferred, componentTextFit.sublabelMinimum)}" text-anchor="middle">${esc(c.sublabel)}</text>`
    : '';
  const tag = c.tag
    ? `\n        <text data-detail="fine" x="${cx}" y="${c.y + c.height - 8}" class="${accent}" font-size="${fittedNodeFontSize(c.tag, c.width, componentTextFit.tagPreferred, componentTextFit.tagMinimum)}" text-anchor="middle">${esc(c.tag)}</text>`
    : '';
  const brand = renderBrandMark(c, { x: c.x + c.width - 22, y: c.y + 6 });
  const labelFontSize = fittedNodeFontSize(c.label, brandLabelFitWidth(c, c.width), 11, 8);
  const passport = { kind: c.type, sublabel: c.sublabel, tag: c.tag, context: componentContext(c), ...brandMetadataFor(c) };
  return `        <g ${focusNodeAttrs(c.id, c.label, passport, arch.meta.locale)}>
          ${focusNodeTitle(c.label, passport)}
          <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="6" class="c-mask"/>
          <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="6" class="${fill}"${animateAttr(arch.meta, 'node', componentSteps.get(c.id))} stroke-width="1.5"/>
          ${renderSemanticSigil(c.type, { x: c.x + 6, y: c.y + 6 })}${brand ? `\n          ${brand}` : ''}
          <text data-node-label=""${hasSub ? ' data-detail-anchor=""' : ''} x="${cx}" y="${labelY}" class="t-primary" font-size="${labelFontSize}" font-weight="600" text-anchor="middle">${esc(c.label)}</text>${sub}${tag}
        </g>`;
}
function renderLegend() {
  const entries = architectureLegendEntries;
  const relationshipObstacles = relationshipLegendObstacles(arch.connections, {
    pointsFor: (connection) => pathFor(connection).points,
    labelRectFor: (connection) => {
      if (!connection.label) return null;
      const [x, y] = labelPoint(connection, pathFor(connection).points);
      const width = Math.max(30, textUnits(connection.label) * 4.8 + 10);
      return { x: x - width / 2, y: y - 10, width, height: 14 };
    },
  });
  const contentBottom = Math.max(
    0,
    ...[...components.values()].map((component) => component.y + component.height),
    ...boundaries.map((boundary) => boundary.y + boundary.height),
  );
  return renderResolvedLegend({
    entries,
    locale: arch.meta.locale,
    layout: {
      x: layout.margin,
      baselineY: legendY(),
      width: viewBox[0] - layout.margin * 2,
      minTitleY: contentBottom + 8,
      obstacles: relationshipObstacles,
      unfit: arch.meta?.legend === undefined ? 'hide' : 'error',
      diagramType: 'architecture',
    },
    renderSwatch: (entry) => `<rect x="${entry.x}" y="${entry.baseline - 9}" width="16" height="10" rx="2.5" class="${componentFill[entry.kind] || 'c-external'}" stroke-width="1"/>`,
  });
}
function renderSvg() {
  return `      <svg viewBox="0 0 ${viewBox[0]} ${viewBox[1]}" ${svgRootAttrs(arch.meta)}>
${svgAccessibleText(arch.meta, 'architecture')}
${renderDefinitions()}
        <!-- Background Grid -->
        <rect width="100%" height="100%" fill="url(#grid)" />
        <!-- Boundaries (behind everything) -->
${boundaries.map(renderBoundaryFrame).join('\n\n')}
        <!-- Connection paths (before components for correct z-order) -->
${asArray(arch.connections).map(renderConnectionPath).join('\n')}
        <!-- Components -->
${[...components.values()].map(renderComponent).join('\n\n')}
        <!-- Connection labels -->
${asArray(arch.connections).map(renderConnectionLabel).join('\n')}
        <!-- Boundary labels (foreground masks keep routes out of titles) -->
${boundaries.map(renderBoundaryLabel).join('\n\n')}
        <!-- Legend -->
${renderLegend()}
      </svg>`;
}
validateArchitecture();
if (layoutJsonMode) {
  console.log(JSON.stringify(buildLayoutReport(), null, 2));
  process.exit(0);
}
writeDiagram({
  outPath,
  template,
  diagramType: 'architecture',
  meta: arch.meta,
  svg: renderSvg(),
  cards: arch.cards,
  sourceEvidence,
});
no test files yet — suite lands with T001
    65	  Every revision is revalidated; no LLM output bypasses a gate or relaxes
    66	  a diagnostic.
    67	- **R014:** JEV results are separately attributed advisory metadata, never
    68	  proof, approval, execution authority, or changes to specs or gate results.
    69	  Export requires explicit per-operation consent for the selected payload.
    70	  Disabled, unavailable, or failed advice leaves deterministic validation
    71	  and rendering unchanged. Confidence, when supplied, is labeled
    72	  provider-reported and uncalibrated.
    73	- **R015:** The same validated spec renders to standalone HTML (primary),
    74	  SVG, PDF, raster image, and slide deck output; each export carries the
    75	  validation receipts and is deterministic where the format allows.
    76	- **R016:** Every rendered diagram can be evaluated against the reference
    77	  standard: deterministic structural checks (spacing minimums, overlap
    78	  detection, boundary-hierarchy, label clearance) plus perceptual review
    79	  against a gold-standard reference set, producing a machine-readable scored
    80	  report with per-dimension verdicts, findings with evidence, and concrete
    81	  fixes. Evaluation is advisory: it never mutates specs or gate results.
    82
    83	## Features
    84
    85	### F001 — Cloud-native spec schema
    86
    87	Typed JSON spec with provider-discriminated network/resource scopes:
    88	AWS VPCs, GCP VPC networks, Azure VNets, address ranges where applicable,
    89	regions, zones, subnets, scaling groups, catalog resources, semantic edges,
    90	and overlapping visual frames without a containment tree.
    91	Each AWS subnet belongs to one AZ; an AZ may contain multiple subnets.
    92	GCP VPC networks are global with regional subnets; Azure VNets and subnets
    93	are regional, not zone-bound.
    94	Resources support explicit single- or multi-subnet/zone placement and
    95	regional/global scope, sufficient for ALB, ASG, and RDS Multi-AZ.
    96	Security-group membership is distinct from containment; visual bands
    97	do not imply network isolation. Decisions D2, D5.
    98
    99	**Requirements:** R001, R002
   100
   380	**Likely files:** src/export.ts, tests/run-tests.mjs
   381	**Acceptance criteria:**
   382	- the same validated spec emits HTML, SVG, PDF, raster image, and slide output
   383	- SVG export is byte-deterministic for a fixed spec and theme
   384	- exports carry the validation receipts; failed gates block export claims
   385	- raster and PDF exports match the SVG geometry (no re-layout)
   386	**Verification:**
   387	- `npx --no-install tsc --noEmit`
   388	- `node tests/run-tests.mjs`
   389
   390	Implement `src/export.ts`: native SVG serialization, PDF and raster
   391	pipelines over the same SVG geometry, and slide output per guided view or
   392	reference preset. Library choices are recorded in the knowledge base before
   393	implementation.
   394
   395	### T011: Element knowledge base
   396	**Feature:** F010
   397	**Priority:** medium
   398	**Type:** modify
   399	**Likely files:** docs/stratus-renderer-spec.md, docs/algorithms.md
   400	**Acceptance criteria:**
   401	- sizing algorithms, boundary nesting math, label masks, and routing
   402	  contracts are recorded with formulas and measured constants
   403	- every rule is cross-checked against the four proof diagrams
   404	**Verification:**
   405	- `node tests/run-tests.mjs`
   406
   407	Record the renderer specification (element shapes, math formulas, design
   408	patterns) from `docs/stratus-renderer-spec.md` into the implementation
   409	knowledge base: recursive boundary stack, grid pitch and label masks,
   410	orthogonal side contracts, traffic planes, auxiliary-service boxes, and the
   411	validation gates. Sources: official AWS reference architecture measurements,
   412	AWS layout guidelines, Azure Well-Architected diagram guidance, and the
   413	archify authoring contract.
   414
   415	### T012: Evaluation skill
   416	**Feature:** F011
   417	**Priority:** high
   418	**Type:** feature
   419	**Dependencies:** T003, T004
   420	**Likely files:** src/evaluate.ts, bin/stratus.mjs, skills/stratus-evaluate/SKILL.md, tests/run-tests.mjs
    20	## 1. Core formulas
    21
    22	### 1.1 Uniform scaling
    23
    24	```text
    25	scale   = min(viewportW / referenceW, viewportH / referenceH)
    26	offsetX = (viewportW - scale * referenceW) / 2
    27	screenX = offsetX + scale * logicalX
    28	```
    29
    30	Projected text must stay readable: `projectedFontPx = sourceFontPx × scale ≥ 6`.
    31	At a 1440×900 desktop the available diagram width is ~930px — a viewBox wider
    32	than ~1395px drops 9px sublabels below the floor (measured: 1430px viewBox →
    33	scale 0.650 → 5.85px → FAIL; ≤1395px → ≥6.0px → pass).
    34
    35	### 1.2 Boundary nesting (per-level tokens, not depth-linear)
    36
    37	```text
    38	childOriginX = boundary.x + padLeft
    39	childOriginY = boundary.y + headerH + padTop
    40	innerW = boundary.w - padLeft - padRight
    41	innerH = boundary.h - headerH - padTop - padBottom - footerH
    42	boundary.w = padLeft + contentW + padRight
    43	boundary.h = headerH + padTop + contentH + padBottom + footerH
    44	```
    45
    46	Recommended starting tokens (from the AWS reference measurements):
    47
    48	```text
    49	Cloud:  headerH=44, padLeft=40, padRight=16, padTop=4,  padBottom=20
    50	Region: headerH=44, padLeft=40, padRight=40, padTop=16, padBottom=24
    51	VPC:    headerH=60, padLeft=32, padRight=32, padTop=24, padBottom=24
    52	AZ:     headerH=0,  padLeft=24, padRight=24, padTop=16, padBottom=16, footerH=32
    53	Subnet: headerH=56, padLeft=12, padRight=12, padTop=12, padBottom=12
    54	```
    55
    56	Style per level: Cloud = solid corner-tab rectangle; Region/VPC/AZ = dashed;
    57	Subnet = filled panel. AZ label is footer-centered, not header.
    58
    59	### 1.3 Grid pitch and cells
    60
    61	```text
    62	pitchX = cellW + gapX
    63	pitchY = cellH + gapY
    64	cellX  = originX + col * pitchX
    65	gridW  = cols * cellW + (cols - 1) * gapX
    66	```
    67
    68	**User preference (2026-09-24): more spacing, stricter overlap handling.**
    69	Default gaps are raised: gapX ≥ 90 for icon-class cells, gapY ≥ 56 for
    70	boundary-heavy layouts; boundary padding +25% over the AWS-measured tokens.
    71	Overlap rules (hard): boundary bounding boxes must not overlap unless the
    72	overlap is the semantic point (true containment Region ⊃ VPC ⊃ AZ ⊃ subnet);
    73	wrap-sets must be spatially contiguous — a wrap-set whose members are not
    74	adjacent inflates its bounding box over unrelated boundaries (measured: eks
    75	proof public-subnet box spanned rows 0–2 and swallowed the private subnet);
    76	coincident boundary edges (identical wrap-sets) are a validation failure.
    77
    78	Cell classes (glyph vs occupied cell incl. labels): bare icon 48×48;
    79	gateway+label 144×88; compact compute 112×88; public subnet ≥230×160;
    80	private subnet ≥230×150; AZ ≥310×420 (measured AZ pitch ≈371px, gap ≈80px);
    81	route-table card ≥190×116.
    82
    83	**Measured lesson (proof diagrams):** empty grid rows still consume pitch —
    84	contiguous rows only. A diagram that skips a row rendered ~240px taller than
    85	the viewport and failed visual-check; compacting to contiguous rows fixed it.
    86
    87	### 1.4 Label masks and clear gap
    88
    89	```text
    90	labelMask ≈ 6.5px × ASCII units + 13px   (CJK counts as 2 units)
    91	clear gap > labelMask + 8px breathing room
    92	```
    93
    94	**Measured lesson:** with 120px cells, adjacent-column gaps need gapX ≥ 70 for
    95	7–8 character labels ("ingress", "filtered"); 12-character labels
    96	("allow / deny", 68px mask) do not fit any gap that keeps the font floor —
    97	shorten the label ("filtered", 45px) instead of widening the grid.
    98	Repair order: move label → adjust route/spacing → shorten wording preserving
    99	meaning → omit only fully-implied wording.
   100
   101	### 1.5 Orthogonal routing side contracts
   102
   103	```text
   104	first segment: perpendicular, OUTWARD from the named fromSide
   105	final segment: perpendicular, INWARD to the named toSide
   106	interior segments ≥ 16px; nonzero segments ≥ 8px
   107	parallel traffic planes separated ~10px
   108	```
   109
   110	Edges never cross unrelated opaque nodes; a long run along a container border
--- diagrams/eks-ipv6.architecture.json
    10	  "components": [
    11	    { "id": "users", "type": "external", "label": "Users", "sublabel": "IPv4 + IPv6", "row": 0, "col": 0 },
    12	    { "id": "igw", "type": "cloud", "label": "Internet Gateway", "row": 0, "col": 1 },
    13	    { "id": "alb", "type": "cloud", "label": "ALB", "sublabel": "dual-stack :443", "row": 0, "col": 2 },
    14	    { "id": "nodes", "type": "backend", "label": "Worker Nodes", "sublabel": "pods: IPv6 /64", "row": 0, "col": 3, "tag": "IPv6" },
    15	    { "id": "cp", "type": "cloud", "label": "EKS Control Plane", "sublabel": "AWS managed", "row": 1, "col": 2 },
    16	    { "id": "nat64", "type": "cloud", "label": "NAT64 + DNS64", "sublabel": "public subnet", "row": 2, "col": 1 },
    17	    { "id": "eigw", "type": "cloud", "label": "Egress-Only IGW", "sublabel": "IPv6 egress", "row": 2, "col": 2 }
    18	  ],
    19	  "boundaries": [
    20	    { "kind": "region", "label": "AWS Region: us-west-2", "wraps": ["igw", "alb", "nodes", "cp", "nat64", "eigw"] },
    21	    { "kind": "region", "label": "Public subnets — dual-stack", "wraps": ["alb", "nat64"] },
    22	    { "kind": "region", "label": "Private subnets — dual-stack /64", "wraps": ["nodes", "cp"] }
    23	  ],
    24	  "connections": [
    25	    { "id": "users-to-igw", "from": "users", "to": "igw", "label": "HTTPS", "variant": "emphasis" },
    26	    { "id": "igw-to-alb", "from": "igw", "to": "alb", "label": "ingress" },
    27	    { "id": "alb-to-nodes", "from": "alb", "to": "nodes", "label": "IPv6", "variant": "emphasis" },
    28	    { "id": "nodes-to-cp", "from": "nodes", "to": "cp", "label": "API :443", "variant": "security" },
    29	    { "id": "nodes-to-eigw", "from": "nodes", "to": "eigw", "label": "IPv6 egress", "fromSide": "bottom", "toSide": "top", "via": [[580, 266], [420, 266]] },
    30	    { "id": "nodes-to-nat64", "from": "nodes", "to": "nat64", "label": "IPv4-only dest", "fromSide": "bottom", "toSide": "top" },
    31	    { "id": "nat64-to-igw", "from": "nat64", "to": "igw", "label": "IPv4", "variant": "dashed", "labelDx": -22 }
    32	  ],
    33	  "cards": [
    34	    { "dot": "cyan", "title": "Ingress", "items": ["Dual-stack ALB terminates IPv4 and IPv6", "Requests reach pods over IPv6"] },
    35	    { "dot": "emerald", "title": "Pod networking", "items": ["Each subnet gets a /64 from the VPC /56", "Pods receive IPv6 addresses — no NAT pod-to-pod", "VPC CNI assigns IPv6 via the node's prefix delegation"] },
    36	    { "dot": "rose", "title": "Egress", "items": ["IPv6 destinations leave via the egress-only IGW", "IPv4-only destinations translate via NAT64 + DNS64"] }
    37	  ]
    38	}
--- diagrams/firewalls-centralized.architecture.json
    10	  "components": [
    11	    { "id": "internet", "type": "external", "label": "Internet", "row": 0, "col": 3 },
    12	    { "id": "spoke-a", "type": "backend", "label": "Spoke VPC A", "sublabel": "workload", "row": 1, "col": 0 },
    13	    { "id": "spoke-b", "type": "backend", "label": "Spoke VPC B", "sublabel": "workload", "row": 2, "col": 0 },
    14	    { "id": "tgw", "type": "cloud", "label": "Transit Gateway", "sublabel": "hub", "row": 1, "col": 1 },
    15	    { "id": "insp", "type": "security", "label": "Network Firewall", "sublabel": "inspection VPC", "row": 1, "col": 2, "tag": "centralized" },
    16	    { "id": "igw-c", "type": "cloud", "label": "IGW", "row": 1, "col": 3 }
    17	  ],
    18	  "boundaries": [
    19	    { "kind": "region", "label": "AWS Region", "wraps": ["spoke-a", "spoke-b", "tgw", "insp", "igw-c"] },
    20	    { "kind": "region", "label": "Inspection VPC", "wraps": ["insp", "igw-c"] },
    21	    { "kind": "region", "label": "Spoke VPC A", "wraps": ["spoke-a"] },
    22	    { "kind": "region", "label": "Spoke VPC B", "wraps": ["spoke-b"] }
    23	  ],
    24	  "connections": [
    25	    { "id": "a-to-tgw", "from": "spoke-a", "to": "tgw", "label": "egress" },
    26	    { "id": "b-to-tgw", "from": "spoke-b", "to": "tgw" },
    27	    { "id": "tgw-to-insp", "from": "tgw", "to": "insp", "label": "inspect", "variant": "emphasis" },
    28	    { "id": "insp-to-igw", "from": "insp", "to": "igw-c", "label": "filtered" },
    29	    { "id": "igw-to-inet", "from": "igw-c", "to": "internet", "label": "filtered egress", "variant": "emphasis" }
    30	  ],
    31	  "cards": [
    32	    { "dot": "cyan", "title": "Centralized inspection", "items": ["One inspection VPC inspects all spoke traffic via Transit Gateway", "TGW route tables steer 0.0.0.0/0 to the firewall endpoints", "Single policy surface to manage and audit"] },
    33	    { "dot": "rose", "title": "Trade-offs", "items": ["Consistent rules across all spokes", "TGW data-processing cost on every inspected flow", "Inspection VPC is a shared failure domain"] }
    34	  ]
    35	}
--- diagrams/firewalls-distributed.architecture.json
    10	  "components": [
    11	    { "id": "internet", "type": "external", "label": "Internet", "row": 0, "col": 2 },
    12	    { "id": "dist", "type": "backend", "label": "Spoke VPC", "sublabel": "workload", "row": 1, "col": 0 },
    13	    { "id": "fw-d", "type": "security", "label": "Network Firewall", "sublabel": "per-VPC endpoint", "row": 1, "col": 1 },
    14	    { "id": "igw-d", "type": "cloud", "label": "IGW", "row": 1, "col": 2 }
    15	  ],
    16	  "boundaries": [
    17	    { "kind": "region", "label": "AWS Region", "wraps": ["dist", "fw-d", "igw-d"] },
    18	    { "kind": "region", "label": "Spoke VPC (distributed)", "wraps": ["dist", "fw-d", "igw-d"] }
    19	  ],
    20	  "connections": [
    21	    { "id": "dist-to-fw", "from": "dist", "to": "fw-d", "label": "egress" },
    22	    { "id": "fw-to-igw", "from": "fw-d", "to": "igw-d", "label": "filtered" },
    23	    { "id": "igw-to-inet", "from": "igw-d", "to": "internet", "label": "filtered egress", "variant": "emphasis" }
    24	  ],
    25	  "cards": [
    26	    { "dot": "emerald", "title": "Distributed", "items": ["Each VPC carries its own Network Firewall endpoint", "No Transit Gateway hop for egress — lower latency", "Policy repeats per VPC"] },
    27	    { "dot": "rose", "title": "Trade-offs", "items": ["More policy surfaces to audit as VPC count grows", "No shared east-west inspection point"] }
    28	  ]
    29	}
--- diagrams/vpc-lattice.architecture.json
    10	  "components": [
    11	    { "id": "clients", "type": "external", "label": "Clients", "sublabel": "Client VPC", "row": 1, "col": 0 },
    12	    { "id": "lattice", "type": "cloud", "label": "VPC Lattice", "sublabel": "service network", "row": 1, "col": 1, "tag": "SN-1" },
    13	    { "id": "svc-a", "type": "backend", "label": "Service A", "sublabel": "EC2 ASG", "row": 0, "col": 2 },
    14	    { "id": "svc-b", "type": "backend", "label": "Service B", "sublabel": "EKS pods", "row": 1, "col": 2 },
    15	    { "id": "svc-c", "type": "backend", "label": "Service C", "sublabel": "Lambda", "row": 2, "col": 2 },
    16	    { "id": "authz", "type": "security", "label": "IAM Auth", "sublabel": "SigV4 + auth policy", "row": 2, "col": 1 }
    17	  ],
    18	  "boundaries": [
    19	    { "kind": "region", "label": "AWS Region: us-east-1", "wraps": ["lattice", "svc-a", "svc-b", "svc-c", "authz"] },
    20	    { "kind": "region", "label": "Client VPC", "wraps": ["clients"] },
    21	    { "kind": "region", "label": "Service VPC A", "wraps": ["svc-a"] },
    22	    { "kind": "region", "label": "Service VPC B", "wraps": ["svc-b"] }
    23	  ],
    24	  "connections": [
    25	    { "id": "clients-to-sn", "from": "clients", "to": "lattice", "label": "SigV4 request", "variant": "emphasis" },
    26	    { "id": "sn-to-a", "from": "lattice", "to": "svc-a" },
    27	    { "id": "sn-to-b", "from": "lattice", "to": "svc-b" },
    28	    { "id": "sn-to-c", "from": "lattice", "to": "svc-c", "label": "invoke" },
    29	    { "id": "auth-attach", "from": "authz", "to": "lattice", "label": "auth policy", "variant": "security", "fromSide": "top", "toSide": "bottom" }
    30	  ],
    31	  "cards": [
    32	    { "dot": "cyan", "title": "Service network", "items": ["One service network connects clients and services across VPCs", "No VPC peering, no overlapping-CIDR conflicts"] },
    33	    { "dot": "emerald", "title": "Services", "items": ["EC2, EKS, and Lambda targets behind HTTPS listeners", "Lambda targets need no VPC attachment", "Access logs flow to CloudWatch"] },
    34	    { "dot": "rose", "title": "Access control", "items": ["IAM SigV4-signed requests at the service network", "Auth policies attached per service network"] }
    35	  ]
    36	}
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "diagrams", "docs"]
}
bash: cd /home/fakoli/code/stratus && grep -nE 'Solid green|rou...
9:**Important:** The image contradicts several composition notes. In particular, the VPC outline is solid, subnet borders are not visibly dashed, badges are rounded squares, the AZ gap is approximately 80 px, and internet links are diagonal. Preserve these distinctions rather than recording the notes’ approximations as measured facts.
22:| Amazon VPC | `(191, 144, 767, 447)` | **Solid green** outline, approximately 1.5 px. Green corner tab approximately 44×44 px contains a white cloud-and-lock glyph. Title and CIDR occupy two lines beginning around `(251, 160)`. |
29:- Cloud→Region inset: approximately **44 px left, 48 px top, 13 px right, 20 px bottom**.
34:**Containment exception:** Both AZ rectangles extend approximately **34 px below the VPC’s bottom border**. The artwork therefore does **not** implement strict recursive visual containment. Stratus should distinguish an exact-reference composition profile from a corrected, strictly nested profile.
48:- Title starts approximately **44 px right of the panel’s left edge** and **8 px below its top**.
52:- AZ1 panel inset is approximately **43 px left / 18 px right**; AZ2 reverses the emphasis, approximately **19 px left / 49 px right**. These asymmetric gutters accommodate traffic paths.
128:**Actual shape:** blue **rounded squares**, not circles.
248:| Private subnet | 230×150 minimum | 24 / 12 | Source is about 148 px high |
281:    Σ(character is CJK/full-width ? 2 : 1)
309:CJK×2 is a fallback heuristic; emoji, combining marks, and proportional Latin text require real measurement.
478:| Level | Reference-image profile | Optional normalized profile |
482:| VPC | Solid green + lock tab | Dashed green if library convention requires |
486:Do not label the normalized profile an exact reproduction.
553:For generated diagrams, add a compact legend: approximately **24 px line sample**, **8 px sample-to-text gap**, and **20 px row pitch**.
603:- Standard generated diagrams: **11–12 px**.
605:- The source’s approximately 8 px table text is a fidelity choice, not a comfortable general default.
611:| Edge-through-node | Reject intersection with non-endpoint icon/body envelopes inflated by 8 px. Endpoint exemptions cover only assigned port approaches. |
612:| Label clearance | Reject edge or unrelated-shape intersection with label masks inflated by 8 px. |
615:| Micro-segments | Remove zero-length segments; reject remaining segments under 8 px and interior segments under 16 px. |
618:| Border-run detection | Flag an edge parallel to a boundary within 4 px for at least 16 px, unless explicitly allowed. |
628:- **Note — medium:** `composition-notes.md:21,24–25` has inaccurate size estimates: AZ gap approximately 80 px; private panels approximately 148 px high; route cards approximately 168–183×116 px.
   113
   114	## 2. Repeatable element library
   115
   116	| Element | Shape spec |
   117	|---|---|
   118	| Cloud boundary | solid corner-tab rectangle, logo + label top-left tab |
   119	| Region/VPC/AZ boundary | dashed rectangle; Region+VPC title top-left with icon; AZ title footer-centered |
   120	| Subnet panel | filled rounded panel (public=green tint, private=blue tint), lock icon + title + two-tone CIDR line (IPv4 dark, IPv6 orange) |
   121	| Gateway icon | circle 48px with arch/gate glyph, label below (two lines) |
   122	| Compute icon | chip/square 40px, label below: name, addresses |
   123	| Route-table card | white card, blue header bar, Destination/Target columns, alternating row shading; placed OUTSIDE subnets as side rails |
   124	| Numbered badge | solid circle ~22px, white numeral, anchored at source end of the decision edge, 20px offset, 10px min clearance |
   125	| Traffic planes | separate colored line families per protocol/segment (blue=IPv4, orange=IPv6) with legend |
   126	| Auxiliary services | dashed unfilled box, no edges (CloudWatch/CloudTrail/X-Ray/IAM only) |
   127
   128	## 3. Layout patterns
   129
   130	1. **Recursive boundary stack** — Cloud→Region→VPC→AZ→Subnet as nested insets
   131	   with per-level style tokens; containment truth per provider (AWS subnet ∈
   132	   one AZ; GCP regional subnets; Azure regional VNets).
   133	2. **Tiered top-to-bottom VPC layout** — users → IGW → LB → compute → data;
   134	   left-to-right spine with short vertical branches for pipelines.
   135	3. **Semantic traffic planes** — one colored line family per protocol/segment;
   136	   legend explains line/border semantics; dashed = async/auxiliary only.
   137	4. **Auxiliary services** — dashed unfilled corner box, no edges, no step badges.
   138	5. **Progressive disclosure** — split overloaded comparisons into focused
   139	   diagrams (measured: a 7-column comparison diagram could not satisfy both
   140	   the 6px font floor and label masks; two 4-column diagrams validate clean).
   141	6. **Deterministic layout from spec** — grid placement (row/col) computed from
   142	   the spec; no hand-tuned coordinates; same spec → same layout bytes.
   185
   186	### 6.1 Canonical VPC element vocabulary (16 first-class elements)
   187
   188	VPC; Subnets; Availability Zones; Internet Gateway; Route Tables; Security
   189	Groups; NACLs (subnet-level); NAT Gateway; VPN Connections; Direct Connect;
   190	ALB/NLB; Transit Gateway; VPN Gateway; VPC Endpoint Gateway (S3/DynamoDB);
   191	VPC Peering Connection; VPC Endpoint Interface. The Stratus catalog
   192	(`src/cloud.ts`) must cover this vocabulary as first-class spec objects —
   193	each with provider-true placement rules (IGW at VPC level, NAT/ALB in public
   194	subnets, compute/data in private subnets, Route53/CloudFront/S3/IAM/CloudWatch
   195	outside VPC).
   196
   197	### 6.2 Progressive-disclosure ladder (the generator DNA)
   198
   199	Cloudviz builds complexity by starting simple and adding one resource family
   200	per step, each step a complete readable diagram:
   201
   202	1. Simple VPC — 3 AZs, 3 public/private subnet pairs, IGW, route tables
   203	2. + ALB + EC2 targets in an auto-scaling group
   204	3. Three-tier — external + internal ALBs, presentation/app/data tiers,
   205	   RDS + read replica, NAT Gateway for private egress
     1	// Stratus offline test runner (T001 creates the suite; later tasks extend it).
     2	// Deterministic, offline, no network, no credentials.
     3	import { spawnSync } from "node:child_process";
     4	import { readdirSync } from "node:fs";
     5	import { join, dirname } from "node:path";
     6	import { fileURLToPath } from "node:url";
     7
     8	const here = dirname(fileURLToPath(import.meta.url));
     9
    10	const testFiles = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();
    11
    12	if (testFiles.length === 0) {
    13	  console.log("no test files yet — suite lands with T001");
    14	  process.exit(0);
    15	}
    16
    17	let failed = 0;
    18	for (const f of testFiles) {
    19	  const r = spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" });
    20	  if (r.status !== 0) failed += 1;
    21	}
    22	process.exit(failed === 0 ? 0 : 1);
index_diff_exit=0
  1055	${asArray(arch.connections).map(renderConnectionLabel).join('\n')}
  1056
  1057	        <!-- Boundary labels (foreground masks keep routes out of titles) -->
  1058	${boundaries.map(renderBoundaryLabel).join('\n\n')}
  1059
  1060	        <!-- Legend -->
  1061	${renderLegend()}
  1062	      </svg>`;
  1063	}
  1064
  1065	validateArchitecture();
  1066	if (layoutJsonMode) {
  1067	  console.log(JSON.stringify(buildLayoutReport(), null, 2));
  1068	  process.exit(0);
  1069	}
  1070	writeDiagram({
  1071	  outPath,
  1072	  template,
  1073	  diagramType: 'architecture',
  1074	  meta: arch.meta,
  1075	  svg: renderSvg(),
  1076	  cards: arch.cards,
  1077	  sourceEvidence,
  1078	});
# Stratus implementation report
Read-only recommendations. No files were edited. Paths below are relative to `/home/fakoli/code/stratus` unless specified otherwise.
## 1. `src/schema.ts` — semantic model
### Decisions and verified findings
- **Correct:** Provider-specific placement and multi-subnet resources are explicitly required by `docs/PRD.md:91–97`. Preserve these requirements rather than applying the AWS hierarchy to every provider.
- **Note — medium:** `docs/PRD.md:90` says “without a containment tree,” conflicting with this task. Follow the current task: **a true ownership tree plus separate overlapping membership frames**.
- **Blocker — high, for treating proofs as reference-grade fixtures:** `diagrams/firewalls-distributed.architecture.json:17–18` gives Region and VPC identical wrap-lists. These produce identical initial rectangles under archify’s `boundaryRect()` algorithm.
- **Blocker — high, for migration:** `diagrams/eks-ipv6.architecture.json:14,21–22` conflates pod addressing with subnet prefixes and places the managed control plane inside the private-subnet wrap-list.
- **Blocker — high, for migration:** `diagrams/vpc-lattice.architecture.json:25–28` directly joins the service network to target resources, without distinct service objects or association/request/service-target semantics.
### Separate three concepts
1. **Semantic ownership:** Every scope/resource has exactly one owner.
2. **Deployment placement:** A resource can attach to several subnets or zones.
3. **Paint geometry:** One resource can have several explicitly linked visual instances; membership bands can cross tiers without becoming containers.
AWS AZ nodes below a VPC represent **that VPC’s slice of an AZ**, not ownership of the geographical AZ. Different VPCs may reference the same geographical zone.
Provider trees:
```text
AWS:
Cloud → Region → VPC → AZ slice → Subnet → resource
                 └── regional/VPC-scoped or multi-subnet resource
GCP:
Cloud → global VPC network → regional network slice → Subnet → resource
      └── Region → regional managed resource
Azure:
Cloud → Region → VNet → Subnet → resource
                 └── multi-subnet resource
```
Azure/GCP resource zones are placement facts, not parents of regional subnets.
### Core interfaces
These are proposed source interfaces, not claims that the existing repository implements them.
```ts
export type Provider = "aws" | "gcp" | "azure";
export type Id = string;
export type NonEmpty<T> = readonly [T, ...T[]];
export type AtLeastTwo<T> = readonly [T, T, ...T[]];
export type Fact<T> =
  | { status: "known"; value: T }
  | { status: "unknown"; reason: string };
export interface Entity {
  id: Id;
  label: string;
  order?: number; // Stable tie-break: order ?? 0, then binary ID comparison.
}
export interface GeoRegion extends Entity {
  code: string;
  zones: readonly string[];
}
export interface ZoneRef {
  regionId: Id; // References GeoRegion, not a paint frame.
  zone: string;
}
export type CIDR =
  | { family: "ipv4"; value: string }
  | { family: "ipv6"; value: string };
export type Tier =
  | "ingress"
  | "load-balancer"
  | "compute"
  | "application"
  | "data"
  | "auxiliary";
export type Placement =
  | { kind: "global" }
  | { kind: "region"; regionId: Id }
  | { kind: "network"; networkId: Id }
  | { kind: "single-zone"; zone: ZoneRef }
  | { kind: "multi-zone"; zones: AtLeastTwo<ZoneRef> }
  | { kind: "single-subnet"; attachment: SubnetAttachment }
  | {
      kind: "multi-subnet";
      attachments: AtLeastTwo<SubnetAttachment>;
      deployment: "distributed" | "active-standby" | "attachment-only";
    };
export interface SubnetAttachment extends Entity {
  subnetId: Id;
  // Azure/GCP subnet attachment may optionally be zone-specific.
  // AWS zone is derived from the subnet and must agree if supplied.
  zone?: ZoneRef;
  role: "primary" | "standby" | "member" | "interface";
}
export interface Resource<P extends Provider> extends Entity {
  kind: "resource";
  service: `${P}.${string}`; // Runtime enum comes from the pinned catalog.
  placement: Placement;
  tier: Tier;
  exposure?: "internet-facing" | "internal" | "not-applicable";
  addresses?: readonly {
    family: "ipv4" | "ipv6";
    value: string; // Individual address, not a subnet CIDR.
  }[];
  delegatedPrefixes?: readonly {
    cidr: CIDR;
    purpose: "node-prefix" | "other";
  }[];
  properties?: Readonly<Record<string, string | number | boolean>>;
}
export interface ScopeBase<P extends Provider> extends Entity {
  resources: readonly Resource<P>[];
}
export interface Subnet<P extends Provider> extends ScopeBase<P> {
  kind: "subnet";
  cidrs: Fact<NonEmpty<CIDR>>;
  classification: "public" | "private" | "isolated" | "unspecified";
  tier: Tier;
}
export interface AwsAZ extends ScopeBase<"aws"> {
  kind: "aws-az-slice";
  zone: ZoneRef;
  subnets: readonly Subnet<"aws">[];
}
export interface AwsVPC extends ScopeBase<"aws"> {
  kind: "aws-vpc";
  cidrs: Fact<NonEmpty<CIDR>>;
  azs: readonly AwsAZ[];
}
export interface AwsRegion extends ScopeBase<"aws"> {
  kind: "aws-region";
  regionId: Id;
  vpcs: readonly AwsVPC[];
}
export interface AwsCloud extends ScopeBase<"aws"> {
  kind: "aws-cloud";
  regions: readonly AwsRegion[];
}
export interface GcpNetworkRegion extends ScopeBase<"gcp"> {
  kind: "gcp-network-region";
  regionId: Id;
  subnets: readonly Subnet<"gcp">[];
}
export interface GcpVPC extends ScopeBase<"gcp"> {
  kind: "gcp-vpc";
  // Deliberately no synthetic VPC CIDR: GCP networks have regional ranges.
  regions: readonly GcpNetworkRegion[];
}
export interface GcpRegion extends ScopeBase<"gcp"> {
  kind: "gcp-region";
  regionId: Id;
}
export interface GcpCloud extends ScopeBase<"gcp"> {
  kind: "gcp-cloud";
  networks: readonly GcpVPC[];
  regions: readonly GcpRegion[];
}
export interface AzureVNet extends ScopeBase<"azure"> {
  kind: "azure-vnet";
  cidrs: Fact<NonEmpty<CIDR>>;
  subnets: readonly Subnet<"azure">[];
}
export interface AzureRegion extends ScopeBase<"azure"> {
  kind: "azure-region";
  regionId: Id;
  vnets: readonly AzureVNet[];
}
export interface AzureCloud extends ScopeBase<"azure"> {
  kind: "azure-cloud";
  regions: readonly AzureRegion[];
}
export interface ExternalActor extends Entity {
  kind: "external";
  actorType: "internet" | "users" | "on-premises" | "external-service";
}
```
Rules for resource ownership:
- Single-subnet resources live in that subnet’s `resources`.
- Multi-subnet resources live once at the placements’ least common semantic ancestor, normally the VPC/VNet.
- A multi-subnet ALB is **one resource**, not two independent ALBs. Layout creates attachment-instance glyphs such as `alb@attachment-a`.
- Regional managed services belong outside customer network scopes unless the service catalog explicitly supports network placement.
- Scope arrays establish parentage; do not store a second author-maintained `parentId`.
### Membership policies and spatial frames
```ts
export type MembershipPolicy =
  | (Entity & {
      kind: "security-group";
      networkId: Id;
      resourceIds: NonEmpty<Id>;
    })
  | (Entity & {
      kind: "nacl";
      networkId: Id;
      subnetIds: NonEmpty<Id>;
    });
export interface SpatialFrame extends Entity {
  kind: "membership-band" | "zone-projection" | "auxiliary-group";
  // SG/NACL frames reference policy membership rather than copying it.
  membership:
    | { kind: "policy"; policyId: Id }
    | { kind: "resources"; resourceIds: NonEmpty<Id> };
  presentation: "segmented-band" | "outline";
}
```
A security-group band may cross subnet/tier boundaries. It must never imply isolation or ownership. Use several connected band segments when a single enclosing rectangle would cover unrelated resources.
An auxiliary group is display organization only. If a service participates in an explicitly declared request, do not suppress that edge merely because IAM/CloudWatch usually appear in auxiliary corners; place the participating service outside the passive auxiliary group.
### Edges: semantics, variants, and address families
```ts
export type Face = "top" | "right" | "bottom" | "left";
export interface ResourceEndpoint {
  kind: "resource";
  resourceId: Id;
  attachmentId?: Id; // Required when selecting a particular deployed instance.
}
export interface ExternalEndpoint {
  kind: "external";
  actorId: Id;
}
export interface ScopeEndpoint {
  kind: "scope";
  scopeId: Id;
}
export type TrafficEndpoint = ResourceEndpoint | ExternalEndpoint;
export type AssociationEndpoint = TrafficEndpoint | ScopeEndpoint;
export interface SemanticLabel {
  text: string;
  // Explicit author-approved alternative; never generated by truncation.
  shortText?: string;
}
export interface EdgeBase extends Entity {
  semanticLabel: SemanticLabel;
  variant: "normal" | "emphasis" | "security" | "async";
  sourceFace?: Face;
  targetFace?: Face;
}
export interface TrafficPlane extends Entity {
  family: "ipv4" | "ipv6" | "dual";
  role:
    | "internet"
    | "public-egress"
    | "nat-egress"
    | "private-ipv6-egress"
    | "east-west"
    | "ingress"
    | "control";
}
export interface AssociationEdge extends EdgeBase {
  kind: "association";
  from: AssociationEndpoint;
  to: AssociationEndpoint;
  relation:
    | "vpc-service-network"
    | "service-network-service"
    | "policy-attachment"
    | "peering"
    | "vpn-attachment";
  factIds: readonly Id[];
}
export interface RequestEdge extends EdgeBase {
  kind: "request";
  from: TrafficEndpoint;
  to: TrafficEndpoint;
  planeId: Id;
  protocol: Fact<{
    transport: "tcp" | "udp" | "icmp" | "other";
    ports?: readonly number[];
    application?: string;
  }>;
  direction: "forward" | "both";
  routing: Fact<NonEmpty<Id>>; // IDs of RoutingDecision facts.
  step?: number;
}
export interface ServiceTargetEdge extends EdgeBase {
  kind: "service-target";
  from: ResourceEndpoint;
  to: ResourceEndpoint;
  planeId: Id;
  targetGroupId: Id;
  routing: Fact<NonEmpty<Id>>;
  step?: number;
}
export type Edge = AssociationEdge | RequestEdge | ServiceTargetEdge;
```
Do not infer semantic kind from color, dashes, or label wording. A dual-stack edge is allowed only when both families follow the same declared path; otherwise create separate IPv4/IPv6 edges.
For Azure generated views, use separate directional flows rather than a bidirectional arrow. The schema can still represent an AWS reference’s explicitly bidirectional relationship.
### Routing facts: explain why packets follow an edge
```ts
export type RouteTarget =
  | { kind: "local" }
  | { kind: "resource"; resourceId: Id }
  | { kind: "attachment"; attachmentId: Id }
  | { kind: "discard" };
export type RouteDestination =
  | { kind: "cidr"; cidr: CIDR }
  | { kind: "prefix-list"; prefixListId: Id };
export interface RouteRow extends Entity {
  destination: RouteDestination;
  target: Fact<RouteTarget>;
  origin: "static" | "propagated" | "system";
  priority?: number; // Interpreted by the provider adapter, not universally.
}
export interface RouteTable extends Entity {
  kind: "route-table";
  tableType: "vpc" | "transit-gateway" | "gcp-network" | "azure-udr";
  ownerScopeId: Id;
  appliesTo: readonly (
    | { kind: "subnet"; subnetId: Id }
    | { kind: "attachment"; attachmentId: Id }
    | { kind: "network"; networkId: Id }
  )[];
  completeness: "complete-for-declared-flow" | "partial";
  rows: readonly RouteRow[];
}
export interface NetworkAttachment extends Entity {
  kind: "network-attachment";
  attachmentType: "tgw-vpc" | "vpn" | "peering" | "direct-connect";
  fromId: Id;
  toId: Id;
}
export interface RoutingDecision extends Entity {
  kind: "routing-decision";
  flowId: Id;
  stage: number;
  at: TrafficEndpoint | ScopeEndpoint;
  match: Fact<{
    source: CIDR;
    destination: CIDR;
    family: "ipv4" | "ipv6";
  }>;
  basis:
    | {
        kind: "route";
        tableId: Id;
        rowId: Id;
        selection: "longest-prefix" | "provider-priority";
      }
    | { kind: "listener"; listenerId: Id; targetGroupId: Id }
    | { kind: "service-binding"; associationEdgeId: Id }
    | {
        kind: "unknown";
        reason: string;
      };
  nextHop: Fact<RouteTarget>;
  transform?: {
    kind: "snat" | "nat64";
    resourceId: Id;
    inputFamily: "ipv4" | "ipv6";
    outputFamily: "ipv4" | "ipv6";
    dns64FactId?: Id;
  };
}
export interface ListenerFact extends Entity {
  kind: "listener";
  resourceId: Id;
  port: number;
  targetGroupId: Id;
}
export interface TargetGroupFact extends Entity {
  kind: "target-group";
  serviceId: Id;
  targetResourceIds: NonEmpty<Id>;
}
export interface DNS64Fact extends Entity {
  kind: "dns64";
  subnetIds: NonEmpty<Id>;
  enabled: Fact<boolean>;
  synthesisPrefix: CIDR;
}
export type RoutingFact =
  | RouteTable
  | NetworkAttachment
  | RoutingDecision
  | ListenerFact
  | TargetGroupFact
  | DNS64Fact;
export interface RouteCard extends Entity {
  tableId: Id;
  rail: "auto" | "left" | "right";
}
```
Examples of required distinctions:
```text
Private IPv4:
private-subnet table: 0.0.0.0/0 → NAT-A
NAT-A public-subnet table: 0.0.0.0/0 → IGW
Private IPv6:
private-subnet table: ::/0 → EIGW
Central inspection:
TGW table → inspection VPC attachment
inspection VPC table → firewall endpoint
subsequent VPC table → declared egress target
```
`diagrams/firewalls-centralized.architecture.json:32` currently collapses the first two inspection stages. Model both stages; do not convert the firewall card directly into a TGW next-hop assertion.
Same-AZ NAT is a **preset invariant**, not a universal AWS validity rule. Cross-AZ NAT may be intentionally configured. Likewise, internal ALBs and private NAT gateways must remain expressible; `docs/algorithms.md:193–195` describes common placement patterns, not universal service constraints.
### Top-level spec
```ts
export interface DiagramView extends Entity {
  focusIds: NonEmpty<Id>;
  detail: "overview" | "network-detail";
  omittedContext: readonly string[];
}
export interface CommonSpec {
  schemaVersion: 1;
  title: string;
  geography: readonly GeoRegion[];
  externals: readonly ExternalActor[];
  policies: readonly MembershipPolicy[];
  frames: readonly SpatialFrame[];
  planes: readonly TrafficPlane[];
  edges: readonly Edge[];
  routingFacts: readonly RoutingFact[];
  routeCards: readonly RouteCard[];
  views: readonly DiagramView[];
  presentation: {
    profile: "normalized";
    spacing: "comfortable";
    flow: "top-down" | "left-right";
  };
}
export type StratusSpec =
  | (CommonSpec & { provider: "aws"; cloud: AwsCloud })
  | (CommonSpec & { provider: "gcp"; cloud: GcpCloud })
  | (CommonSpec & { provider: "azure"; cloud: AzureCloud });
```
Implement JSON Schema with `oneOf` provider branches, discriminant `const`s, `additionalProperties: false`, bounded collections/text lengths, and no author-specified coordinates. Use runtime semantic validation for references, catalog placement, and CIDR arithmetic.
The 16-element vocabulary maps to:
- **Scopes:** VPC, subnet, AZ.
- **Facts/policies:** route table, security group, NACL.
- **Catalog resources/attachments:** IGW, NAT, VPN connection, Direct Connect, ALB/NLB, TGW, VPN gateway, gateway endpoint, peering connection, interface endpoint.
## 2. `src/layout.ts` — deterministic geometry
### Public geometry contract
```ts
export interface Point { x: number; y: number }
export interface Rect extends Point { width: number; height: number }
export interface Insets {
  headerH: number;
  footerH: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface TextRun {
  text: string;
  colorRole: "primary" | "muted" | "ipv4" | "ipv6" | "inverse";
}
export interface PlacedLabel {
  id: Id;
  subjectId: Id;
  mask: Rect;
  fontSize: number;
  baseline: Point;
  runs: readonly TextRun[];
}
export interface PlacedBoundary {
  id: Id;
  parentId?: Id;
  level: "cloud" | "region" | "network" | "az" | "subnet";
  paint: Rect;
  content: Rect;
  labelIds: readonly Id[];
}
export interface PlacedNode {
  id: Id;                 // Paint-instance ID.
  resourceId: Id;         // Semantic resource ID.
  attachmentId?: Id;
  ownerScopeId: Id;
  cell: Rect;             // Icon + labels + required local clearance.
  body: Rect;             // Endpoint/obstacle envelope.
  glyph: "gateway" | "compute" | "service" | "external";
  labelIds: readonly Id[];
}
export interface PlacedRoute {
  edgeId: Id;
  sourceNodeId: Id;
  targetNodeId: Id;
  points: readonly Point[];
  sourceFace: Face;
  targetFace: Face;
  crossingScopeIds: readonly Id[];
  labelIds: readonly Id[];
}
export interface LayoutScene {
  viewId: Id;
  viewBox: Rect;
  boundaries: readonly PlacedBoundary[];
  nodes: readonly PlacedNode[];
  frames: readonly {
    id: Id;
    segments: readonly Rect[];
    memberInstanceIds: readonly Id[];
  }[];
  routes: readonly PlacedRoute[];
  labels: readonly PlacedLabel[];
  cards: readonly {
    id: Id;
    tableId: Id;
    rect: Rect;
    destinationWidth: number;
    rowHeights: readonly number[];
    labelIds: readonly Id[];
  }[];
  badges: readonly {
    id: Id;
    hostEdgeId: Id;
    rect: Rect;
    number: number;
  }[];
  legend: {
    rect: Rect;
    entryIds: readonly Id[];
    labelIds: readonly Id[];
  };
}
```
Use integer fixed-point coordinates internally, for example units of `1/64 px`. Round consistently before final validation and serialization. Never quantize after validation without rechecking.
### Token policy
**Note — medium:** The normalized knowledge base differs from the measured source:
- Dashed VPC: `docs/algorithms.md:56–57` versus solid measured VPC, `docs/stratus-renderer-spec.md:22`.
- Circular badge: `docs/algorithms.md:124` versus measured rounded square, `docs/stratus-renderer-spec.md:128`.
- Clearance: knowledge base’s 4px gate versus renderer spec’s 8px inflated masks at `docs/stratus-renderer-spec.md:612`.
Recommended generated profile:
- Dashed Region/VPC/AZ; filled subnet panels.
- Rounded-square 28px badges, matching the measured construct.
- 8px label clearance, satisfying the stricter rule.
- Explicitly call this **normalized**, not an exact reference reproduction.
Base insets:
| Level | Header | Left | Right | Top | Bottom | Footer |
|---|---:|---:|---:|---:|---:|---:|
| Cloud | 44 | 40 | 16 | 4 | 20 | 0 |
| Region | 44 | 40 | 40 | 16 | 24 | 0 |
| Network | 60 | 32 | 32 | 24 | 24 | 0 |
| AZ | 0 | 24 | 24 | 16 | 16 | 32 |
| Subnet | 56 | 12 | 12 | 12 | 12 | 0 |
Apply the user’s preference as `ceil(basePadding × 1.25)` to left/right/top/bottom. Do not multiply headers or add the header reserve twice. Grow header/footer heights when measured text requires it.
### Algorithm
```text
layout(validatedSpec, metrics, profile, view):
    canonicalize:
        sort unordered entities by (order ?? 0, binary ID)
        preserve semantic arrays: route stages, explicit view order
        derive parent index, geography index, ownership ancestors
        expand multi-subnet resources into labeled attachment instances
        reject ambiguous edges to multi-instance resources
        derive traffic tiers; never invent a missing NAT/LB/data tier
    measure:
        load pinned font metrics and original glyph metrics
        compute glyph, label, title, CIDR, card, legend envelopes
        reserve labels as real obstacles before routing
    allocate:
        place external tier above Cloud
        allocate regional/network service tiers
        allocate contiguous AZ columns and subnet tier rows
        reserve route-card rails outside subnets
        reserve traffic corridors and membership-band title rails
        compact empty logical rows; keep intentional corridors explicit
    size bottom-up:
        for each sibling grid:
            pitchX = cellW + gapX
            pitchY = cellH + gapY
            gridW = cols * cellW + max(0, cols - 1) * gapX
            gridH = rows * cellH + max(0, rows - 1) * gapY
        for each boundary:
            width  = padLeft + contentW + padRight
            height = headerH + padTop + contentH + padBottom + footerH
    position top-down:
        childOrigin = (
            boundary.x + padLeft,
            boundary.y + headerH + padTop
        )
    assign ports and corridor tracks
    route obstacle-aware orthogonal bundles
    place edge labels; then place source badges
    build segmented membership frames from actual instances
    validate geometry
    for iteration in 0..7:
        if all geometry gates pass: finish
        apply next deterministic repair
        rebuild affected subtree sizes, ancestor sizes, ports and routes
        if state repeated or no permitted repair remains: break
    quantize and validate final geometry again
    if any error remains:
        return diagnostics, not a success scene
```
Grid minima:
```text
bare icon cell:       48 × 48
gateway + label:     144 × 88
compute/NAT cell:    112 × 88
public subnet:      230 × 160 minimum
private subnet:     230 × 150 minimum
AZ:                 310 × 420 minimum
route card:         190 × 116 minimum
icon-class gapX:     max(90, measured corridor requirement)
boundary-heavy gapY:max(56, measured corridor requirement)
AZ gapX:             max(80, required traffic bundle width)
```
These are minima, not fixed boxes. Two comfortable resource cells may require a subnet substantially wider than 230px.
For heterogeneous rows, use the maximum measured cell width per column and maximum height per row; compute cumulative pitches.
### Label measurement and readability
```text
fallbackUnits(text) = sum(CJK/full-width ? 2 : 1)
fallbackMaskW =
    6.5 * (fontSize / 13) * fallbackUnits(text) + 13
productionMaskW =
    max(pinnedMeasure(line)) + 2 * 6.5
maskH =
    lineCount * (1.2 * fontSize) + 2 * 3
clear corridor:
    gap > maskW + 8
recommended symmetric clearance:
    gap >= maskW + 16
```
Use height instead of width for a vertically constrained label.
Pinned metrics must agree with embedded fonts. Unsupported glyphs must produce a metric/coverage diagnostic rather than silently depending on host fonts.
```text
scale = min(availableDiagramW / viewBoxW,
            availableDiagramH / viewBoxH)
for every visible text run:
    projectedFontPx = fontSize * scale
    require projectedFontPx >= 6
```
At the recorded desktop width budget:
```text
availableDiagramW ≈ 930
minimum source font = 9
maximum width from width constraint = 930 * 9 / 6 = 1395
```
**1395px is conditional**, not a universal cap. Height can impose a stricter limit. Measure the actual HTML diagram area at 1440×900, 1600×1000, and 1920×1080.
Never satisfy overlap rules by shrinking text below the floor. If wider spacing makes a diagram unreadable, use declared focused views or report `VIEW_TOO_DENSE`.
### Shared-side ports and orthogonal routing
```text
for each (nodeInstance, face):
    sort incident edges by:
        remote endpoint projection, plane ID, edge ID
    usableSpan = faceLength - 2 * cornerInset
    portSpacing = max(10, arrowheadWidth + clearanceAllowance)
    if required slots do not fit:
        try another permitted face
        otherwise reserve an explicit fan-out rail with separate tracks
        never collapse unrelated edges onto one indistinguishable port
    portOffset(j) = centered offset for slot j
```
For circular gateway glyphs, use a declared rectangular **connection envelope** around the circle for spread ports. Cardinal single ports can touch the circle directly. Do not claim that arbitrary points on a circle have cardinal perpendicular normals.
```text
normal(left)   = (-1, 0)
normal(right)  = ( 1, 0)
normal(top)    = ( 0,-1)
normal(bottom) = ( 0, 1)
sourceStubEnd  = sourcePort + 16 * normal(sourceFace)
targetStubStart = targetPort + 16 * normal(targetFace)
```
Routing implementation:
```text
build an orthogonal visibility graph from:
    port stubs
    reserved lane coordinates
    inflated obstacle corners
    permitted semantic-boundary crossing slots
do not make whole enclosing boundaries opaque obstacles:
    block headers, tabs, labels, cards and leaf bodies
    permit only expected ancestor-boundary crossings
route with deterministic Dijkstra/A*:
    state = position + incoming direction + current straight-run length
    reject reversals and turns violating segment floors
    tie-break by (cost, bend count, length, lexicographic path)
route same-corridor traffic planes as a coordinated bundle:
    centerline separation >= 10
    corridorW >= (trackCount - 1) * 10 + strokeW + 16
    allocate bend boxes to preserve order through turns
normalize:
    remove duplicate points
    merge same-direction collinear runs
    reject backtracking rather than hiding it
```
Every final nonzero segment must be at least 8px; interior segments at least 16px. Generated endpoint stubs should be at least 16px. Side contracts must hold after normalization.
### Repair order
1. Recheck final-font measurements.
2. Move labels among permitted anchor slots.
3. Wrap at semantic separators; preserve complete CIDR tokens.
4. Slide badges along the host route or offset them perpendicularly.
5. Move edges to another reserved track.
6. Expand local gaps/panels and propagate changes upward.
7. Use author-approved `shortText`; never rewrite semantic facts.
8. Recompute routing and validation.
9. Return an actionable density diagnostic if still infeasible.
Only omit a redundant display label when an explicit alternate presentation supplies the same information. Cross-boundary semantic labels remain mandatory.
## 3. `src/renderer.ts` — SVG and standalone HTML
Renderer responsibility: **serialize validated geometry**, never perform a second layout.
```ts
export type Theme = "light" | "dark";
export interface RenderOptions {
  theme: Theme;
  interactive: boolean;
}
export interface RenderedDocument {
  svg: string;
  html: string;
}
export function renderSvg(
  spec: StratusSpec,
  scene: LayoutScene,
  receipt: ValidationReceipt,
  options: RenderOptions
): string;
export function renderHtml(
  svg: string,
  spec: StratusSpec,
  receipt: ValidationReceipt,
  options: RenderOptions
): string;
```
### Paint order
```text
<svg>
  title + accessible description
  defs: original glyph symbols, arrow markers, embedded font/style
  background
  boundary/subnet fills, parent-first
  membership-band fills
  boundary strokes and membership-band outlines
  traffic and association paths
  resource glyphs
  route-table cards
  boundary labels and resource labels
  edge labels and numbered badges
  legend
</svg>
```
Label masks are backgrounds, **not collision repairs**. A renderer must not conceal a route that the validator found crossing a label.
### Boundary and glyph styles
| Element | Generated normalized treatment |
|---|---|
| Cloud | Solid navy outline, corner tab, original cloud/provider lettermark |
| Region | Blue dashed outline, title/tab |
| VPC/VNet/network | Dashed provider/network accent, two-line title/address header |
| AWS AZ slice | Dashed blue column, footer-centered label |
| Subnet | Green/blue filled panel, original lock-like geometric mark |
| SG/NACL band | Low-opacity segmented band, membership label; no isolation claim |
| Gateway | Approximately 48px circular envelope, original geometric mark |
| Compute | Approximately 40px chip/square with pins |
| Badge | 28px rounded square, radius 5px |
PRD R009 requires original geometric glyphs. Do not reproduce official AWS glyph paths even though the measured reference identifies their shapes.
### CIDR text
Use sibling `<tspan>` elements sharing a baseline:
```text
IPv4 run: dark or boundary accent, theme-controlled
separator: " + "
IPv6 run: orange, theme-controlled
```
Measure the sum of run widths. If wrapping, place the IPv6 CIDR on the next line as a complete token.
### Route-table cards
Cards render `RouteTable.rows`; do not maintain a second copy of routing prose.
```text
headerH = 21
columnHeadingH = 19
rowH = max(19, measured line height + padding)
destinationW = max(heading and destination text widths) + 8
targetW      = max(heading and target text widths) + 8
cardW = max(190, destinationW + targetW, titleWidth + 16)
cardH = headerH + columnHeadingH + sum(rowHeights)
```
Use a blue title bar, `Destination | Target` headings, thin row separators, and optional theme-controlled alternating rows. Position cards in reserved side rails outside subnets. Cards are explanatory objects, not edge endpoints or packet hops.
### Source-end numbered badges
```text
preferred arc distance = 20
minimum center distance for 28px badge = 14 + 10 = 24
start at max(20, 24)
slide forward until badge clears source body AND source labels by 10px
otherwise offset perpendicular to the route
```
Keep the badge tied to its semantic edge. Its intersection with its own host route is intentional; intersections with unrelated routes/glyphs are not.
### Themes and legend
Use fixed CSS variables; themes must not change font metrics, stroke widths, or geometry.
Legend entries are generated from actually used semantics:
- IPv4 NAT, private IPv6, public dual-stack and internet paths.
- Association versus request versus service-target relationship.
- Semantic boundaries versus membership bands.
- Async or emphasized variants when present.
Start with a 24px line sample, 8px sample-to-text gap, and 20px row pitch. Measure and reserve the legend before final viewBox sizing.
### Safe single-file HTML
```text
trusted static template + trusted static interaction code
escaped SVG text and attributes
escaped JSON data payload
embedded font assets
no remote URLs or dependency loads
```
Required implementation rules:
- Build SVG using trusted element/attribute names.
- Escape `& < > " '` for text/attribute contexts.
- Generate SVG IDs from validated internal identifiers; never concatenate labels into CSS selectors or URLs.
- No spec-provided `style`, raw SVG, HTML, event attributes, external `href`, or script.
- Embed JSON in `<script type="application/json">`, replacing `<` with `\u003c` and escaping U+2028/U+2029.
- Parse payload with `JSON.parse(element.textContent)`.
- Use `textContent` for interactive details; never `innerHTML`, `eval`, or `new Function`.
- Add a restrictive CSP with hashes for the fixed inline script/style and only the necessary embedded font/image allowances.
- Include receipts as inert data and a concise visible validation summary.
Test hostile strings in **every** text-bearing field, including route targets, metadata, legend labels, diagnostics, and titles—not just resource names.
## 4. `src/validator.ts` — typed deterministic gates
Validation has distinct phases: decoding, semantics, layout, and export readiness.
```ts
export type Severity = "error" | "warning" | "unknown" | "info";
export type Phase = "schema" | "semantic" | "layout" | "export";
export type DiagnosticCode =
  | "SCHEMA_INVALID"
  | "ID_DUPLICATE"
  | "REFERENCE_MISSING"
  | "CONTAINMENT_INVALID"
  | "PLACEMENT_INVALID"
  | "PROVIDER_SCOPE_INVALID"
  | "FACT_UNKNOWN"
  | "CIDR_INVALID"
  | "CIDR_OUTSIDE_PARENT"
  | "CIDR_OVERLAP"
  | "EDGE_ENDPOINT_INVALID"
  | "EDGE_INSTANCE_AMBIGUOUS"
  | "EDGE_LABEL_REQUIRED"
  | "ROUTING_FACT_INCONSISTENT"
  | "LABEL_FIT"
  | "LABEL_CLEARANCE"
  | "PROJECTED_FONT_FLOOR"
  | "BOUNDARY_OVERLAP"
  | "BOUNDARY_COINCIDENT_EDGE"
  | "EDGE_THROUGH_NODE"
  | "ROUTE_NOT_ORTHOGONAL"
  | "ROUTE_SIDE_CONTRACT"
  | "ROUTE_MICRO_SEGMENT"
  | "ROUTE_BORDER_RUN"
  | "ROUTE_SEPARATION"
  | "BADGE_CLEARANCE"
  | "VIEW_TOO_DENSE";
export type SupportedFix =
  | {
      kind: "edit-spec";
      pointer: string;
      instruction: string;
    }
  | {
      kind: "layout";
      action:
        | "move-label"
        | "wrap-label"
        | "spread-ports"
        | "reroute"
        | "expand-gap"
        | "expand-boundary";
      subjectIds: readonly Id[];
    }
  | {
      kind: "choose-short-label";
      subjectId: Id;
      text: string;
    }
  | {
      kind: "split-view";
      subjectIds: readonly Id[];
      reason: string;
    };
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  phase: Phase;
  message: string;
  subjects: readonly Id[];
  pointer?: string; // JSON Pointer into original input.
  evidence: {
    rule: string;
    actual?: string | number | boolean;
    expected?: string | number | boolean;
    rectangles?: readonly Rect[];
    segment?: { start: Point; end: Point };
    relatedPointers?: readonly string[];
  };
  supportedFixes: readonly SupportedFix[];
}
export interface GateResult {
  id: string;
  phase: Phase;
  status: "passed" | "failed" | "unknown" | "not-applicable";
  diagnostics: readonly Diagnostic[];
}
export interface ValidationReceipt {
  schemaVersion: 1;
  engineVersion: string;
  specHash: string;
  sceneHash?: string;
  metricsHash: string;
  profileId: string;
  gates: readonly GateResult[];
  referenceGrade: "eligible" | "blocked" | "unknown";
  scope: "diagram-spec-conformance-not-cloud-security";
}
export interface Check<C> {
  id: string;
  phase: Phase;
  run(context: C): GateResult;
}
```
Do not include timestamps, runtime durations, JEV responses, or machine-local paths in deterministic receipts.
### Gate behavior
| Gate | Implementation and actionable outcome |
|---|---|
| Schema | Reject unexpected fields, wrong provider branches, malformed unions, unsupported versions, excessive depth/size. Return original JSON Pointer. |
| Containment | Traverse the tree; index every ID; verify permitted child kinds and geography references. AWS subnet has one AZ-slice parent. GCP/Azure subnet cannot be under a zone. |
| Placement | Verify every attachment exists; enforce distinct multi-placement entries; validate region/network consistency and single semantic ownership. |
| Provider scope | Resolve `service` in pinned `src/cloud.ts`; enforce service-specific legal placements, exposure variants and attachment cardinalities. Unknown service capabilities remain unknown. |
| CIDR | Parse family/prefix/address exactly; reject malformed ranges and unintended host bits. Apply provider-specific containment and overlap rules. |
| Endpoints | Resolve every endpoint and attachment. Reject ambiguous multi-instance connections; do not silently pick the first subnet. |
| Cross-boundary labels | Compute endpoint ancestor chains and crossed scopes; require non-whitespace semantic labels. For instance edges, use the selected placements. |
| Routing facts | Verify referenced table rows/listeners/attachments and next hops agree. Validate family transformations. Partial route knowledge cannot prove selection. |
| Label fit | Use final metrics to compare required width/height with allotted slot at permitted source fonts and projected floor. |
| Boundary overlap | Non-ancestor semantic boundaries must be disjoint. Ancestor overlap is valid only when the child paint box fits the parent content box. |
| Coincident edges | Detect parallel collinear boundary edges with overlapping extents, including identical rectangles. True containment does not exempt coincident borders. |
| Leaf collision | Routes cannot intersect unrelated bodies inflated by 8px. Endpoint exemption covers only the assigned approach segment. |
| Orthogonality | Every normalized segment is horizontal or vertical within 0.01px tolerance. |
| Side contract | First segment follows source outward normal; final segment opposes target outward normal. |
| Micro-segments | No zero-length remnants; every segment ≥8px; interior segments ≥16px. |
| Label-route clearance | Every label mask clears routes and unrelated bodies by 8px; place edge labels off-route rather than hiding their own edge. |
| Border run | Error when an edge runs parallel within 4px of a boundary for a projected overlap of at least 16px. |
| Parallel separation | Maintain 10px bundle centerline separation; check arrowhead geometry separately. |
| Badge clearance | At least 10px from unrelated glyphs and labels; own host route is the narrow exception. |
| Readability | Check all visible text using final scene width **and height**, including legend, cards and badge numerals. |
Membership frames receive a separate overlap policy:
- May intersect semantic boundaries and other membership bands.
- May not obscure labels, glyphs, or edge semantics.
- Frame membership must agree with the referenced policy.
- A broad band must not visually classify nonmembers as members.
- They never exempt semantic boundary rectangles from containment checks.
### CIDR algorithm
```text
parseCIDR(value):
    parse address into unsigned BigInt
    bits = 32 or 128
    validate prefix in [0, bits]
    hostBits = bits - prefix
    start = (address >> hostBits) << hostBits
    end = start + (1 << hostBits) - 1
    require address == start, or return explicit normalization diagnostic
contains(parent, child):
    same family &&
    parent.start <= child.start &&
    child.end <= parent.end
overlaps(a, b):
    same family &&
    max(a.start, b.start) <= min(a.end, b.end)
```
Check subnet overlap across the **entire network**, not merely immediate tree siblings. AWS subnets in different AZ slices are still siblings for address allocation.
- AWS: subnet ranges must fit a declared VPC range.
- Azure: subnet ranges must fit a declared VNet range.
- GCP: no invented global VPC CIDR; validate subnet ranges within network scope using pinned provider range rules.
- Distinct disconnected VPCs may reuse CIDRs. Evaluate peering/transit requirements separately rather than globally banning reuse.
For route selection, longest-prefix matching is only one stage. Apply provider-specific priorities and route kinds; return unknown when the supplied tables or destination facts are insufficient.
### Example diagnostic
```json
{
  "code": "ROUTE_MICRO_SEGMENT",
  "severity": "error",
  "phase": "layout",
  "message": "Edge private6-egress has a 10px interior segment; at least 16px is required.",
  "subjects": ["private6-egress"],
  "evidence": {
    "rule": "normalized.route.interior-minimum",
    "actual": 10,
    "expected": 16,
    "segment": {
      "start": { "x": 420, "y": 266 },
      "end": { "x": 430, "y": 266 }
    }
  },
  "supportedFixes": [
    {
      "kind": "layout",
      "action": "reroute",
      "subjectIds": ["private6-egress"]
    },
    {
      "kind": "layout",
      "action": "expand-gap",
      "subjectIds": ["private6-egress"]
    }
  ]
}
```
Sort diagnostics by phase, code, subject IDs, pointer, then evidence. Keep deterministic validation independent from advisory evaluation/JEV.
Unknown facts may still permit an explicitly incomplete draft rendering. They do not become “passed,” “secure,” or reference-grade.
## 5. Module composition and test strategy
### Proposed module structure
```text
schemas/
  cloud.schema.json
src/
  schema.ts          Public spec types, decoding result types
  cloud.ts           Versioned provider catalog and placement capabilities
  normalize.ts       Canonical ordering, indexes, derived ownership
  cidr.ts            BigInt parsing, containment, overlap
  network.ts         Provider route-selection checks and fact consistency
  metrics.ts         Pinned font/glyph measurements
  geometry.ts        Rect/segment predicates, ports, route normalization
  profiles.ts        Insets, spacing, palettes, typography, gate thresholds
  layout.ts          LayoutScene generation and bounded deterministic repair
  validator.ts       Schema/semantic/layout checks and receipts
  glyphs.ts          Original geometric glyph definitions
  renderer.ts        SVG and safe standalone HTML serialization
  export.ts          SVG/HTML/PDF/raster/slides adapters
  pipeline.ts        Shared entry point; no CLI-only validation logic
  presets.ts         Provider-specific progressive-disclosure fixtures
  evaluate.ts        Separately attributed structural/perceptual reports
  jev.ts             Optional consent-bound advisory adapter
  cli.ts             Command wrappers
tests/
  run-tests.mjs
  schema.test.mjs
  semantic.test.mjs
  layout.test.mjs
  renderer.test.mjs
  export.test.mjs
  fixtures/{aws,gcp,azure}/{valid,invalid}/
  goldens/
```
### Exported responsibilities
| Module | Main exports |
|---|---|
| `schema.ts` | Types, `decodeSpec(unknown)` |
| `normalize.ts` | `normalizeSpec`, `buildIndexes`, `canonicalJSON` |
| `cloud.ts` | `catalog`, `getCapability` |
| `cidr.ts` | `parseCIDR`, `containsCIDR`, `overlapsCIDR` |
| `validator.ts` | `validateSemantic`, `validateLayout`, `buildReceipt` |
| `layout.ts` | `layoutSpec` |
| `renderer.ts` | `renderSvg`, `renderHtml` |
| `export.ts` | `exportArtifact` |
| `pipeline.ts` | `compileDiagram` |
| `presets.ts` | `getPreset`, `listPresets` |
### Pipeline
```text
unknown JSON
  → decode against JSON Schema
  → semantic validation
  → normalize and index valid facts
  → layout each selected view
  → final geometry validation
  → machine-readable receipt
  → SVG
  → standalone HTML / SVG / PDF / raster / slides
```
```text
compileDiagram(input, options):
    decoded = decodeSpec(input)
    if invalid:
        return failed receipt
    semantic = validateSemantic(decoded.spec)
    if semantic contains errors:
        return failed receipt
    normalized = normalizeSpec(decoded.spec)
    scenes = layoutSpec(normalized, pinnedMetrics, options)
    geometry = validateLayout(normalized, scenes)
    receipt = buildReceipt(semantic, geometry)
    if geometry contains errors:
        return diagnostics; no successful export claim
    if required facts remain unknown:
        allow only explicitly marked draft artifacts
    svg = renderSvg(normalized, scenes, receipt)
    html = renderHtml(svg, normalized, receipt)
    return artifacts and receipt
```
Archify’s useful contract pattern is visible at the supplied
`archify/renderers/architecture/render-architecture.mjs:1065–1078`: validation precedes writing. Reuse that **pattern**, not its flat wrap-list layout or renderer implementation.
PDF/raster/slides must consume the same validated SVG geometry. Do not relayout per export format.
- SVG/HTML: exact-byte determinism.
- PNG: fixed browser, font assets, viewport and device scale.
- PDF/PPTX: normalize metadata where possible; otherwise attest geometry/content determinism, not unsupported byte equality.
- Every artifact carries the receipt or an inseparable receipt manifest.
- Advisory metadata remains separate from golden artifacts.
### T001: executable test foundation
**Note — medium:** `tests/run-tests.mjs:12–14` exits successfully when no tests exist. Running it currently prints:
```text
no test files yet — suite lands with T001
```
That is a successful runner invocation, **not validation coverage**.
For T001:
1. Pin TypeScript, the JSON Schema validator, and the TypeScript runtime loader in the lockfile.
2. Use a Node-20-compatible loader such as pinned `tsx`; do not assume native TypeScript execution.
3. Have `run-tests.mjs` spawn tests with the loader enabled.
4. Fail when no test files exist.
5. Fail explicitly on spawn error, signal, timeout, or nonzero exit.
6. Run offline after dependency setup.
Verification commands:
```sh
npx --no-install tsc --noEmit
node tests/run-tests.mjs
```
### Required fixture matrix
| Area | Valid fixture | Invalid fixture |
|---|---|---|
| AWS placement | ALB across two public subnets; app ASG; RDS active/standby attachments | Subnet in wrong AZ; duplicate attachment; managed control plane owned by private subnet |
| GCP scope | Global VPC with regional subnets and zonal compute | Global VPC forced under one region; subnet nested under zone |
| Azure scope | Regional VNet/subnet with multi-zone resources | Subnet given AWS-style AZ parent |
| CIDR | Dual-stack ranges; disconnected VPC reuse | Cross-AZ subnet overlap; child outside parent; malformed IPv6 |
| Edge semantics | Separate Lattice association/request/target edges | Missing endpoint, unlabeled boundary crossing, ambiguous multi-instance endpoint |
| Routing | TGW→attachment then VPC→firewall endpoint | TGW route targets firewall endpoint directly |
| IPv6 | Explicit node prefix and individual pod address | Subnet prefix rendered as pod address |
| Frames | SG band crossing two tiers with correct membership | Band includes nonmembers; identical Region/VPC border |
| Layout | Comfortable spacing and readable detail | Long label, short segment, border run, shared-port collapse |
| Security | Hostile text rendered literally | Any script execution, external fetch, event attribute or HTML injection |
Do not require JSON Schema alone to reject cross-reference or CIDR errors. Assert agreement between TypeScript decoding and JSON Schema on **structural validity**; semantic-invalid fixtures should pass structural decoding and then fail the appropriate semantic gate.
### Determinism and regression tests
- Run identical spec/theme/metrics twice and compare canonical scene, SVG, HTML and receipt bytes.
- Permute unordered input collections; bytes should remain identical.
- Preserve explicitly ordered routing stages and view order.
- Test both themes with identical geometry.
- Golden-test labels, cards, badges, legend and full boundary stacks.
- Assert semantic invariants independently from golden snapshots.
- Property-test CIDR overlap symmetry, containment transitivity and route normalization idempotence.
- Test rounding thresholds around 8px, 16px, 4px border proximity and 6px projected fonts.
- Use pinned browser tests for font readiness, no scroll overflow and zero network access.
- Add adversarial tests for `</script>`, HTML entities, SVG attributes, Unicode, oversized data and deeply nested input.
- Keep the four existing proofs as **migration/regression inputs**, not unquestioned valid Stratus fixtures.
Build presets along the recorded ladder: simple VPC → ALB/targets → three-tier → endpoint → VPN → TGW. Every step must be a complete readable view; network-detail route cards belong in the appropriate detail view.
### Review disposition
- **Correct:** The measured renderer spec supplies implementable geometry, routing contracts and repair order.
- **Fixed:** None; read-only task.
- **Blocker:** Existing proof semantics and flat boundaries must be corrected before they become reference-grade Stratus goldens.
- **Note:** The proposed interfaces and algorithms have not been compiled or exercised against an implementation. T001 schema/validator fixtures are the next implementation step; layout and rendering acceptance remain subsequent work.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Read the three design documents, all four proof specs, and the supplied archify schema/renderer. Reported path-and-line findings with severity and supplied concrete schema interfaces, layout pseudocode, renderer structure, validator contracts, module exports, and tests."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "cd /home/fakoli/code/stratus && node tests/run-tests.mjs",
      "result": "passed",
      "summary": "Runner exited successfully but reported no test files; this is not implementation validation."
    },
    {
      "command": "cd /home/fakoli/code/stratus && git diff --stat",
      "result": "passed",
      "summary": "No tracked working-tree diff reported."
    },
    {
      "command": "cd /home/fakoli/code/stratus && git diff --cached --quiet",
      "result": "passed",
      "summary": "Exit 0; no staged changes."
    },
    {
      "command": "npx --no-install tsc --noEmit",
      "result": "not-run",
      "summary": "Suggestions are report-only; no implementation was created or typechecked."
    }
  ],
  "validationOutput": [
    "Existing test runner output: no test files yet — suite lands with T001.",
    "Verified identical Region/VPC wrap-lists in the distributed firewall proof.",
    "Verified conflated Lattice edges, EKS placement/addressing issues, and centralized firewall routing-stage prose.",
    "Verified conflicting measured versus normalized styling guidance; recommended explicit normalized defaults."
  ],
  "residualRisks": [
    "Proposed interfaces and algorithms require implementation, compilation, and fixture validation.",
    "Comfortable spacing can exceed the desktop font budget; focused views may be necessary.",
    "Provider service capabilities and routing precedence require versioned catalog rules; incomplete facts must remain unknown.",
    "Font coverage and metrics must be pinned to achieve dependable geometry and byte determinism.",
    "PDF and slide byte determinism depends on exporter metadata normalization.",
    "No browser checks or external provider-document verification were performed during this read-only review."
  ],
  "noStagedFiles": true,
  "diffSummary": "No files edited; implementation suggestions only.",
  "reviewFindings": [
    "blocker/high: diagrams/firewalls-distributed.architecture.json:17-18 — identical Region/VPC wrap-lists create coincident initial boundaries.",
    "blocker/high: diagrams/eks-ipv6.architecture.json:14,21-22 — pod prefix wording and control-plane subnet membership require correction.",
    "blocker/high: diagrams/vpc-lattice.architecture.json:25-28 — service-network associations and service-target traffic are not separately modeled.",
    "blocker/high: diagrams/firewalls-centralized.architecture.json:32 — routing prose conflates TGW attachment routing with VPC firewall-endpoint routing.",
    "note/medium: docs/PRD.md:90 — no-containment-tree wording conflicts with the current task; this proposal follows the current request.",
    "note/medium: docs/algorithms.md:119-124 versus docs/stratus-renderer-spec.md:22,128 — normalized boundary/badge styling differs from measured source.",
    "note/medium: tests/run-tests.mjs:12-14 — an empty suite exits successfully."
  ],
  "manualNotes": "Read-only scope honored. No worktree, commits, or PR were created. Remaining work begins with T001 schema, validator core, and executable provider fixtures."
}
```

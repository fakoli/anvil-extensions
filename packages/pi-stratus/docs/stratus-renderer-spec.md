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
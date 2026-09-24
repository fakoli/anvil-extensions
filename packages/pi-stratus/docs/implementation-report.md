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

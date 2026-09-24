// Deterministic layout engine (T002) — LayoutScene generation with bounded
// deterministic repair. Implemented from the lead-engineer report §2:
// canonicalize → measure → allocate → size bottom-up → position top-down →
// ports → route → labels → badges → frames → validate → repair (0..7).

import type { StratusSpec, Face } from "./schema.ts";
import type { NormalizedIndexes } from "./normalize.ts";
import { ancestorChain } from "./normalize.ts";
import { insetsFor, GRID_MINIMA, THRESHOLDS, FONT, faceNormal, type BoundaryLevel } from "./profiles.ts";
import { fallbackMaskW, maskH, wrapText } from "./metrics.ts";
import { glyphPaintBounds } from "./glyphs.ts";
import {
  type Rect, type Point, portOnFace, faceLength, normalizePolyline, quantize,
  isOrthogonal, segmentViolations, sideContractViolations, borderRun,
  segmentsIntersect, rectsOverlap,
} from "./geometry.ts";

export interface PlacedLabel {
  id: string;
  subjectId: string;
  mask: Rect;
  fontSize: number;
  baseline: Point;
  runs: readonly { text: string; colorRole: "primary" | "muted" | "ipv4" | "ipv6" | "inverse" }[];
}

export interface PlacedBoundary {
  id: string;
  parentId?: string;
  level: BoundaryLevel;
  paint: Rect;
  content: Rect;
  labelIds: readonly string[];
  /** Declared subnet classification (public/private/isolated) when known. */
  classification?: string;
  /** The owner scope id this boundary represents (explicit, no ID parsing). */
  scopeId?: string;
}

export interface PlacedNode {
  id: string;
  resourceId: string;
  attachmentId?: string;
  ownerScopeId: string;
  cell: Rect;
  body: Rect;
  glyph: "gateway" | "compute" | "service" | "external" | "data" | "security";
  labelIds: readonly string[];
}

export interface PlacedRoute {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  points: readonly Point[];
  sourceFace: Face;
  targetFace: Face;
  crossingScopeIds: readonly string[];
  labelIds: readonly string[];
  /** Edge semantics carried into paint: kind, family, variant, direction. */
  kind: "association" | "request" | "service-target";
  family: "ipv4" | "ipv6" | "dual" | "none";
  variant: "solid" | "dashed" | "dotted";
  direction: "forward" | "reverse";
}

export interface LayoutScene {
  viewId: string;
  viewBox: Rect;
  /** View selection: focused ids and detail level from the declared view. */
  focusIds: readonly string[];
  detail: "overview" | "network-detail";
  boundaries: readonly PlacedBoundary[];
  nodes: readonly PlacedNode[];
  frames: readonly { id: string; segments: readonly Rect[]; memberInstanceIds: readonly string[] }[];
  routes: readonly PlacedRoute[];
  labels: readonly PlacedLabel[];
  cards: readonly { id: string; tableId: string; rect: Rect; destinationWidth: number; rowHeights: readonly number[]; labelIds: readonly string[]; headerLineY?: number; headingsY?: number; firstRowY?: number; rowBaselines?: number[] }[];
  badges: readonly { id: string; hostEdgeId: string; rect: Rect; number: number }[];
  legend: { rect: Rect; entryIds: readonly string[]; labelIds: readonly string[] };
}

export interface LayoutOptions {
  viewId?: string;
  flow?: "top-down" | "left-right";
  /** View focus/detail from the spec's views array (view selection). */
  focusIds?: readonly string[];
  detail?: "overview" | "network-detail";
}

interface NodeInput {
  instanceId: string;
  resourceId: string;
  attachmentId?: string;
  ownerScopeId: string;
  label: string;
  sublabel?: string;
  glyph: PlacedNode["glyph"];
  tier: string;
}

interface VpcGroup {
  vpcId: string;
  label: string;
  /** Owning region id — regions lay out side by side, provider-true. */
  regionId: string;
  vpcScoped: NodeInput[];
  azColumns: { azId: string; label: string; subnets: { id: string; label: string; classification: string; tier: string; resources: NodeInput[] }[] }[];
}

const GATEWAY_SERVICES = new Set([
  "internet-gateway", "egress-only-internet-gateway", "nat-gateway", "nat64",
  "transit-gateway", "vpn-gateway", "application-load-balancer", "network-load-balancer",
  "api-gateway", "route53", "cloudfront",
]);

const DATA_SERVICES = new Set([
  "rds", "dynamodb", "elasticache", "redshift", "aurora", "read-replica",
  "bigtable", "spanner", "firestore", "sql-database", "cosmos-db", "blob-storage",
]);

const SECURITY_SERVICES = new Set([
  "security-group", "nacl", "network-acl", "web-acl", "firewall", "network-firewall",
  "iam-role", "kms", "secrets-manager", "certificate-manager",
]);

function glyphFor(service: string, managedBy: string): PlacedNode["glyph"] {
  const bare = service.includes(".") ? service.slice(service.indexOf(".") + 1) : service;
  if (GATEWAY_SERVICES.has(bare)) return "gateway";
  if (DATA_SERVICES.has(bare)) return "data";
  if (SECURITY_SERVICES.has(bare)) return "security";
  if (managedBy === "provider") return "service";
  return "compute";
}

function cellSizeFor(glyph: PlacedNode["glyph"]): { w: number; h: number } {
  if (glyph === "gateway") return { w: GRID_MINIMA.gatewayCell.w, h: GRID_MINIMA.gatewayCell.h };
  if (glyph === "external") return { w: GRID_MINIMA.computeCell.w, h: GRID_MINIMA.computeCell.h };
  if (glyph === "data") return { w: GRID_MINIMA.bareIconCell.w, h: GRID_MINIMA.bareIconCell.h };
  if (glyph === "security") return { w: GRID_MINIMA.bareIconCell.w, h: GRID_MINIMA.bareIconCell.h };
  return { w: GRID_MINIMA.computeCell.w, h: GRID_MINIMA.computeCell.h };
}

/**
 * Deterministic layout: allocate the boundary stack (Cloud → Region → Network
 * → AZ columns → Subnet tier rows → resource cells), size bottom-up, position
 * top-down, route orthogonally through reserved corridors, then validate.
 */
export function layoutSpec(
  spec: import("./schema.ts").StratusSpec,
  indexes: NormalizedIndexes,
  options: LayoutOptions = {},
): { scene: LayoutScene; diagnostics: readonly { code: string; severity: string; message: string; subjects: readonly string[] }[] } {
  const diagnostics: { code: string; severity: string; message: string; subjects: readonly string[] }[] = [];
  const labels: PlacedLabel[] = [];
  const nodes: PlacedNode[] = [];
  const boundaries: PlacedBoundary[] = [];
  const routes: PlacedRoute[] = [];
  // Left-right flow rotates the tier orientation: the external tier becomes
  // the left column and tiers flow rightward (transposed canvas).
  const flow: "top-down" | "left-right" = options.flow ?? "top-down";
  const badges: { id: string; hostEdgeId: string; rect: Rect; number: number }[] = [];
  const cards: { id: string; tableId: string; rect: Rect; destinationWidth: number; rowHeights: number[]; labelIds: string[]; headerLineY?: number; headingsY?: number; firstRowY?: number; rowBaselines?: number[] }[] = [];
  const frames: { id: string; segments: Rect[]; memberInstanceIds: string[] }[] = [];

  let labelSeq = 0;
  const addLabel = (subjectId: string, text: string, fontSize: number, baseline: Point, colorRole: PlacedLabel["runs"][number]["colorRole"]): PlacedLabel => {
    const lines = wrapText(text, 220, fontSize);
    const w = Math.max(...lines.map((l) => fallbackMaskW(l, fontSize)));
    const h = maskH(lines, fontSize);
    const label: PlacedLabel = {
      id: `lbl-${labelSeq++}`,
      subjectId,
      mask: { x: quantize(baseline.x - w / 2), y: quantize(baseline.y - h), width: quantize(w), height: quantize(h) },
      fontSize,
      baseline,
      runs: [{ text, colorRole }],
    };
    labels.push(label);
    return label;
  };

  // ---- Collect paint instances ----
  const externals: NodeInput[] = spec.externals.map((e) => ({
    instanceId: `inst-${e.id}`, resourceId: e.id, ownerScopeId: "cloud",
    label: e.label, glyph: "external", tier: "ingress",
  }));

  const regionScoped: NodeInput[] = [];
  const cloudScoped: NodeInput[] = [];
  const vpcGroups: VpcGroup[] = [];
  // Paint geometry: linked visual instances for multi-subnet resources.
  const subnetInstances = new Map<string, NodeInput[]>();
  const membershipGroups: { resourceId: string; label: string; instanceIds: string[] }[] = [];
  const primaryInstanceByResource = new Map<string, string>();

  const collectResources = (resources: readonly { id: string; label: string; service: string; tier: string }[], ownerScopeId: string): NodeInput[] => {
    return resources.filter((r) => r !== null && r !== undefined).map((r) => ({
      instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId,
      label: r.label, glyph: glyphFor(r.service, "customer"), tier: r.tier,
    }));
  };

  const collectVpcResource = (r: { id: string; label: string; service: string; tier: string; managedBy?: string; placement: { kind: string; attachment?: { id: string; label: string; subnetId: string }; attachments?: readonly { id: string; label: string; subnetId: string }[] } }, ownerScopeId: string, group: VpcGroup): void => {
    const glyph = glyphFor(r.service, r.managedBy ?? "customer");
    if (r.placement.kind === "single-subnet" && r.placement.attachment) {
      const att = r.placement.attachment;
      const node: NodeInput = { instanceId: `inst-${r.id}`, resourceId: r.id, attachmentId: att.id, ownerScopeId, label: r.label, glyph, tier: r.tier };
      const list = subnetInstances.get(att.subnetId) ?? [];
      list.push(node);
      subnetInstances.set(att.subnetId, list);
      primaryInstanceByResource.set(r.id, node.instanceId);
    } else if (r.placement.kind === "multi-subnet" && r.placement.attachments) {
      const instanceIds: string[] = [];
      r.placement.attachments.forEach((att, i) => {
        const node: NodeInput = {
          instanceId: `inst-${r.id}@${att.id}`, resourceId: r.id, attachmentId: att.id, ownerScopeId,
          label: i === 0 ? r.label : att.label, glyph, tier: r.tier,
        };
        const list = subnetInstances.get(att.subnetId) ?? [];
        list.push(node);
        subnetInstances.set(att.subnetId, list);
        instanceIds.push(node.instanceId);
      });
      if (instanceIds[0]) primaryInstanceByResource.set(r.id, instanceIds[0]);
      membershipGroups.push({ resourceId: r.id, label: r.label, instanceIds });
    } else {
      group.vpcScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId, label: r.label, glyph, tier: r.tier });
    }
  };

  // Cloud-level resources paint in a cloud-scoped tier row.
  for (const r of (spec.cloud as { resources?: readonly { id: string; label: string; service: string; tier: string; placement: { kind: string } }[] }).resources ?? []) {
    cloudScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: spec.cloud.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
  }
  if (spec.provider === "aws") {
    for (const region of spec.cloud.regions) {
      for (const r of region.resources ?? []) {
        regionScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: region.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
      }
      for (const vpc of region.vpcs) {
        const group: VpcGroup = { vpcId: vpc.id, label: vpc.label, regionId: region.id, vpcScoped: [], azColumns: [] };
        for (const r of vpc.resources ?? []) {
          collectVpcResource(r as never, vpc.id, group);
        }
        for (const az of vpc.azs) {
          const column = { azId: az.id, label: `AZ ${az.zone.zone}`, subnets: [] as { id: string; label: string; classification: string; tier: string; resources: NodeInput[] }[] };
          // AZ-scoped resources paint in the AZ column as a scoped tier row.
          for (const r of az.resources ?? []) {
            column.subnets.push({
              id: `az-scoped-${r.id}`, label: r.label, classification: "scoped", tier: "auxiliary",
              resources: [{ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: az.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier }],
            });
          }
          for (const subnet of az.subnets) {
            column.subnets.push({
              id: subnet.id, label: `${subnet.classification} subnet`, classification: subnet.classification, tier: subnet.tier,
              resources: [...collectResources(subnet.resources, subnet.id), ...(subnetInstances.get(subnet.id) ?? [])],
            });
          }
          group.azColumns.push(column);
        }
        vpcGroups.push(group);
      }
    }
  } else if (spec.provider === "gcp") {
    // GCP geographic-region resources paint in the regional tier row.
    for (const region of spec.cloud.regions) {
      for (const r of (region as { resources?: readonly { id: string; label: string; service: string; tier: string }[] }).resources ?? []) {
        regionScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: region.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
      }
    }
    for (const network of spec.cloud.networks) {
      const group: VpcGroup = { vpcId: network.id, label: network.label, regionId: network.id, vpcScoped: [], azColumns: [] };
      // Network-scoped resources paint in the GCP group's scoped tier row.
      for (const r of (network as { resources?: readonly { id: string; label: string; service: string; tier: string }[] }).resources ?? []) {
        group.vpcScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: network.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
      }
      for (const netRegion of network.regions) {
        // Network-region-scoped resources paint in the region column as a
        // scoped tier row — never omitted.
        const regionResources = (netRegion as { resources?: readonly { id: string; label: string; service: string; tier: string }[] }).resources ?? [];
        if (regionResources.length > 0) {
          group.azColumns.push({
            azId: `region-scoped-${netRegion.id}`, label: `Region ${netRegion.regionId} scoped`,
            subnets: [{
              id: `region-scoped-${netRegion.id}`, label: `Region ${netRegion.regionId} resources`, classification: "scoped", tier: "auxiliary",
              resources: regionResources.filter((r) => r !== null && r !== undefined).map((r) => ({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: netRegion.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier })),
            }],
          });
        }
        // One AZ column per network region — all its subnets stack inside.
        group.azColumns.push({
          azId: netRegion.id, label: `Region ${netRegion.regionId}`,
          subnets: (netRegion.subnets ?? []).map((subnet) => ({
            id: subnet.id, label: `${subnet.classification} subnet`, classification: subnet.classification, tier: subnet.tier, resources: collectResources(subnet.resources ?? [], subnet.id),
          })),
        });
      }
      vpcGroups.push(group);
    }
  } else {
    for (const region of spec.cloud.regions) {
      // Azure regional resources paint in the regional tier row — never
      // omitted from the scene.
      for (const r of (region as { resources?: readonly { id: string; label: string; service: string; tier: string }[] }).resources ?? []) {
        regionScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: region.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
      }
      const layoutVnets = region.vnets ?? (region as { vpcs?: readonly { id: string; label?: string; subnets?: readonly { id: string; label?: string; resources?: readonly { id: string; label?: string; service: string; placement: { kind: string } }[] }[] }[] }).vpcs ?? [];
      for (const vnet of layoutVnets) {
        const group: VpcGroup = { vpcId: vnet.id, label: vnet.label, regionId: region.id, vpcScoped: [], azColumns: [] };
        // Vnet-scoped resources paint in the vnet's scoped tier row — never
        // omitted from the scene.
        for (const r of vnet.resources ?? []) {
          group.vpcScoped.push({ instanceId: `inst-${r.id}`, resourceId: r.id, ownerScopeId: vnet.id, label: r.label, glyph: glyphFor(r.service, "provider"), tier: r.tier });
        }
        vpcGroups.push({
          vpcId: vnet.id, label: vnet.label, regionId: region.id, vpcScoped: group.vpcScoped,
          azColumns: [{
            azId: `${region.id}-slice`, label: region.label,
            subnets: (vnet.subnets ?? []).map((subnet) => ({
              id: subnet.id, label: `${subnet.classification} subnet`, classification: subnet.classification, tier: subnet.tier,
              resources: collectResources(subnet.resources ?? [], subnet.id),
            })),
          }],
        });
      }
    }
  }

  // ---- Allocate: external tier above Cloud, then the boundary stack ----
  const M = 16; // canvas margin
  // View selection: a network-detail view omits the external tier (the view
  // focuses on the network). focusIds FILTER the scene: only the focused
  // scopes (and their ancestors) are laid out; the ids are recorded too.
  const detail = options.detail ?? "overview";
  const focusIds = options.focusIds ?? [];
  const focusActive = focusIds.length > 0;
  const focusSet = new Set(focusIds);
  const showExternals = detail !== "network-detail";
  const visibleExternals = showExternals
    ? (focusActive ? externals.filter((e) => focusSet.has(e.resourceId)) : externals)
    : [];
  // focusIds also filter INTERNAL scopes: when a focus id names a vpc,
  // network, subnet, or RESOURCE, only the matching groups are laid out. A
  // resource focus narrows to the resource's owner scope.
  const resourceScopeIds = new Map<string, string>();
  for (const g of vpcGroups) {
    for (const r of g.vpcScoped) resourceScopeIds.set(r.resourceId, g.vpcId);
    for (const c of g.azColumns) for (const sub of c.subnets) for (const r of sub.resources) resourceScopeIds.set(r.resourceId, sub.id);
  }
  const effectiveFocus = new Set([...focusSet].map((id) => resourceScopeIds.get(id) ?? id));
  // A focus id naming a RESOURCE narrows the scene to that resource: scope
  // siblings outside the focus are omitted.
  const focusedResources = new Set([...focusSet].filter((id) => resourceScopeIds.has(id)));
  if (focusedResources.size > 0) {
    for (const g of vpcGroups) {
      g.vpcScoped = g.vpcScoped.filter((r) => focusedResources.size === 0 || focusedResources.has(r.resourceId));
      for (const c of g.azColumns) {
        for (const sub of c.subnets) {
          sub.resources = sub.resources.filter((r) => focusedResources.has(r.resourceId));
        }
      }
    }
  }
  const internalScopeActive = focusActive && [...effectiveFocus].some((id) => vpcGroups.some((g) => g.vpcId === id) || vpcGroups.some((g) => g.azColumns.some((c) => c.subnets.some((s) => s.id === id))));
  if (internalScopeActive) {
    for (let gi = vpcGroups.length - 1; gi >= 0; gi -= 1) {
      const group = vpcGroups[gi];
      if (!group) continue;
      const groupFocused = effectiveFocus.has(group.vpcId);
      const subnetFocused = group.azColumns.some((c) => c.subnets.some((s) => effectiveFocus.has(s.id)));
      if (!groupFocused && !subnetFocused) {
        vpcGroups.splice(gi, 1);
        continue;
      }
      if (groupFocused) continue;
      // A focused subnet narrows the group to its column AND filters the
      // subnets within each focused column.
      for (let ci = group.azColumns.length - 1; ci >= 0; ci -= 1) {
        const col = group.azColumns[ci];
        if (!col) continue;
        const colFocused = col.subnets.some((s) => effectiveFocus.has(s.id));
        if (!colFocused) {
          group.azColumns.splice(ci, 1);
          continue;
        }
        col.subnets = col.subnets.filter((sub) => effectiveFocus.has(sub.id));
      }
    }
  }
  const omittedActorIds = new Set(visibleExternals.length < externals.length ? externals.filter((e) => !visibleExternals.includes(e)).map((e) => e.resourceId) : []);
  const externalRowH = showExternals
    ? Math.max(...externals.map((e) => cellSizeFor(e.glyph).h), GRID_MINIMA.bareIconCell.h)
    : 0;
  const externalCount = Math.max(1, visibleExternals.length);
  const externalGridW = externalCount * GRID_MINIMA.computeCell.w + Math.max(0, externalCount - 1) * GRID_MINIMA.iconGapX;

  // AZ columns per VPC group: contiguous, side by side with AZ gap.
  const azGap = GRID_MINIMA.azGapX;
  const azInsets = insetsFor("az");
  const subnetInsets = insetsFor("subnet");
  const networkInsets = insetsFor("network");
  const regionInsets = insetsFor("region");
  const cloudInsets = insetsFor("cloud");

  const tierOrder = ["ingress", "load-balancer", "compute", "application", "data", "auxiliary"];

  // Size each VPC group bottom-up: regional row + AZ columns with tier rows.
  const groupLayouts = vpcGroups.map((group) => {
    const azWidths = group.azColumns.map((col) => {
      const subnetWidths = col.subnets.map((s) => {
        const count = Math.max(1, s.resources.length);
        return Math.max(GRID_MINIMA.publicSubnet.w, count * GRID_MINIMA.computeCell.w + Math.max(0, count - 1) * 40 + 2 * 15);
      });
      return Math.max(GRID_MINIMA.az.w, ...subnetWidths);
    });
    const azTotalW = azWidths.reduce((a, b) => a + b, 0) + Math.max(0, group.azColumns.length - 1) * azGap;
    const regionalCount = Math.max(1, group.vpcScoped.length);
    const regionalGridW = regionalCount * GRID_MINIMA.gatewayCell.w + Math.max(0, regionalCount - 1) * GRID_MINIMA.iconGapX;

    // Subnet tier rows: group subnets by tier across the group's columns.
    const tiersPresent: string[] = [];
    for (const col of group.azColumns) {
      for (const s of col.subnets) {
        if (!tiersPresent.includes(s.tier)) tiersPresent.push(s.tier);
      }
    }
    tiersPresent.sort((a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b));

    const azLayouts = group.azColumns.map((col) => {
      const width = azWidths[group.azColumns.indexOf(col)] ?? GRID_MINIMA.az.w;
      const subnetRects: { id: string; rect: Rect; resources: NodeInput[]; classification: string }[] = [];
      let y = 0; // relative to the AZ content box (azInsets.top already applied)
      // Every subnet in the column is allocated — repeated tiers stack.
      for (const subnet of col.subnets) {
        // Null resource entries are filtered before allocation.
        subnet.resources = subnet.resources.filter((r) => r !== null && r !== undefined);
        const count = Math.max(1, subnet.resources.length);
        const w = Math.max(GRID_MINIMA.publicSubnet.w, count * GRID_MINIMA.computeCell.w + Math.max(0, count - 1) * 40 + 2 * 15);
        const h = Math.max(
          subnet.classification === "public" ? GRID_MINIMA.publicSubnet.h : GRID_MINIMA.privateSubnet.h,
          subnetInsets.headerH + subnetInsets.top + cellSizeFor("compute").h + subnetInsets.bottom,
        );
        subnetRects.push({ id: subnet.id, rect: { x: 0, y, width: Math.min(w, width - azInsets.left - azInsets.right), height: h }, resources: subnet.resources, classification: subnet.classification });
        y += h + GRID_MINIMA.boundaryGapY;
      }
      const contentH = Math.max(0, y - GRID_MINIMA.boundaryGapY);
      const height = azInsets.top + contentH + azInsets.bottom + azInsets.footerH;
      return { col, width, height, subnetRects };
    });

    const azStackH = Math.max(...azLayouts.map((l) => l.height), GRID_MINIMA.az.h);
    const regionalRowH = group.vpcScoped.length > 0 ? GRID_MINIMA.gatewayCell.h : 0;
    const networkContentW = Math.max(azTotalW, regionalGridW);
    const networkContentH = regionalRowH + (regionalRowH > 0 ? GRID_MINIMA.boundaryGapY : 0) + azStackH;
    const networkW = networkInsets.left + networkContentW + networkInsets.right;
    const networkH = networkInsets.headerH + networkInsets.top + networkContentH + networkInsets.bottom;
    return { group, azLayouts, azTotalW, regionalGridW, regionalRowH, networkW, networkH };
  });

  // Region-scoped service tier above all VPC networks.
  const regionScopedRowH = regionScoped.length > 0 ? GRID_MINIMA.gatewayCell.h : 0;
  const regionScopedGridW = Math.max(1, regionScoped.length) * GRID_MINIMA.gatewayCell.w + Math.max(0, regionScoped.length - 1) * GRID_MINIMA.iconGapX;

  // Region groups: VPC layouts grouped by their owning region — one region
  // boundary per DECLARED region (empty declared regions still appear),
  // side by side inside the cloud. Regional resources paint INSIDE their
  // region boundary.
  const gcpGeoRegions = spec.provider === "gcp"
    ? ((spec.cloud as { regions?: readonly { id: string; label?: string; resources?: readonly unknown[] }[] }).regions ?? []).filter((r) => (r.resources?.length ?? 0) > 0).map((r) => ({ id: r.id, label: r.label ?? r.id }))
    : [];
  const declaredRegions: readonly { id: string; label: string }[] = spec.provider === "gcp"
    ? [...(spec.cloud as { networks?: readonly { id: string; label: string }[] }).networks ?? [], ...gcpGeoRegions]
    : (spec.cloud as { regions: readonly { id: string; label: string }[] }).regions;
  const regionGroups = new Map<string, typeof groupLayouts>();
  for (const gLayout of groupLayouts) {
    const key = gLayout.group.regionId;
    const list = regionGroups.get(key) ?? [];
    list.push(gLayout);
    regionGroups.set(key, list);
  }
  const regionScopedByRegion = new Map<string, NodeInput[]>();
  for (const r of regionScoped) {
    const list = regionScopedByRegion.get(r.ownerScopeId) ?? [];
    list.push(r);
    regionScopedByRegion.set(r.ownerScopeId, list);
  }
  // Region row width: sum of per-region widths (each wraps its regional row
  // + VPC networks). Empty regions keep a minimal boundary.
  const regionRowW = declaredRegions.reduce((sum, region) => {
    const layouts = regionGroups.get(region.id) ?? [];
    const regional = regionScopedByRegion.get(region.id) ?? [];
    const networksWLayout = layouts.reduce((s, l) => s + l.networkW, 0) + Math.max(0, layouts.length - 1) * GRID_MINIMA.iconGapX;
    const regionalWLayout = regional.length * GRID_MINIMA.gatewayCell.w + Math.max(0, regional.length - 1) * GRID_MINIMA.iconGapX;
    const w = Math.max(networksWLayout, regionalWLayout, GRID_MINIMA.az.w) + regionInsets.left + regionInsets.right;
    return sum + w;
  }, 0) + Math.max(0, declaredRegions.length - 1) * GRID_MINIMA.azGapX;
  const networksW = regionRowW;
  const maxRegionInnerH = declaredRegions.reduce<number>((max, region) => {
    const layouts = regionGroups.get(region.id) ?? [];
    const regional = regionScopedByRegion.get(region.id) ?? [];
    const regionalRowHLayout = regional.length > 0 ? GRID_MINIMA.gatewayCell.h + GRID_MINIMA.boundaryGapY : 0;
    const networksHLayout = layouts.length > 0 ? Math.max(...layouts.map((l) => l.networkH)) : 0;
    return Math.max(max, regionalRowHLayout + networksHLayout);
  }, GRID_MINIMA.az.w);
  const networksH = maxRegionInnerH + regionInsets.headerH + regionInsets.top + regionInsets.bottom;
  const regionW = networksW;
  const cloudScopedRowH = cloudScoped.length > 0 ? GRID_MINIMA.gatewayCell.h + GRID_MINIMA.boundaryGapY : 0;
  const regionH = cloudScopedRowH + networksH;

  // Cloud wraps region.
  const cloudW = cloudInsets.left + regionW + cloudInsets.right;
  const cloudH = cloudInsets.headerH + cloudInsets.top + regionH + cloudInsets.bottom;

  // Canvas: external tier above cloud + legend rail on the right.
  const legendW = 220;
  const canvasW = M + Math.max(externalGridW, cloudW) + M + legendW + M;
  const canvasH = M + externalRowH + GRID_MINIMA.boundaryGapY + cloudH + M;

  // ---- Position top-down ----
  const extX = M + Math.max(0, (Math.max(externalGridW, cloudW) - externalGridW) / 2);
  visibleExternals.forEach((e, i) => {
    const size = cellSizeFor(e.glyph);
    const x = extX + i * (GRID_MINIMA.computeCell.w + GRID_MINIMA.iconGapX);
    const cell: Rect = { x: quantize(x), y: quantize(M), width: size.w, height: size.h };
    const label = addLabel(e.resourceId, e.label, FONT.baseSize, { x: cell.x + cell.width / 2, y: cell.y + cell.height + 14 }, "primary");
    const node: PlacedNode = { id: e.instanceId, resourceId: e.resourceId, ownerScopeId: e.ownerScopeId, cell, body: glyphPaintBounds(e.glyph, cell), glyph: e.glyph, labelIds: [label.id] };
    nodes.push(node);
  });

  const cloudX = M;
  const cloudY = M + externalRowH + GRID_MINIMA.boundaryGapY;
  const cloudContent = { x: cloudX + cloudInsets.left, y: cloudY + cloudInsets.headerH + cloudInsets.top, width: regionW, height: regionH };
  boundaries.push({ id: "boundary-cloud", level: "cloud", paint: { x: cloudX, y: cloudY, width: cloudW, height: cloudH }, content: cloudContent, labelIds: [], scopeId: spec.cloud.id });

  // Provider-true: no synthetic region boundary — the per-region boundaries
  // nest directly inside the cloud content.
  const regionPaint = { x: cloudContent.x, y: cloudContent.y, width: regionW, height: regionH };
  const regionContent = { x: regionPaint.x, y: regionPaint.y, width: regionW, height: regionH };

  // Region-scoped service tier row above all VPC networks.
  let regionRowY = regionContent.y;
  // Cloud-scoped tier row (cloud-level resources) above the region row.
  cloudScoped.forEach((r, i) => {
    const size = cellSizeFor(r.glyph);
    const x = regionContent.x + i * (GRID_MINIMA.gatewayCell.w + GRID_MINIMA.iconGapX);
    const cell: Rect = { x: quantize(x), y: quantize(regionRowY), width: size.w, height: size.h };
    const label = addLabel(r.resourceId, r.label, FONT.baseSize, { x: cell.x + cell.width / 2, y: cell.y + cell.height + 14 }, "primary");
    nodes.push({ id: r.instanceId, resourceId: r.resourceId, ownerScopeId: r.ownerScopeId, cell, body: glyphPaintBounds(r.glyph, cell), glyph: r.glyph, labelIds: [label.id] });
  });
  if (cloudScoped.length > 0) regionRowY += GRID_MINIMA.gatewayCell.h + GRID_MINIMA.boundaryGapY;

  const regionBoundaryIds = new Map<string, string>();
  let regionX = regionContent.x;
  const regionGapX = GRID_MINIMA.azGapX;
  for (const region of declaredRegions) {
    const rid = region.id;
    const layouts = regionGroups.get(rid) ?? [];
    const regional = regionScopedByRegion.get(rid) ?? [];
    const networksWLayout = layouts.reduce((sum, l) => sum + l.networkW, 0) + Math.max(0, layouts.length - 1) * GRID_MINIMA.iconGapX;
    const regionalWLayout = regional.length * GRID_MINIMA.gatewayCell.w + Math.max(0, regional.length - 1) * GRID_MINIMA.iconGapX;
    const regionWLayout = Math.max(networksWLayout, regionalWLayout, GRID_MINIMA.az.w) + regionInsets.left + regionInsets.right;
    const regionalRowHLayout = regional.length > 0 ? GRID_MINIMA.gatewayCell.h + GRID_MINIMA.boundaryGapY : 0;
    const networksHLayout = layouts.length > 0 ? Math.max(...layouts.map((l) => l.networkH)) : 0;
    const regionHLayout = regionalRowHLayout + networksHLayout + regionInsets.headerH + regionInsets.top + regionInsets.bottom;
    const ridLabel = region.label ?? rid;
    const paint = { x: quantize(regionX), y: quantize(regionRowY), width: regionWLayout, height: regionHLayout };
    const content = { x: paint.x + regionInsets.left, y: paint.y + regionInsets.headerH + regionInsets.top, width: Math.max(0, regionWLayout - regionInsets.left - regionInsets.right), height: Math.max(0, regionHLayout - regionInsets.headerH - regionInsets.top - regionInsets.bottom) };
    const regionLabel = addLabel(rid, ridLabel, FONT.baseSize, { x: paint.x + 12, y: paint.y + regionInsets.headerH - 6 }, "primary");
    const boundaryId = `boundary-region-${rid}`;
    regionBoundaryIds.set(rid, boundaryId);
    boundaries.push({ id: boundaryId, parentId: "boundary-cloud", level: "region", paint, content, labelIds: [regionLabel.id], scopeId: rid });
    regionX += regionWLayout + regionGapX;
    // Regional resources INSIDE this region boundary (regional tier row).
    let contentY = content.y;
    regional.forEach((r, i) => {
      const size = cellSizeFor(r.glyph);
      const x = content.x + i * (GRID_MINIMA.gatewayCell.w + GRID_MINIMA.iconGapX);
      const cell: Rect = { x: quantize(x), y: quantize(contentY), width: size.w, height: size.h };
      const label = addLabel(r.resourceId, r.label, FONT.baseSize, { x: cell.x + cell.width / 2, y: cell.y + cell.height + 14 }, "primary");
      nodes.push({ id: r.instanceId, resourceId: r.resourceId, ownerScopeId: r.ownerScopeId, cell, body: glyphPaintBounds(r.glyph, cell), glyph: r.glyph, labelIds: [label.id] });
    });
    if (regional.length > 0) contentY += GRID_MINIMA.gatewayCell.h + GRID_MINIMA.boundaryGapY;
    // VPC networks inside this region boundary.
    let networkX = content.x;
    const networkY = contentY;
    for (const gLayout of layouts) {
    const networkPaint = { x: networkX, y: networkY, width: gLayout.networkW, height: gLayout.networkH };
    const networkContent = { x: networkPaint.x + networkInsets.left, y: networkPaint.y + networkInsets.headerH + networkInsets.top, width: Math.max(0, networkPaint.width - networkInsets.left - networkInsets.right), height: Math.max(0, gLayout.networkH - networkInsets.headerH - networkInsets.top - networkInsets.bottom) };
    // Boundary label: VPC label + CIDR in the boundary header band.
    const vpcEntity = indexes.byId.get(gLayout.group.vpcId) as { label?: string; cidrs?: { status: string; value?: readonly unknown[] } } | undefined;
    const vpcCidrText = vpcEntity?.cidrs?.status === "known" && Array.isArray(vpcEntity.cidrs.value)
      ? (vpcEntity.cidrs.value as readonly { value?: string }[]).map((c) => c.value ?? "").filter(Boolean).join(", ")
      : "";
    const vpcLabelText = [vpcEntity?.label ?? gLayout.group.vpcId, vpcCidrText].filter(Boolean).join(" · ");
    const vpcLabelIds: string[] = [];
    if (vpcLabelText.length > 0) {
      const vpcLabel = addLabel(gLayout.group.vpcId, vpcLabelText, FONT.baseSize, { x: networkPaint.x + 12, y: networkPaint.y + networkInsets.headerH - 6 }, "primary");
      vpcLabelIds.push(vpcLabel.id);
    }
    boundaries.push({ id: `boundary-network-${gLayout.group.vpcId}`, parentId: boundaryId, level: "network", paint: networkPaint, content: networkContent, labelIds: vpcLabelIds, scopeId: gLayout.group.vpcId });

    // VPC-scoped service tier row inside the network.
    let azTop = networkContent.y;
    gLayout.group.vpcScoped.forEach((r, i) => {
      const size = cellSizeFor(r.glyph);
      const x = networkContent.x + i * (GRID_MINIMA.gatewayCell.w + GRID_MINIMA.iconGapX);
      const cell: Rect = { x: quantize(x), y: quantize(azTop), width: size.w, height: size.h };
      const label = addLabel(r.resourceId, r.label, FONT.baseSize, { x: cell.x + cell.width / 2, y: cell.y + cell.height + 14 }, "primary");
      nodes.push({ id: r.instanceId, resourceId: r.resourceId, ownerScopeId: r.ownerScopeId, cell, body: glyphPaintBounds(r.glyph, cell), glyph: r.glyph, labelIds: [label.id] });
    });
    if (gLayout.regionalRowH > 0) azTop += gLayout.regionalRowH + GRID_MINIMA.boundaryGapY;

    // AZ columns.
    let azX = networkContent.x;
    for (const layout of gLayout.azLayouts) {
      const paint = { x: azX0(azX), y: azTop, width: layout.width, height: layout.height };
      const content = { x: paint.x + azInsets.left, y: paint.y + azInsets.top, width: Math.max(0, paint.width - azInsets.left - azInsets.right), height: Math.max(0, layout.height - azInsets.top - azInsets.bottom - azInsets.footerH) };
      // AZ label: AZ name in the AZ header band.
      const azEntity = indexes.byId.get(layout.col.azId) as { label?: string } | undefined;
      const azLabel = addLabel(layout.col.azId, azEntity?.label ?? layout.col.azId, FONT.sublabelSize, { x: paint.x + 10, y: paint.y + azInsets.top - 4 }, "muted");
      boundaries.push({ id: `boundary-az-${gLayout.group.vpcId}-${layout.col.azId}`, parentId: `boundary-network-${gLayout.group.vpcId}`, level: "az", paint, content, labelIds: [azLabel.id], scopeId: layout.col.azId });
      // Subnets stacked by tier.
      layout.subnetRects.forEach((sr) => {
        const rect = { x: content.x, y: content.y + sr.rect.y, width: sr.rect.width, height: sr.rect.height };
        const sInsets = subnetInsets;
        const sContent = { x: rect.x + sInsets.left, y: rect.y + sInsets.headerH + sInsets.top, width: Math.max(0, rect.width - sInsets.left - sInsets.right), height: Math.max(0, rect.height - sInsets.headerH - sInsets.top - sInsets.bottom) };
        // Subnet label: name + CIDR in the subnet header band.
        const subnetEntity = indexes.byId.get(sr.id) as { label?: string; cidrs?: { status: string; value?: readonly unknown[] } } | undefined;
        const subnetCidrText = subnetEntity?.cidrs?.status === "known" && Array.isArray(subnetEntity.cidrs.value)
          ? (subnetEntity.cidrs.value as readonly { value?: string }[]).map((c) => c.value ?? "").filter(Boolean).join(", ")
          : "";
        const subnetLabelText = [subnetEntity?.label ?? sr.id, subnetCidrText].filter(Boolean).join(" · ");
        const subnetLabel = addLabel(sr.id, subnetLabelText, FONT.sublabelSize, { x: rect.x + 10, y: rect.y + sInsets.headerH - 4 }, "muted");
        const subnetBoundary: PlacedBoundary = { id: `boundary-subnet-${gLayout.group.vpcId}-${sr.id}`, parentId: `boundary-az-${gLayout.group.vpcId}-${layout.col.azId}`, level: "subnet", paint: rect, content: sContent, labelIds: [subnetLabel.id], scopeId: sr.id };
        if (sr.classification !== undefined && sr.classification !== "unspecified") subnetBoundary.classification = sr.classification;
        boundaries.push(subnetBoundary);
        // Resources as cells in the subnet.
        sr.resources.forEach((res, ri) => {
          const size = cellSizeFor(res.glyph);
          const subnetGap = GRID_MINIMA.iconGapX; // 90px documented icon-cell minimum
          const cellW = Math.min(size.w, Math.max(GRID_MINIMA.bareIconCell.w, sContent.width / Math.max(1, sr.resources.length) - subnetGap));
          const cell: Rect = {
            x: quantize(sContent.x + ri * (cellW + subnetGap)),
            y: quantize(sContent.y),
            width: quantize(cellW),
            height: quantize(size.h),
          };
          const label = addLabel(res.resourceId, res.label, FONT.baseSize, { x: cell.x + cell.width / 2, y: cell.y + cell.height + 13 }, "primary");
          const placed: PlacedNode = { id: res.instanceId, resourceId: res.resourceId, ownerScopeId: res.ownerScopeId, cell, body: glyphPaintBounds(res.glyph, cell), glyph: res.glyph, labelIds: [label.id] };
          if (res.attachmentId !== undefined) placed.attachmentId = res.attachmentId;
          nodes.push(placed);
        });
      });
      azX += layout.width + azGap;
    }
    networkX += gLayout.networkW + GRID_MINIMA.azGapX;
    }
  }

  function azX0(x: number): number { return x; }

  // ---- Route through reserved corridors ----
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  // Virtual scope nodes let association edges terminate at a VPC boundary.
  for (const b of boundaries) {
    if (b.level === "network") {
      const scopeId = b.id.replace("boundary-network-", "");
      const body: Rect = { x: b.paint.x + b.paint.width / 2 - 40, y: b.paint.y + 4, width: 96, height: 20 };
      nodeById.set(`vscope-${scopeId}`, { id: `vscope-${scopeId}`, resourceId: scopeId, ownerScopeId: scopeId, cell: body, body, glyph: "service", labelIds: [] });
    }
  }
  const boundaryByScope = new Map<string, string>();
  for (const b of boundaries) {
    if (b.level === "subnet") {
      const subnetId = b.id.replace("boundary-subnet-", "");
      boundaryByScope.set(subnetId, b.id);
    }
  }
  const boundaryForEndpoint = (endpoint: { kind: string; resourceId?: string; actorId?: string; attachmentId?: string; scopeId?: string }): string | undefined => {
    if (endpoint.kind === "external" && endpoint.actorId) return nodeById.get(`inst-${endpoint.actorId}`)?.id;
    if (endpoint.kind === "scope" && endpoint.scopeId) return nodeById.get(`vscope-${endpoint.scopeId}`)?.id;
    if (endpoint.kind === "resource" && endpoint.resourceId) {
      // Attachment-specific endpoints resolve to that instance glyph.
      if (endpoint.attachmentId) {
        const attInst = nodeById.get(`inst-${endpoint.resourceId}@${endpoint.attachmentId}`);
        if (attInst) return attInst.id;
      }
      const primary = primaryInstanceByResource.get(endpoint.resourceId);
      if (primary && nodeById.has(primary)) return primary;
      const inst = nodeById.get(`inst-${endpoint.resourceId}`);
      if (inst) return inst.id;
      // Multi-subnet resource: attach to the first instance glyph.
      const anyInst = [...nodeById.keys()].find((k) => k.startsWith(`inst-${endpoint.resourceId}@`));
      return anyInst;
    }
    return undefined;
  };

  let stepSeq = 0;
  for (const edge of spec.edges) {
    // Edges referencing actors omitted by the view are omitted too.
    const epFrom = edge.from as { kind: string; actorId?: string };
    const epTo = edge.to as { kind: string; actorId?: string };
    if ((epFrom.kind === "external" && epFrom.actorId !== undefined && omittedActorIds.has(epFrom.actorId)) ||
        (epTo.kind === "external" && epTo.actorId !== undefined && omittedActorIds.has(epTo.actorId))) {
      continue;
    }
    const fromId = boundaryForEndpoint(edge.from as { kind: string; resourceId?: string; actorId?: string });
    const toId = boundaryForEndpoint(edge.to as { kind: string; resourceId?: string; actorId?: string });
    const from = fromId ? nodeById.get(fromId) : undefined;
    const to = toId ? nodeById.get(toId) : undefined;
    if (!from || !to) {
      // A focus-narrowed scene intentionally omits endpoint nodes — the edge
      // is skipped with a note, never an error.
      if (focusActive) {
        diagnostics.push({ code: "FOCUS_EDGE_OMITTED", severity: "warning", message: `edge ${edge.id} omitted by the focus filter (endpoint outside the focused scope)`, subjects: [edge.id] });
      } else {
        diagnostics.push({ code: "EDGE_ENDPOINT_INVALID", severity: "error", message: `edge ${edge.id} could not be laid out: endpoint node missing`, subjects: [edge.id] });
      }
      continue;
    }
    // Target face: the route enters the face facing the source. Source above →
    // top; source left → left; source right → right (never wrap around).
    const sourceIsExternal = from.glyph === "external";
    const targetIsExternal = to.glyph === "external";
    const railRoute = sourceIsExternal !== targetIsExternal;
    const sameCellAdjacent = !railRoute && from.cell.y === to.cell.y &&
      (to.cell.x - (from.cell.x + from.cell.width) >= 0) && (to.cell.x - (from.cell.x + from.cell.width)) < 40;
    const centerXFrom = from.cell.x + from.cell.width / 2;
    const centerXTo = to.cell.x + to.cell.width / 2;
    const verticallyAligned = Math.abs(centerXFrom - centerXTo) < 64;
    const targetFace: Face = edge.targetFace ?? (railRoute ? "left" : sameCellAdjacent ? "left" : verticallyAligned ? (to.cell.y > from.cell.y ? "top" : "bottom") : from.cell.x > to.cell.x ? "right" : "left");
    const sourceFaceAdj: Face = edge.sourceFace ?? (sameCellAdjacent ? "right" : sourceFace0(from, to));
    function sourceFace0(a: PlacedNode, b: PlacedNode): Face {
      return b.cell.y + b.cell.height / 2 < a.cell.y ? "top" : b.cell.x > a.cell.x ? "right" : b.cell.x < a.cell.x ? "left" : "bottom";
    }
    const sourcePort = portOnFace(from.body, sourceFaceAdj, 0, 1);
    const targetPort = portOnFace(to.body, targetFace, 0, 1);
    const sn = faceNormal(sourceFaceAdj);
    const tn = faceNormal(targetFace);
    // Stub clamps to the gap along each stub's own normal so tight tier
    // stacks never produce micro segments below the 8/16px floors.
    const gapY = to.cell.y > from.cell.y
      ? to.cell.y - (from.cell.y + from.cell.height)
      : from.cell.y - (to.cell.y + to.cell.height);
    const gapX = to.cell.x > from.cell.x
      ? to.cell.x - (from.cell.x + from.cell.width)
      : from.cell.x - (to.cell.x + to.cell.width);
    const clampFor = (normal: { dx: number; dy: number }): number => {
      const gap = normal.dy !== 0 ? gapY : gapX;
      // The clamp bottoms out at the 8px micro-segment floor — a tight gap
      // never produces a stub below the floor.
      return gap > 24
        ? Math.max(THRESHOLDS.microSegmentMin, Math.min(THRESHOLDS.stubMin, (gap - 16) / 2))
        : THRESHOLDS.stubMin;
    };
    const sourceStubLen = Math.max(2, clampFor(sn));
    const targetStubLen = Math.max(2, clampFor(tn));
    const sourceStub = { x: sourcePort.x + sourceStubLen * sn.dx, y: sourcePort.y + sourceStubLen * sn.dy };
    const targetStub = { x: targetPort.x + targetStubLen * tn.dx, y: targetPort.y + targetStubLen * tn.dy };
    const stub = sourceStubLen;
    // External → internal edges route through the reserved left rail corridor
    // (outside the region boundary) so they never cross the regional tier row.
    let raw: Point[];
    let mid1: Point = sourceStub;
    let usedSourceFace: Face = sourceFaceAdj;
    let usedTargetFace: Face = targetFace;
    const railPoints = (src: PlacedNode, dst: PlacedNode, reverse: boolean): Point[] => {
      const railX = regionPaint.x - 16;
      const exitY = src.cell.y + src.cell.height / 2;
      const entryY = dst.cell.y + dst.cell.height / 2;
      if (!reverse) {
        // external → internal: exit src left, rail down to dst row, enter dst left.
        return [
          portOnFace(src.body, "left", 0, 1),
          { x: railX, y: exitY },
          { x: railX, y: entryY },
          { x: dst.body.x - stub, y: entryY },
          portOnFace(dst.body, "left", 0, 1),
        ];
      }
      // internal → external: exit src left, rail up to dst row, enter dst left.
      return [
        portOnFace(src.body, "left", 0, 1),
        { x: railX, y: exitY },
        { x: railX, y: entryY },
        portOnFace(dst.body, "left", 0, 1),
      ];
    };
    const overlapMin = Math.max(from.body.x, to.body.x);
    const overlapMax = Math.min(from.body.x + from.body.width, to.body.x + to.body.width);
    const verticalAdjacent = !sameCellAdjacent && overlapMin < overlapMax && (to.cell.y !== from.cell.y);
    if (sameCellAdjacent) {
      // Adjacent nodes in the same tier row: straight horizontal connector.
      raw = [sourcePort, targetPort];
      usedSourceFace = "right";
      usedTargetFace = "left";
    } else if (verticalAdjacent) {
      // Vertically aligned in adjacent tiers (either direction): straight
      // vertical connector through the horizontal overlap of the two bodies —
      // unless it would cross another node, in which case jog around it.
      const x = (overlapMin + overlapMax) / 2;
      const yTop = Math.min(from.body.y, to.body.y + (to.cell.y < from.cell.y ? to.body.height : 0));
      const yBottom = Math.max(from.body.y + from.body.height, to.body.y + (to.cell.y > from.cell.y ? 0 : to.body.height));
      const yLo = Math.min(from.body.y, to.body.y);
      const yHi = Math.max(from.body.y + from.body.height, to.body.y + to.body.height);
      const crosses = (cx: number): boolean =>
        nodes.some((n) => {
          if (n.id === from.id || n.id === to.id) return false;
          return cx >= n.body.x && cx <= n.body.x + n.body.width && n.body.y < yHi && n.body.y + n.body.height > yLo;
        });
      if (crosses(x)) {
        // Jog around: offset beyond the obstacle's nearest edge + clearance.
        const obstacle = nodes.find((n) => n.id !== from.id && n.id !== to.id && x >= n.body.x && x <= n.body.x + n.body.width && n.body.y < yHi && n.body.y + n.body.height > yLo);
        const clearance = Math.max(THRESHOLDS.bundleSeparation, THRESHOLDS.interiorSegmentMin);
        let jogX = x;
        if (obstacle) {
          const toLeft = Math.abs(x - obstacle.body.x);
          const toRight = Math.abs(obstacle.body.x + obstacle.body.width - x);
          jogX = toLeft <= toRight ? obstacle.body.x - clearance : obstacle.body.x + obstacle.body.width + clearance;
        }
        if (to.cell.y > from.cell.y) {
          raw = [{ x, y: from.body.y + from.body.height }, { x, y: from.body.y + from.body.height + 16 }, { x: jogX, y: from.body.y + from.body.height + 16 }, { x: jogX, y: to.body.y - 16 }, { x, y: to.body.y - 16 }, { x, y: to.body.y }];
        } else {
          raw = [{ x, y: from.body.y }, { x, y: from.body.y - 16 }, { x: jogX, y: from.body.y - 16 }, { x: jogX, y: to.body.y + to.body.height + 16 }, { x, y: to.body.y + to.body.height + 16 }, { x, y: to.body.y + to.body.height }];
        }
        usedSourceFace = to.cell.y > from.cell.y ? "bottom" : "top";
        usedTargetFace = to.cell.y > from.cell.y ? "top" : "bottom";
      } else if (to.cell.y > from.cell.y) {
        raw = [{ x, y: from.body.y + from.body.height }, { x, y: to.body.y }];
        usedSourceFace = "bottom";
        usedTargetFace = "top";
      } else {
        raw = [{ x, y: from.body.y }, { x, y: to.body.y + to.body.height }];
        usedSourceFace = "top";
        usedTargetFace = "bottom";
      }
    } else if (sourceIsExternal && !targetIsExternal) {
      const base = railPoints(from, to, false);
      // Entry repair: if the horizontal run into the target row crosses a
      // node, route below the row and enter the target from the bottom face.
      const railX = regionPaint.x - 16;
      const entryY = to.cell.y + to.cell.height / 2;
      const entryRun = { start: { x: railX, y: entryY }, end: { x: to.body.x - stub, y: entryY } };
      const blocked = nodes.some((n) => {
        if (n.id === from.id || n.id === to.id) return false;
        return segmentsIntersect(entryRun, { start: { x: n.body.x, y: n.body.y }, end: { x: n.body.x + n.body.width, y: n.body.y } })
          || (entryY >= n.body.y && entryY <= n.body.y + n.body.height && Math.min(railX, to.body.x - stub) <= n.body.x + n.body.width && Math.max(railX, to.body.x - stub) >= n.body.x);
      });
      if (blocked) {
        const belowY = to.body.y + to.body.height + stub;
        const centerX = to.body.x + to.body.width / 2;
        raw = [
          portOnFace(from.body, "left", 0, 1),
          { x: railX, y: from.cell.y + from.cell.height / 2 },
          { x: railX, y: belowY },
          { x: centerX, y: belowY },
          { x: centerX, y: to.body.y + to.body.height },
        ];
        usedTargetFace = "bottom";
      } else {
        raw = base;
      }
      usedSourceFace = "left";
      usedTargetFace = blocked ? "bottom" : "left";
    } else if (targetIsExternal && !sourceIsExternal) {
      // internal → external: exit the internal node left, rail up to the
      // external row, enter the external node left. Points run src → dst.
      const railX = regionPaint.x - 16;
      const exitY = from.cell.y + from.cell.height / 2;
      const entryY = to.cell.y + to.cell.height / 2;
      raw = [
        portOnFace(from.body, "left", 0, 1),
        { x: railX, y: exitY },
        { x: railX, y: entryY },
        portOnFace(to.body, "left", 0, 1),
      ];
      usedSourceFace = "left";
      usedTargetFace = "left";
    } else {
      // Orthogonal L/Z route through the stubs; if it would cross another
      // node, repair through the reserved left rail corridor (≤1 repair).
      mid1 = { x: sourceStub.x, y: (sourceStub.y + targetStub.y) / 2 };
      const mid2 = { x: targetStub.x, y: mid1.y };
      // The mid row must clear both stub ends by the 16px interior floor —
      // a too-tight mid row collapses to a direct L route.
      const midClear = Math.abs(mid1.y - sourceStub.y) >= THRESHOLDS.interiorSegmentMin
        && Math.abs(mid1.y - targetStub.y) >= THRESHOLDS.interiorSegmentMin;
      const direct: Point[] = midClear
        ? [sourcePort, sourceStub, mid1, mid2, targetStub, targetPort]
        : [sourcePort, sourceStub, { x: targetStub.x, y: sourceStub.y }, targetStub, targetPort];
      const crosses = (pts: Point[]): boolean => {
        for (const n of nodes) {
          if (n.id === from.id || n.id === to.id) continue;
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1];
            const b = pts[i];
            if (!a || !b) continue;
            const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
            const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
            if (minX <= n.body.x + n.body.width && maxX >= n.body.x && minY <= n.body.y + n.body.height && maxY >= n.body.y) return true;
          }
        }
        return false;
      };
      if (crosses(direct)) {
        const railX = regionPaint.x - 16;
        const exitY = from.cell.y + from.cell.height / 2;
        const entryY = to.cell.y + to.cell.height / 2;
        const entryRun = { start: { x: railX, y: entryY }, end: { x: to.body.x - stub, y: entryY } };
        const entryBlocked = nodes.some((n) => {
          if (n.id === from.id || n.id === to.id) return false;
          return entryY >= n.body.y && entryY <= n.body.y + n.body.height && Math.min(railX, to.body.x - stub) <= n.body.x + n.body.width && Math.max(railX, to.body.x - stub) >= n.body.x;
        });
        if (entryBlocked) {
          // Route below the target row and enter from the bottom face.
          const belowY = to.body.y + to.body.height + stub;
          const centerX = to.body.x + to.body.width / 2;
          raw = [
            portOnFace(from.body, "left", 0, 1),
            { x: railX, y: exitY },
            { x: railX, y: belowY },
            { x: centerX, y: belowY },
            { x: centerX, y: to.body.y + to.body.height },
          ];
          usedSourceFace = "left";
          usedTargetFace = "bottom";
        } else {
          raw = [
            portOnFace(from.body, "left", 0, 1),
            { x: railX, y: exitY },
            { x: railX, y: entryY },
            { x: to.body.x - stub, y: entryY },
            portOnFace(to.body, "left", 0, 1),
          ];
          usedSourceFace = "left";
          usedTargetFace = "left";
        }
      } else {
        raw = direct;
      }
      // Border-run repair: if any segment of the direct route hugs a boundary
      // border (≤4px proximity over ≥16px), re-enter the target from the top
      // face — the drop crosses borders perpendicular instead of hugging them.
      const hugsBorder = (pts: Point[]): boolean => {
        for (const b of boundaries) {
          for (let i = 1; i < pts.length; i++) {
            const seg = { start: pts[i - 1] ?? { x: 0, y: 0 }, end: pts[i] ?? { x: 0, y: 0 } };
            if (borderRun(seg, b.paint)) return true;
          }
        }
        return false;
      };
      if (raw === direct && hugsBorder(direct)) {
        // Enter the target from the top: drop at the target body center x.
        const centerX = to.body.x + to.body.width / 2;
        raw = [sourcePort, sourceStub, { x: sourceStub.x, y: to.body.y - stub }, { x: centerX, y: to.body.y - stub }, { x: centerX, y: to.body.y }];
        usedTargetFace = "top";
      }
    }
    const norm = normalizePolyline(raw);
    if (norm.backtrack) {
      diagnostics.push({ code: "ROUTE_SIDE_CONTRACT", severity: "warning", message: `edge ${edge.id} route backtracks`, subjects: [edge.id] });
    }
    // Resolve the edge's traffic-plane family (association edges have none).
    const planeId = "planeId" in edge ? edge.planeId : undefined;
    const plane = planeId !== undefined ? spec.planes.find((pl) => pl.id === planeId) : undefined;
    const family = plane ? plane.family : "none";
    const variant = edge.variant === "async" ? "dashed" : edge.variant === "security" ? "dashed" : edge.variant === "emphasis" ? "solid" : "solid";
    const direction = "direction" in edge ? (edge.direction === "both" ? "reverse" : "forward") : "forward";
    routes.push({
      edgeId: edge.id, sourceNodeId: from.id, targetNodeId: to.id,
      points: norm.points.map((p) => ({ x: quantize(p.x), y: quantize(p.y) })),
      sourceFace: usedSourceFace, targetFace: usedTargetFace, crossingScopeIds: [], labelIds: [],
      kind: edge.kind, family, variant, direction,
    });
    // Source-end numbered badge for request edges with steps. Placed just
    // outside the source node's body along the route direction (≥10px clearance).
    const stepped = (edge.kind === "request" || edge.kind === "service-target") && "step" in edge && edge.step !== undefined;
    if (stepped) {
      const size = THRESHOLDS.badgeSize;
      const gap = THRESHOLDS.badgeClearance;
      let bx: number;
      let by: number;
      if (sameCellAdjacent) { bx = sourceStub.x - size / 2; by = from.body.y - gap - size; }
      else if (sourceFaceAdj === "bottom") { bx = sourceStub.x - size / 2; by = from.body.y + from.body.height + gap; }
      else if (sourceFaceAdj === "top") { bx = sourceStub.x - size / 2; by = from.body.y - gap - size; }
      else if (sourceFaceAdj === "right") { bx = from.body.x + from.body.width + gap; by = sourceStub.y - size / 2; }
      else { bx = from.body.x - gap - size; by = sourceStub.y - size / 2; }
      const badgeNumber = "step" in edge && edge.step !== undefined ? edge.step : stepSeq + 1;
      badges.push({
        id: `badge-${edge.id}`, hostEdgeId: edge.id, number: badgeNumber,
        rect: { x: quantize(bx), y: quantize(by), width: size, height: size },
      });
    }
    // Edge label at the first mid segment (or the rail segment for rail routes).
    const labelText = edge.semanticLabel.shortText ?? edge.semanticLabel.text;
    const labelAnchor = (sourceIsExternal !== targetIsExternal)
      ? { x: regionPaint.x + 24, y: (from.cell.y + from.cell.height / 2 + to.cell.y + to.cell.height / 2) / 2 }
      : mid1;
    const label = addLabel(edge.id, labelText, FONT.baseSize, { x: labelAnchor.x, y: labelAnchor.y - 8 }, edge.variant === "security" ? "ipv4" : "muted");
    routes[routes.length - 1] = { ...routes[routes.length - 1]!, labelIds: [label.id] };
    stepSeq++;
  }

  // Membership bands: segmented, low-opacity frames linking instances of the
  // same multi-subnet resource across tier rows (never an isolation claim).
  for (const group of membershipGroups) {
    const segments: Rect[] = [];
    const memberInstanceIds: string[] = [];
    for (const instanceId of group.instanceIds) {
      const node = nodeById.get(instanceId);
      if (!node) continue;
      segments.push({ x: node.cell.x - 4, y: node.cell.y - 4, width: node.cell.width + 8, height: node.cell.height + 8 });
      memberInstanceIds.push(instanceId);
    }
    if (segments.length >= 2) {
      frames.push({ id: `frame-${group.resourceId}`, segments, memberInstanceIds });
    }
  }
  // Authored spatial frames: spec.frames with membership resources (or a
  // policy's resourceIds) paint as bands around their member cells.
  for (const authored of spec.frames ?? []) {
    const memberIds = authored.membership.kind === "resources"
      ? [...authored.membership.resourceIds]
      : [...((spec.policies as readonly { id: string; resourceIds?: readonly string[] }[] | undefined) ?? []).find((p) => p.id === (authored.membership as { policyId?: string }).policyId)?.resourceIds ?? []];
    const segments: Rect[] = [];
    const memberInstanceIds: string[] = [];
    for (const rid of memberIds) {
      const node = nodeById.get(`inst-${rid}`);
      if (!node) continue;
      segments.push({ x: node.cell.x - 4, y: node.cell.y - 4, width: node.cell.width + 8, height: node.cell.height + 8 });
      memberInstanceIds.push(`inst-${rid}`);
    }
    if (segments.length >= 2) {
      frames.push({ id: `frame-${authored.id}`, segments, memberInstanceIds });
    }
  }

  // ---- Label collision repair: masks never intersect ----
  // Deterministic pass: for each intersecting pair (in label order), the
  // later label shifts down by the overlap + 4px clearance and its mask is
  // re-derived. Repeated until clear or 8 iterations.
  {
    const rederive = (label: PlacedLabel, baseline: Point): void => {
      const lines = wrapText(label.runs[0]?.text ?? "", 220, label.fontSize);
      const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
      const h = maskH(lines, label.fontSize);
      label.baseline = baseline;
      label.mask = { x: quantize(baseline.x - w / 2), y: quantize(baseline.y - h), width: quantize(w), height: quantize(h) };
    };
    const overlapOf = (a: Rect, b: Rect): number =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        ? Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        : 0;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      let repaired = false;
      const ordered = [...labels].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const a = ordered[i];
          const b = ordered[j];
          if (!a || !b) continue;
          const overlap = overlapOf(a.mask, b.mask);
          if (overlap > 0.5) {
            rederive(b, { x: b.baseline.x, y: b.baseline.y + overlap + 4 });
            repaired = true;
          }
        }
      }
      if (!repaired) break;
    }
  }

  // ---- Route cards: first-class Destination|Target tables ----
  // Each declared route card renders its route table's rows below the legend
  // column (right margin), sized from the actual row content.
  const routeTableById = new Map(spec.routingFacts.filter((rf) => rf.kind === "route-table").map((rf) => [rf.id, rf]));
  let cardY = M;
  for (const card of spec.routeCards) {
    const table = routeTableById.get(card.tableId);
    if (!table) continue;
    const destinationWidth = 150;
    // Rows are 28px apart with ≥22px header clearance so label masks never
    // intersect (masks are up to 24px tall after font-floor expansion).
    const rowHeights = table.rows.map(() => 28);
    const cardW = 24 + destinationWidth + 24 + 170 + 24;
    const cardH = 64 + rowHeights.reduce((sum, h) => sum + h, 0) + 8 + (rowHeights.length - 1) * 12;
    const rect: Rect = { x: quantize(canvasW - M - legendW - 24 - cardW), y: quantize(cardY), width: cardW, height: cardH };
    const headerLabel = addLabel(card.id, table.label, FONT.sublabelSize, { x: rect.x + 12 + Math.max(...wrapText(table.label, 220, FONT.sublabelSize).map((l) => fallbackMaskW(l, FONT.sublabelSize))) / 2, y: rect.y + 28 }, "primary");
    const rowLabelIds: string[] = [];
    table.rows.forEach((row, i) => {
      const destText = row.destination.kind === "cidr" ? row.destination.cidr.value : row.destination.prefixListId;
      const targetText = row.target.status === "known"
        ? row.target.value.kind === "local" ? "local"
          : row.target.value.kind === "resource" ? row.target.value.resourceId
            : row.target.value.kind === "attachment" ? row.target.value.attachmentId
              : row.target.value.kind === "discard" ? "discard" : "?"
        : row.target.reason;
      const rowY = rect.y + 64 + i * 28;
      const destLabel = addLabel(`${card.id}::${row.id}::dest`, String(destText), FONT.sublabelSize, { x: rect.x + 24 + destinationWidth / 2, y: rowY }, "primary");
      const targetLabel = addLabel(`${card.id}::${row.id}::target`, String(targetText), FONT.sublabelSize, { x: rect.x + 24 + destinationWidth + 24 + 85, y: rowY }, "muted");
      rowLabelIds.push(destLabel.id, targetLabel.id);
    });
    cards.push({ id: card.id, tableId: card.tableId, rect, destinationWidth, rowHeights, labelIds: [headerLabel.id, ...rowLabelIds], headerLineY: quantize(rect.y + 36), headingsY: quantize(rect.y + 48), firstRowY: quantize(rect.y + 64) });
    cardY += cardH + 16;
  }

  // ---- Legend (generated from used semantics) ----
  const legendEntries: string[] = [];
  const roles = new Set(spec.planes.map((p) => p.family));
  if (roles.has("ipv4") || roles.has("dual")) legendEntries.push("IPv4 path");
  if (roles.has("ipv6") || roles.has("dual")) legendEntries.push("IPv6 path");
  if (spec.edges.some((e) => e.kind === "association")) legendEntries.push("Association");
  if (spec.edges.some((e) => e.kind === "request")) legendEntries.push("Request flow");
  if (spec.edges.some((e) => e.kind === "service-target")) legendEntries.push("Service target");
  const legendRect: Rect = { x: quantize(canvasW - M - legendW), y: quantize(M), width: legendW, height: quantize(24 + legendEntries.length * 20 + 8) };

  const scene: LayoutScene = {
    viewId: options.viewId ?? "default",
    viewBox: { x: 0, y: 0, width: quantize(canvasW), height: quantize(canvasH) },
    focusIds: [...focusIds],
    detail,
    boundaries,
    nodes,
    frames,
    routes,
    labels,
    cards,
    badges,
    legend: { rect: legendRect, entryIds: legendEntries, labelIds: [] },
  };

  // ---- Geometry validation (deterministic gates on the top-down scene) ----
  for (const route of routes) {
    if (!isOrthogonal(route.points)) {
      diagnostics.push({ code: "ROUTE_NOT_ORTHOGONAL", severity: "error", message: `edge ${route.edgeId} has non-orthogonal segments`, subjects: [route.edgeId] });
    }
    const v = segmentViolations(route.points);
    if (v.zero > 0 || v.micro > 0 || v.microInterior) {
      diagnostics.push({ code: "ROUTE_MICRO_SEGMENT", severity: "error", message: `edge ${route.edgeId} has segments below the 8/16px floors`, subjects: [route.edgeId] });
    }
    if (sideContractViolations(route.points, route.sourceFace, route.targetFace)) {
      diagnostics.push({ code: "ROUTE_SIDE_CONTRACT", severity: "error", message: `edge ${route.edgeId} violates the perpendicular side contract`, subjects: [route.edgeId] });
    }
    for (const b of boundaries) {
      // Border-run checks every segment, not just the end-to-end chord.
      for (let i = 1; i < route.points.length; i++) {
        const seg = { start: route.points[i - 1] ?? { x: 0, y: 0 }, end: route.points[i] ?? { x: 0, y: 0 } };
        if (borderRun(seg, b.paint)) {
          diagnostics.push({ code: "ROUTE_BORDER_RUN", severity: "error", message: `edge ${route.edgeId} runs along a boundary border`, subjects: [route.edgeId, b.id] });
          break;
        }
      }
    }
    for (const node of nodes) {
      if (node.id === route.sourceNodeId || node.id === route.targetNodeId) continue;
      // Every segment against the full node body (all four edges).
      const bodyEdges = [
        { start: { x: node.body.x, y: node.body.y }, end: { x: node.body.x + node.body.width, y: node.body.y } },
        { start: { x: node.body.x + node.body.width, y: node.body.y }, end: { x: node.body.x + node.body.width, y: node.body.y + node.body.height } },
        { start: { x: node.body.x, y: node.body.y + node.body.height }, end: { x: node.body.x + node.body.width, y: node.body.y + node.body.height } },
        { start: { x: node.body.x, y: node.body.y }, end: { x: node.body.x, y: node.body.y + node.body.height } },
      ];
      for (let i = 1; i < route.points.length; i++) {
        const seg = { start: route.points[i - 1] ?? { x: 0, y: 0 }, end: route.points[i] ?? { x: 0, y: 0 } };
        if (bodyEdges.some((edge) => segmentsIntersect(seg, edge))) {
          diagnostics.push({ code: "EDGE_THROUGH_NODE", severity: "error", message: `edge ${route.edgeId} crosses node ${node.resourceId}`, subjects: [route.edgeId, node.resourceId] });
          break;
        }
      }
    }
  }
  // Boundary overlap: non-ancestor boundaries must be disjoint. Ancestor
  // overlap is valid only when the child paint box fits the parent content box.
  const boundaryById = new Map(boundaries.map((b) => [b.id, b]));
  const isAncestor = (ancestorId: string, descendant: string): boolean => {
    let cur = boundaryById.get(descendant)?.parentId;
    while (cur) {
      if (cur === ancestorId) return true;
      cur = boundaryById.get(cur)?.parentId;
    }
    return false;
  };
  for (let i = 0; i < boundaries.length; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const a = boundaries[i];
      const b = boundaries[j];
      if (!a || !b) continue;
      if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) {
        // Ancestor pairs: the child paint box must fit the parent content box.
        const parent = isAncestor(a.id, b.id) ? a : b;
        const child = isAncestor(a.id, b.id) ? b : a;
        const c = parent.content;
        const k = child.paint;
        const fits = k.x >= c.x - 0.5 && k.y >= c.y - 0.5 && k.x + k.width <= c.x + c.width + 0.5 && k.y + k.height <= c.y + c.height + 0.5;
        if (!fits) {
          diagnostics.push({ code: "BOUNDARY_OVERLAP", severity: "error", message: `boundary ${child.id} paint box extends outside ${parent.id} content`, subjects: [child.id, parent.id] });
        }
        continue;
      }
      if (rectsOverlap(a.paint, b.paint)) {
        diagnostics.push({ code: "BOUNDARY_OVERLAP", severity: "error", message: `boundaries ${a.id} and ${b.id} overlap without containment`, subjects: [a.id, b.id] });
      }
    }
  }
  // Node-to-owner containment: every node paints inside its owner scope's
  // boundary (when the owner scope has a boundary in the scene). The scope
  // id is carried EXPLICITLY on the boundary — no fragile ID parsing.
  const ownerBoundary = new Map<string, string>();
  for (const b of boundaries) {
    if (b.scopeId !== undefined) ownerBoundary.set(b.scopeId, b.id);
  }
  for (const n of nodes) {
    const bid = ownerBoundary.get(n.ownerScopeId);
    if (bid === undefined) continue;
    const b = boundaryById.get(bid);
    if (!b) continue;
    const inside = n.body.x >= b.paint.x - 0.5 && n.body.y >= b.paint.y - 0.5 &&
      n.body.x + n.body.width <= b.paint.x + b.paint.width + 0.5 &&
      n.body.y + n.body.height <= b.paint.y + b.paint.height + 0.5;
    if (!inside) {
      diagnostics.push({ code: "CONTAINMENT_INVALID", severity: "error", message: `node ${n.resourceId} paints outside its owner scope ${n.ownerScopeId}`, subjects: [n.resourceId, n.ownerScopeId] });
    }
  }
  // Left-right flow: transpose the validated top-down scene (x ↔ y) so the
  // external tier becomes the left column and tiers flow rightward. Faces
  // rotate with the geometry; glyph/text dimensions are preserved by
  // transposing allocation cells and re-deriving paint bounds.
  let returned = scene;

  const placeTransposedCards = (): void => {
    const rederiveStart = (label: PlacedLabel, left: number, baselineY: number, wrapW: number): void => {
      const lines = wrapText(label.runs[0]?.text ?? "", wrapW, label.fontSize);
      const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
      const h = maskH(lines, label.fontSize);
      label.baseline = { x: left + w / 2, y: baselineY };
      label.mask = { x: quantize(left), y: quantize(baselineY - h), width: quantize(w), height: quantize(h) };
    };
    const rederiveCentered = (label: PlacedLabel, centerX: number, baselineY: number, wrapW: number): void => {
      const lines = wrapText(label.runs[0]?.text ?? "", wrapW, label.fontSize);
      const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
      const h = maskH(lines, label.fontSize);
      label.baseline = { x: centerX, y: baselineY };
      label.mask = { x: quantize(centerX - w / 2), y: quantize(baselineY - h), width: quantize(w), height: quantize(h) };
    };
    for (const card of returned.cards) {
      const cardLabels = returned.labels.filter((l) => card.labelIds.includes(l.id));
      const header = cardLabels.find((l) => !l.subjectId.includes("::"));
      const rows = cardLabels.filter((l) => l.subjectId.includes("::dest") || l.subjectId.includes("::target"));
      const wrapW = Math.max(48, card.rect.width - 16);
      const destLabels = rows.filter((l) => l.subjectId.includes("::dest"));
      const targetLabels = rows.filter((l) => l.subjectId.includes("::target"));
      if (card.rect.height > card.rect.width) {
        // Stacked (left-right): title mask at card.y+6, rows stack below
        // the headings at 56px pair intervals.
        let headerLineY = card.rect.y + 32;
        let headingsY = headerLineY + 12;
        let firstRowY = headingsY + 16;
        if (header) {
          const titleLines = wrapText(header.runs[0]?.text ?? "", wrapW, header.fontSize);
          const tw = Math.max(...titleLines.map((l) => fallbackMaskW(l, header.fontSize)));
          const th = maskH(titleLines, header.fontSize);
          header.baseline = { x: card.rect.x + 8 + tw / 2, y: card.rect.y + 6 + th };
          header.mask = { x: quantize(card.rect.x + 8), y: quantize(card.rect.y + 6), width: quantize(tw), height: quantize(th) };
          headerLineY = card.rect.y + 6 + th + 8;
          headingsY = headerLineY + 12;
          firstRowY = headingsY + 16;
          card.headerLineY = quantize(headerLineY);
          card.headingsY = quantize(headingsY);
          card.firstRowY = quantize(firstRowY);
        }
        const destHs = destLabels.map((l) => maskH(wrapText(l.runs[0]?.text ?? "", wrapW, l.fontSize), l.fontSize));
        const targetHs = targetLabels.map((l) => maskH(wrapText(l.runs[0]?.text ?? "", wrapW, l.fontSize), l.fontSize));
        let rowY = firstRowY + 12;
        const baselines: number[] = [];
        destLabels.forEach((l, i) => {
          const dh = destHs[i] ?? 24;
          rederiveStart(l, card.rect.x + 8, rowY + dh, wrapW);
          baselines.push(rowY + dh);
          rowY += dh + 4;
          const t = targetLabels[i];
          if (t) {
            const th2 = targetHs[i] ?? 24;
            rederiveStart(t, card.rect.x + 8, rowY + th2, wrapW);
            baselines.push(rowY + th2);
            rowY += th2 + 8;
          }
        });
        card.rowBaselines = baselines;
        // Grow the card to contain the rows.
        if (rowY > card.rect.y + card.rect.height) card.rect.height = quantize(rowY - card.rect.y);
      } else {
        // Side-by-side (top-down): title mask at card.y+4, rows at their
        // column centers spaced by the measured mask height.
        let headerLineY = card.rect.y + 36;
        let headingsY = headerLineY + 12;
        let firstRowY = headingsY + 16;
        if (header) {
          const titleLines = wrapText(header.runs[0]?.text ?? "", wrapW, header.fontSize);
          const tw = Math.max(...titleLines.map((l) => fallbackMaskW(l, header.fontSize)));
          const th = maskH(titleLines, header.fontSize);
          header.baseline = { x: card.rect.x + 8 + tw / 2, y: card.rect.y + 4 + th };
          header.mask = { x: quantize(card.rect.x + 8), y: quantize(card.rect.y + 4), width: quantize(tw), height: quantize(th) };
          headerLineY = card.rect.y + 4 + th + 8;
          headingsY = headerLineY + 12;
          firstRowY = headingsY + 16;
          card.headerLineY = quantize(headerLineY);
          card.headingsY = quantize(headingsY);
          card.firstRowY = quantize(firstRowY);
        }
        const maxH = rows.length > 0 ? Math.max(...rows.map((l) => maskH(wrapText(l.runs[0]?.text ?? "", 220, l.fontSize), l.fontSize))) : 24;
        const spacing = Math.max(40, maxH + 8);
        const baselines: number[] = [];
        destLabels.forEach((l, i) => {
          const h = maskH(wrapText(l.runs[0]?.text ?? "", wrapW, l.fontSize), l.fontSize);
          rederiveCentered(l, card.rect.x + 24 + card.destinationWidth / 2, firstRowY + i * spacing + h, wrapW);
          baselines.push(firstRowY + i * spacing + h);
        });
        targetLabels.forEach((l, i) => {
          const h = maskH(wrapText(l.runs[0]?.text ?? "", wrapW, l.fontSize), l.fontSize);
          rederiveCentered(l, card.rect.x + 24 + card.destinationWidth + 24 + 85, firstRowY + i * spacing + h, wrapW);
        });
        card.rowHeights = destLabels.map(() => spacing);
        card.rowBaselines = baselines;
        // Grow the card to contain the last row.
        const lastBottom = baselines.length > 0 ? (baselines[baselines.length - 1] ?? firstRowY) + 8 : firstRowY;
        if (lastBottom > card.rect.y + card.rect.height) card.rect.height = quantize(lastBottom - card.rect.y);
      }
    }
  };
  if (flow === "left-right") {
    const tRect = (r: Rect): Rect => ({ x: r.y, y: r.x, width: r.height, height: r.width });
    const tPoint = (p: Point): Point => ({ x: p.y, y: p.x });
    const tFace = (f: Face): Face => (f === "left" ? "top" : f === "right" ? "bottom" : f === "top" ? "left" : "right");
    returned = {
      ...scene,
      viewBox: { x: 0, y: 0, width: quantize(canvasH), height: quantize(canvasW) },
      boundaries: scene.boundaries.map((b) => ({ ...b, paint: tRect(b.paint), content: tRect(b.content) })),
      nodes: scene.nodes.map((n) => {
        // Transpose the allocation cell AND the painted body directly — the
        // painted geometry is dimension-preserving under transpose, so route
        // endpoints stay exactly on the visible bounds.
        return { ...n, cell: tRect(n.cell), body: tRect(n.body) };
      }),
      frames: scene.frames.map((f) => ({ ...f, segments: f.segments.map(tRect) })),
      routes: scene.routes.map((r) => ({ ...r, points: r.points.map(tPoint), sourceFace: tFace(r.sourceFace), targetFace: tFace(r.targetFace) })),
      labels: scene.labels.map((l) => ({ ...l, mask: tRect(l.mask), baseline: tPoint(l.baseline) })),
      cards: scene.cards.map((c) => ({ ...c, rect: tRect(c.rect) })),
      badges: scene.badges.map((b) => ({ ...b, rect: tRect(b.rect) })),
      legend: { ...scene.legend, rect: tRect(scene.legend.rect) },
    };
    // Revalidate the transposed geometry: boundary containment and
    // node-to-owner containment must hold after the transpose.
    const tBoundaryById = new Map(returned.boundaries.map((b) => [b.id, b]));
    const tIsAncestor = (ancestorId: string, descendant: string): boolean => {
      let cur = tBoundaryById.get(descendant)?.parentId;
      while (cur) {
        if (cur === ancestorId) return true;
        cur = tBoundaryById.get(cur)?.parentId;
      }
      return false;
    };
    for (let i = 0; i < returned.boundaries.length; i++) {
      for (let j = i + 1; j < returned.boundaries.length; j++) {
        const a = returned.boundaries[i];
        const b = returned.boundaries[j];
        if (!a || !b) continue;
        if (tIsAncestor(a.id, b.id) || tIsAncestor(b.id, a.id)) {
          const parent = tIsAncestor(a.id, b.id) ? a : b;
          const child = tIsAncestor(a.id, b.id) ? b : a;
          const c = parent.content;
          const k = child.paint;
          const fits = k.x >= c.x - 0.5 && k.y >= c.y - 0.5 && k.x + k.width <= c.x + c.width + 0.5 && k.y + k.height <= c.y + c.height + 0.5;
          if (!fits) {
            diagnostics.push({ code: "BOUNDARY_OVERLAP", severity: "error", message: `transposed boundary ${child.id} paint box extends outside ${parent.id} content`, subjects: [child.id, parent.id] });
          }
          continue;
        }
        if (rectsOverlap(a.paint, b.paint)) {
          diagnostics.push({ code: "BOUNDARY_OVERLAP", severity: "error", message: `transposed boundaries ${a.id} and ${b.id} overlap without containment`, subjects: [a.id, b.id] });
        }
      }
    }
    const tOwnerBoundary = new Map<string, string>();
    for (const b of returned.boundaries) {
      if (b.scopeId !== undefined) tOwnerBoundary.set(b.scopeId, b.id);
    }
    for (const n of returned.nodes) {
      const bid = tOwnerBoundary.get(n.ownerScopeId);
      if (bid === undefined) continue;
      const b = tBoundaryById.get(bid);
      if (!b) continue;
      const inside = n.body.x >= b.paint.x - 0.5 && n.body.y >= b.paint.y - 0.5 &&
        n.body.x + n.body.width <= b.paint.x + b.paint.width + 0.5 &&
        n.body.y + n.body.height <= b.paint.y + b.paint.height + 0.5;
      if (!inside) {
        diagnostics.push({ code: "CONTAINMENT_INVALID", severity: "error", message: `transposed node ${n.resourceId} paints outside its owner scope ${n.ownerScopeId}`, subjects: [n.resourceId, n.ownerScopeId] });
      }
    }
    // Post-transpose label repair: transposed card labels re-stack
    // vertically inside their transposed card, negative-x masks clamp into
    // the canvas, and the collision repair re-runs on the transposed masks.
    {
      const rederive = (label: PlacedLabel, baseline: Point): void => {
        const lines = wrapText(label.runs[0]?.text ?? "", 220, label.fontSize);
        const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
        const h = maskH(lines, label.fontSize);
        label.baseline = baseline;
        label.mask = { x: quantize(baseline.x - w / 2), y: quantize(baseline.y - h), width: quantize(w), height: quantize(h) };
      };
      // Card labels re-stack vertically inside the transposed card,
      // START-anchored at the card's left inset.
      const rederiveStart = (label: PlacedLabel, left: number, baselineY: number): void => {
        const lines = wrapText(label.runs[0]?.text ?? "", 220, label.fontSize);
        const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
        const h = maskH(lines, label.fontSize);
        label.baseline = { x: left + w / 2, y: baselineY };
        label.mask = { x: quantize(left), y: quantize(baselineY - h), width: quantize(w), height: quantize(h) };
      };
      placeTransposedCards();
      // Negative-x masks clamp into the canvas. Transposed card labels are
      // excluded — they are placed inside their card by the card block.
      const cardLabelIds = new Set(returned.cards.flatMap((c) => c.labelIds));
      for (const l of returned.labels) {
        if (cardLabelIds.has(l.id)) continue;
        if (l.mask.x < 4) {
          rederive(l, { x: l.baseline.x + (4 - l.mask.x), y: l.baseline.y });
        }
        if (l.mask.y < 4) {
          rederive(l, { x: l.baseline.x, y: l.baseline.y + (4 - l.mask.y) });
        }
      }
      // Collision repair re-runs on the transposed masks.
      const overlapOf = (a: Rect, b: Rect): number =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
          ? Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
          : 0;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        let repaired = false;
        const ordered = [...returned.labels].filter((l) => !cardLabelIds.has(l.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        for (let i = 0; i < ordered.length; i++) {
          for (let j = i + 1; j < ordered.length; j++) {
            const a = ordered[i];
            const b = ordered[j];
            if (!a || !b) continue;
            const overlap = overlapOf(a.mask, b.mask);
            if (overlap > 0.5) {
              rederive(b, { x: b.baseline.x, y: b.baseline.y + overlap + 4 });
              repaired = true;
            }
          }
        }
        if (!repaired) break;
      }
    }
    // Transposed label paint: every label mask paints inside the canvas.
    for (const l of returned.labels) {
      const m = l.mask;
      const inside = m.x >= 0 && m.y >= 0 && m.x + m.width <= returned.viewBox.width && m.y + m.height <= returned.viewBox.height;
      if (!inside) {
        diagnostics.push({ code: "CONTAINMENT_INVALID", severity: "error", message: `transposed label ${l.id} paints outside the canvas`, subjects: [l.subjectId] });
      }
    }
  }
  // Projected font floor: role-aware (primary ≥ 11 CSS px, sublabel ≥ 9).
  // The expansion runs against the FINAL (transposed) canvas dims so the
  // floor holds in both flows.
  const finalW = returned.viewBox.width;
  const finalH = returned.viewBox.height;
  const scale = Math.min(THRESHOLDS.availableDiagramW / finalW, THRESHOLDS.desktopViewportH / finalH);
  const floorFor = (role: PlacedLabel["runs"][number]["colorRole"]): number =>
    role === "primary" ? THRESHOLDS.projectedPrimaryFloor : THRESHOLDS.projectedSublabelFloor;
  const transposedCardLabelIds = new Set(returned.cards.flatMap((c) => c.labelIds));
  const cardByLabelId = new Map<string, (typeof returned.cards)[number]>();
  for (const c of returned.cards) for (const id of c.labelIds) cardByLabelId.set(id, c);
  for (const label of returned.labels) {
    const floor = floorFor(label.runs[0]?.colorRole ?? "primary");
    const card = cardByLabelId.get(label.id);
    while (label.fontSize * scale < floor && label.fontSize < 64) {
      label.fontSize += 1;
      // Re-derive the mask from the expanded font size. Card labels wrap to
      // the card width and preserve their OWN mask.x (dest left / target
      // right in top-down; card-block start anchor in left-right).
      const wrapW = card ? Math.max(48, card.rect.width - 16) : 220;
      const lines = wrapText(label.runs[0]?.text ?? "", wrapW, label.fontSize);
      const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
      const h = maskH(lines, label.fontSize);
      label.mask = card
        ? { x: label.mask.x, y: quantize(label.baseline.y - h), width: quantize(w), height: quantize(h) }
        : { x: quantize(label.baseline.x - w / 2), y: quantize(label.baseline.y - h), width: quantize(w), height: quantize(h) };
      label.baseline = card
        ? { x: label.mask.x + w / 2, y: label.baseline.y }
        : label.baseline;
    }
    if (label.fontSize * scale < floor) {
      diagnostics.push({ code: "PROJECTED_FONT_FLOOR", severity: "error", message: `label ${label.id} projects below the ${floor}px floor (scale ${scale.toFixed(2)})`, subjects: [label.subjectId] });
    }
  }
  // Re-run the transposed card placement after the font-floor expansion:
  // grown fonts re-wrap to the card width and the geometry shifts down so
  // every card label stays inside its card.
  placeTransposedCards();
  // Final repair: the font-floor expansion re-centers masks and can create
  // new overlaps — clamp negative masks and re-run the collision repair as
  // the LAST step so the delivered scene has no intersecting label pairs.
  {
    const rederive = (label: PlacedLabel, baseline: Point): void => {
      const lines = wrapText(label.runs[0]?.text ?? "", 220, label.fontSize);
      const w = Math.max(...lines.map((l) => fallbackMaskW(l, label.fontSize)));
      const h = maskH(lines, label.fontSize);
      label.baseline = baseline;
      label.mask = { x: quantize(baseline.x - w / 2), y: quantize(baseline.y - h), width: quantize(w), height: quantize(h) };
    };
    for (const l of returned.labels) {
      if (transposedCardLabelIds.has(l.id)) continue;
      if (l.mask.x < 4) rederive(l, { x: l.baseline.x + (4 - l.mask.x), y: l.baseline.y });
      if (l.mask.y < 4) rederive(l, { x: l.baseline.x, y: l.baseline.y + (4 - l.mask.y) });
    }
    const overlapOf = (a: Rect, b: Rect): number =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        ? Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        : 0;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      let repaired = false;
      const ordered = [...returned.labels].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const a = ordered[i];
          const b = ordered[j];
          if (!a || !b) continue;
          const overlap = overlapOf(a.mask, b.mask);
          if (overlap > 0.1) {
            // Card labels are fixed anchors: move the non-card side.
            const aFixed = transposedCardLabelIds.has(a.id);
            const bFixed = transposedCardLabelIds.has(b.id);
            if (aFixed && bFixed) continue;
            const mover = aFixed ? b : a;
            rederive(mover, { x: mover.baseline.x, y: mover.baseline.y + overlap + 4 });
            repaired = true;
          }
        }
      }
      if (!repaired) break;
    }
  }
  return { scene: returned, diagnostics };
}


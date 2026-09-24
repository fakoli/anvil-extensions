// Typed deterministic gates (T001/T004) — schema/semantic checks + receipts.
// Implemented from the lead-engineer report (docs/implementation-report.md §4).
// Deterministic, offline; no timestamps, JEV responses, or machine-local paths
// in receipts. Unknown facts never become "passed", "secure", or reference-grade.

import type { StratusSpec, CIDR } from "./schema.ts";
import { normalizeSpec, type NormalizedIndexes, ancestorChain } from "./normalize.ts";
import { parseCIDR, parseSchemaCIDR, containsCIDR, overlapsCIDR, type ParsedCIDR } from "./cidr.ts";
import { catalogEntry, placementMatches } from "./cloud.ts";
import { PINNED_METRICS, metricsHash } from "./metrics.ts";
import { THRESHOLDS } from "./profiles.ts";
import type { Rect, Segment } from "./geometry.ts";
import { rectsOverlap, isOrthogonal, segmentViolations, sideContractViolations, borderRun, segmentsIntersect, segmentDistance } from "./geometry.ts";

export type Severity = "error" | "warning" | "unknown" | "info";
export type Phase = "schema" | "semantic" | "layout" | "export";

export type DiagnosticCode =
  | "FIELD_INVALID"
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
  | "CIDR_UNVERIFIED"
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

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  phase: Phase;
  message: string;
  subjects: readonly string[];
  pointer?: string;
  evidence: {
    rule: string;
    actual?: string | number | boolean;
    expected?: string | number | boolean;
    rectangles?: readonly Rect[];
    segment?: { start: { x: number; y: number }; end: { x: number; y: number } };
    relatedPointers?: readonly string[];
  };
  supportedFixes: readonly {
    kind: "edit-spec" | "layout" | "choose-short-label" | "split-view";
    instruction: string;
    subjectIds: readonly string[];
  }[];
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

export const ENGINE_VERSION = "stratus-engine-v1";

function diag(
  code: DiagnosticCode,
  severity: Severity,
  phase: Phase,
  message: string,
  subjects: readonly string[],
  rule: string,
  fixes: readonly { instruction: string; subjectIds?: readonly string[] }[] = [],
): Diagnostic {
  return {
    code,
    severity,
    phase,
    message,
    subjects,
    evidence: { rule },
    supportedFixes: fixes.map((f) => ({
      kind: "edit-spec" as const,
      instruction: f.instruction,
      subjectIds: f.subjectIds ?? subjects,
    })),
  };
}

/** Resolve a service id like "aws.ec2" into a catalog entry id. */
// ---- Semantic gates ----

function catalogIdFor(service: string): string | undefined {
  const dot = service.indexOf(".");
  const bare = dot === -1 ? service : service.slice(dot + 1);
  return catalogEntry(bare) ? bare : undefined;
}

export function validateContainment(spec: StratusSpec, indexes: NormalizedIndexes): GateResult {
  const diagnostics: Diagnostic[] = [];
  // Every attachment references an existing subnet.
  for (const [resourceId, attachments] of indexes.attachmentInstances) {
    for (const a of attachments) {
      if (!indexes.byId.has(a.subnetId)) {
        diagnostics.push(
          diag("REFERENCE_MISSING", "error", "semantic", `resource ${resourceId} attaches to unknown subnet ${a.subnetId}`, [resourceId, a.subnetId], "semantic.placement.attachment-exists", [
            { instruction: `create subnet ${a.subnetId} or attach ${resourceId} to an existing subnet` },
          ]),
        );
      }
    }
  }
  // AWS subnets must have exactly one AZ-slice parent; GCP/Azure subnets never sit under a zone.
  if (spec.provider === "aws") {
    for (const [id, entity] of indexes.byId) {
      if ((entity as { kind?: string }).kind === "subnet") {
        const parent = indexes.parentOf.get(id);
        const parentEntity = parent ? indexes.byId.get(parent) : undefined;
        if ((parentEntity as { kind?: string } | undefined)?.kind !== "aws-az-slice") {
          diagnostics.push(
            diag("CONTAINMENT_INVALID", "error", "semantic", `AWS subnet ${id} must live under an AZ slice`, [id], "semantic.containment.aws-subnet-az"),
          );
        }
      }
    }
  }
  // Zone references must resolve to declared geography.
  const zoneCheck = (zoneRef: { regionId: string; zone: string }, subject: string): void => {
    if (!zoneRef.zone) return; // region-scoped (no zone) — nothing to check
    const region = spec.geography.find((g) => g.id === zoneRef.regionId);
    if (!region) {
      diagnostics.push(
        diag("REFERENCE_MISSING", "error", "semantic", `zone reference ${zoneRef.regionId}::${zoneRef.zone} has no declared region`, [subject], "semantic.geography.zone-resolves"),
      );
    } else if (!region.zones.includes(zoneRef.zone)) {
      diagnostics.push(
        diag("REFERENCE_MISSING", "error", "semantic", `zone ${zoneRef.zone} is not declared in region ${zoneRef.regionId}`, [subject], "semantic.geography.zone-declared"),
      );
    }
  };
  const walkResources = (resources: readonly unknown[]): void => {
    for (const entry of resources) {
      if (entry === null || entry === undefined) continue;
      const r = entry as { id: string; placement: { kind: string; zone?: { regionId: string; zone: string }; zones?: readonly { regionId: string; zone: string }[]; attachment?: { zone?: { regionId: string; zone: string } }; attachments?: readonly { zone?: { regionId: string; zone: string } }[] } };
      const p = r.placement;
      if (p.kind === "single-zone" && p.zone) zoneCheck(p.zone, r.id);
      if (p.kind === "multi-zone" && p.zones) for (const z of p.zones) zoneCheck(z, r.id);
      if (p.kind === "single-subnet" && p.attachment?.zone) zoneCheck(p.attachment.zone, r.id);
      if (p.kind === "multi-subnet" && p.attachments) {
        for (const a of p.attachments) {
          if (a.zone) zoneCheck(a.zone, r.id);
        }
      }
    }
  };
  if (spec.provider === "aws") {
    for (const region of spec.cloud.regions) {
      // Cloud and regional resources are zone-checked too.
      walkResources((region as unknown as { resources?: readonly { id: string; placement: { kind: string } }[] }).resources ?? []);
      for (const vpc of region.vpcs) {
        walkResources(vpc.resources ?? []);
        for (const az of vpc.azs) {
          zoneCheck(az.zone, az.id);
          walkResources(az.resources ?? []);
          for (const subnet of az.subnets ?? []) walkResources(subnet.resources ?? []);
        }
      }
    }
  } else if (spec.provider === "gcp") {
    for (const network of spec.cloud.networks) {
      walkResources(network.resources ?? []);
      for (const netRegion of network.regions) {
        zoneCheck({ regionId: netRegion.regionId, zone: (netRegion as { zone?: string }).zone ?? "" }, netRegion.id);
        walkResources(netRegion.resources ?? []);
        for (const subnet of netRegion.subnets ?? []) walkResources(subnet.resources);
      }
    }
  } else {
    for (const region of spec.cloud.regions) {
      zoneCheck({ regionId: region.regionId, zone: (region as { zone?: string }).zone ?? "" }, region.id);
      walkResources(region.resources ?? []);
      const azureVnets = region.vnets ?? (region as { vpcs?: readonly { resources?: readonly never[]; subnets?: readonly { resources?: readonly never[] }[] }[] }).vpcs ?? [];
      for (const vnet of azureVnets) {
        walkResources(vnet.resources ?? []);
        for (const subnet of vnet.subnets ?? []) walkResources(subnet.resources);
      }
    }
  }
  return {
    id: "containment",
    phase: "semantic",
    status: diagnostics.length > 0 ? "failed" : "passed",
    diagnostics,
  };
}

export function validatePlacement(spec: StratusSpec, indexes: NormalizedIndexes): GateResult {
  const diagnostics: Diagnostic[] = [];
  const subnetClassification = (subnetId: string): "public" | "private" | "isolated" | "unspecified" => {
    const entity = indexes.byId.get(subnetId);
    const cls = (entity as { classification?: string } | undefined)?.classification;
    return cls === "public" || cls === "private" || cls === "isolated" ? cls : "unspecified";
  };
  const checkResource = (service: string, placementKindRaw: string, resourceId: string, subnetIds: readonly string[] = []): void => {
    // Provider prefix must agree with the spec provider.
    const dot = service.indexOf(".");
    if (dot !== -1) {
      const prefix = service.slice(0, dot);
      if ((prefix === "aws" || prefix === "gcp" || prefix === "azure") && prefix !== spec.provider) {
        diagnostics.push(
          diag("PROVIDER_SCOPE_INVALID", "error", "semantic", `service ${service} carries a ${prefix} prefix but the spec declares ${spec.provider}`, [resourceId], "semantic.provider-scope.prefix-agreement", [
            { instruction: `use a ${spec.provider}-prefixed service or correct the spec provider` },
          ]),
        );
        return;
      }
    }
    const bare = catalogIdFor(service);
    if (bare === undefined) {
      diagnostics.push(
        diag("PROVIDER_SCOPE_INVALID", "unknown", "semantic", `service ${service} is not in the pinned catalog; placement capabilities unknown`, [resourceId], "semantic.provider-scope.catalog", [
          { instruction: `add ${service} to src/cloud.ts or correct the service id` },
        ]),
      );
      return;
    }
    // Resolve the attached subnets' classifications: a resource in public
    // subnets is public-subnet placement; private subnets are private-subnet.
    const classifications = subnetIds.map(subnetClassification);
    const placementKind =
      (placementKindRaw === "single-subnet" || placementKindRaw === "multi-subnet") && subnetIds.length > 0
        ? classifications.every((c) => c === "public") ? "public-subnet" : "private-subnet"
        : placementKindRaw === "single-subnet" || placementKindRaw === "multi-subnet" ? "private-subnet"
        : placementKindRaw === "single-zone" || placementKindRaw === "multi-zone" ? "region-scoped"
        : placementKindRaw === "network" ? "vpc-scoped"
        : placementKindRaw === "region" ? "region-scoped"
        : placementKindRaw === "global" ? "outside-cloud" : placementKindRaw;
    if (!placementMatches(bare, placementKind as never)) {
      const entry = catalogEntry(bare);
      diagnostics.push(
        diag("PLACEMENT_INVALID", "error", "semantic", `${bare} cannot be placed as ${placementKind} (default: ${entry?.placement ?? "unknown"})`, [resourceId], "semantic.provider-scope.placement", [
          { instruction: `move ${resourceId} to a ${entry?.placement ?? "supported"} placement` },
        ]),
      );
    }
  };
  const walk = (
    resources: readonly { id: string; service: string; placement: { kind: string; attachment?: { subnetId: string; zone?: { regionId: string; zone: string } }; attachments?: readonly { subnetId: string; zone?: { regionId: string; zone: string } }[] } }[],
    regionId: string,
    networkId: string,
  ): void => {
    for (const r of resources) {
      if (r === null || r === undefined) continue;
      const subnetIds: string[] = [];
      if (r.placement.kind === "single-subnet" && r.placement.attachment) subnetIds.push(r.placement.attachment.subnetId);
      if (r.placement.kind === "multi-subnet" && r.placement.attachments) for (const a of r.placement.attachments) subnetIds.push(a.subnetId);
      checkResource(r.service, r.placement.kind, r.id, subnetIds);
      // A network placement target must reference the resource's owning network.
      if (r.placement.kind === "network") {
        const target = (r.placement as { networkId?: string }).networkId;
        if (target !== undefined && target !== networkId) {
          diagnostics.push(
            diag("PLACEMENT_INVALID", "error", "semantic", `resource ${r.id} declares network placement in ${target} but lives in network ${networkId}`, [r.id], "semantic.placement.network-owner", [
              { instruction: `set ${r.id} network placement to its owning network ${networkId}` },
            ]),
          );
        }
      }
      // Regional placement must reference the region that owns the resource.
      if (r.placement.kind === "region" && r.placement.kind !== undefined) {
        const target = (r.placement as { regionId?: string }).regionId;
        if (target !== undefined && target !== regionId) {
          diagnostics.push(
            diag("PLACEMENT_INVALID", "error", "semantic", `resource ${r.id} declares regional placement in ${target} but lives in ${regionId}`, [r.id], "semantic.placement.region-owner", [
              { instruction: `set ${r.id} regional placement to its owning region ${regionId}` },
            ]),
          );
        }
      }
      // Attachment zone must agree with the subnet's AZ slice.
      const attachments = r.placement.kind === "single-subnet" && r.placement.attachment ? [r.placement.attachment] : r.placement.kind === "multi-subnet" && r.placement.attachments ? [...r.placement.attachments] : [];
      for (const a of attachments) {
        if (a.zone === undefined) continue;
        const subnetEntity = indexes.byId.get(a.subnetId);
        const subnetParentId = indexes.parentOf.get(a.subnetId);
        const azEntity = subnetParentId ? indexes.byId.get(subnetParentId) : undefined;
        const azZone = (azEntity as { zone?: { regionId: string; zone: string } } | undefined)?.zone;
        if (azZone && (azZone.regionId !== a.zone.regionId || azZone.zone !== a.zone.zone)) {
          diagnostics.push(
            diag("PLACEMENT_INVALID", "error", "semantic", `attachment of ${r.id} declares AZ ${a.zone.regionId}::${a.zone.zone} but subnet ${a.subnetId} lives in ${azZone.regionId}::${azZone.zone}`, [r.id, a.subnetId], "semantic.placement.attachment-zone", [
              { instruction: `align the attachment AZ with subnet ${a.subnetId}'s AZ slice` },
            ]),
          );
        }
      }
    }
  };
  if (spec.provider === "aws") {
    for (const region of spec.cloud.regions) {
      for (const vpc of region.vpcs) {
        walk(vpc.resources ?? [], region.id, vpc.id);
        for (const az of vpc.azs) {
          walk(az.resources ?? [], region.id, vpc.id);
          for (const subnet of az.subnets ?? []) walk(subnet.resources ?? [], region.id, vpc.id);
        }
      }
      for (const r of region.resources ?? []) walk(r ? [r] : [], region.id, region.id);
    }
  } else if (spec.provider === "gcp") {
    // GCP network-level and geographic-region resources are walked too —
    // a placement target must resolve at every scope level.
    for (const network of spec.cloud.networks) {
      walk((network as { resources?: readonly { id: string; service: string; placement: { kind: string } }[] }).resources ?? [], network.id, network.id);
      for (const netRegion of network.regions) {
        walk(netRegion.resources ?? [], netRegion.id, network.id);
        for (const subnet of netRegion.subnets ?? []) walk(subnet.resources ?? [], netRegion.id, network.id);
      }
    }
    for (const region of spec.cloud.regions) {
      walk((region as { resources?: readonly { id: string; service: string; placement: { kind: string; zone?: { regionId: string; zone: string } } }[] }).resources ?? [], region.id, region.id);
    }
  } else {
    for (const region of spec.cloud.regions) {
      // Azure regional resources are walked too (zone traversal includes
      // cloud/regional/AZ resources for every provider).
      walk((region as { resources?: readonly { id: string; service: string; placement: { kind: string; zone?: { regionId: string; zone: string } } }[] }).resources ?? [], region.id, region.id);
      const placementVnets = region.vnets ?? (region as { vpcs?: readonly { resources?: readonly { id: string; placement: { kind: string } }[]; subnets: readonly { resources?: readonly { id: string; placement: { kind: string } }[] }[] }[] }).vpcs ?? [];
      for (const vnet of placementVnets) {
        walk(vnet.resources ?? [], region.id, vnet.id);
        for (const subnet of vnet.subnets ?? []) walk(subnet.resources ?? [], region.id, vnet.id);
      }
    }
  }
  return {
    id: "placement",
    phase: "semantic",
    status: diagnostics.length > 0 ? "failed" : "passed",
    diagnostics,
  };
}


export function validateCIDR(spec: StratusSpec): GateResult {
  const diagnostics: Diagnostic[] = [];
  const checkSubnets = (networkId: string, cidrs: readonly CIDR[], subnets: readonly { id: string; cidrs: { status: string; value?: unknown } }[]): void => {
    const parsedParents: ParsedCIDR[] = [];
    for (const c of cidrs) {
      const parsed = parseSchemaCIDR(c);
      if ("code" in parsed) {
        diagnostics.push(diag(parsed.code === "CIDR_HOST_BITS" ? "CIDR_INVALID" : "CIDR_INVALID", "error", "semantic", `${networkId}: ${parsed.message}`, [networkId], "semantic.cidr.parse"));
        continue;
      }
      parsedParents.push(parsed);
    }
    const parsedSubnets: { id: string; parsed: ParsedCIDR }[] = [];
    for (const s of subnets) {
      if (s.cidrs.status !== "known") {
        diagnostics.push(diag("CIDR_UNVERIFIED", "warning", "semantic", `subnet ${s.id} CIDRs are unknown; containment was not checked`, [s.id], "semantic.cidr.subnet-unknown-reported"));
        continue;
      }
      for (const c of (s.cidrs.value as readonly CIDR[] | undefined) ?? []) {
        const parsed = parseSchemaCIDR(c);
        if ("code" in parsed) {
          diagnostics.push(diag("CIDR_INVALID", "error", "semantic", `subnet ${s.id}: ${parsed.message}`, [s.id], "semantic.cidr.parse"));
          continue;
        }
        parsedSubnets.push({ id: s.id, parsed });
        const fits = parsedParents.some((p) => containsCIDR(p, parsed));
        if (parsedParents.length > 0 && !fits) {
          diagnostics.push(
            diag("CIDR_OUTSIDE_PARENT", "error", "semantic", `subnet ${s.id} range ${c.value} is outside ${networkId} declared ranges`, [s.id, networkId], "semantic.cidr.containment", [
              { instruction: `move ${s.id} range inside ${networkId} CIDRs or widen the parent range` },
            ]),
          );
        }
      }
    }
    // Overlap across the ENTIRE network, not merely tree siblings.
    for (let i = 0; i < parsedSubnets.length; i++) {
      for (let j = i + 1; j < parsedSubnets.length; j++) {
        const a = parsedSubnets[i];
        const b = parsedSubnets[j];
        if (a && b && overlapsCIDR(a.parsed, b.parsed)) {
          diagnostics.push(
            diag("CIDR_OVERLAP", "error", "semantic", `subnets ${a.id} and ${b.id} have overlapping ranges`, [a.id, b.id], "semantic.cidr.no-sibling-overlap", [
              { instruction: `re-range ${b.id} outside ${a.parsed.family === "ipv4" ? "the IPv4" : "the IPv6"} range of ${a.id}` },
            ]),
          );
        }
      }
    }
  };
  if (spec.provider === "aws") {
    for (const region of spec.cloud.regions) {
      for (const vpc of region.vpcs) {
        if (vpc.cidrs.status === "known") {
          checkSubnets(vpc.id, vpc.cidrs.value, vpc.azs.flatMap((az) => az.subnets));
        } else {
          // Missing evidence is reported explicitly, never treated as verified.
          // Known children are still validated independently of the parent.
          diagnostics.push(
            diag("CIDR_UNVERIFIED", "warning", "semantic", `VPC ${vpc.id} CIDRs are unknown (${vpc.cidrs.reason}); sibling-overlap containment was not checked`, [vpc.id], "semantic.cidr.unknown-reported"),
          );
          // Known children are still overlap-checked independently of the
          // unknown parent — a warning never substitutes for the gate.
          const orphanSubnets: { id: string; parsed: ParsedCIDR }[] = [];
          for (const subnet of vpc.azs.flatMap((az) => az.subnets)) {
            if (subnet.cidrs.status !== "known") continue;
            for (const c of (subnet.cidrs.value as readonly CIDR[] | undefined) ?? []) {
              const p = parseSchemaCIDR(c);
              if ("code" in p) {
                diagnostics.push(diag("CIDR_INVALID", "error", "semantic", `subnet ${subnet.id}: ${p.message}`, [subnet.id], "semantic.cidr.parse"));
              } else {
                orphanSubnets.push({ id: subnet.id, parsed: p });
              }
            }
          }
          for (let i = 0; i < orphanSubnets.length; i++) {
            for (let j = i + 1; j < orphanSubnets.length; j++) {
              const a = orphanSubnets[i];
              const b = orphanSubnets[j];
              if (a && b && overlapsCIDR(a.parsed, b.parsed)) {
                diagnostics.push(
                  diag("CIDR_OVERLAP", "error", "semantic", `subnets ${a.id} and ${b.id} have overlapping ranges (parent ${vpc.id} CIDRs unknown)`, [a.id, b.id], "semantic.cidr.no-sibling-overlap", [
                    { instruction: `re-range ${b.id} outside ${a.parsed.family === "ipv4" ? "the IPv4" : "the IPv6"} range of ${a.id}` },
                  ]),
                );
              }
            }
          }
        }
      }
    }
  } else if (spec.provider === "azure") {
    for (const region of spec.cloud.regions) {
      const cidrVnets = region.vnets ?? (region as { vpcs?: readonly { cidrs: { status: string; value?: unknown }; subnets: readonly { id: string; cidrs: { status: string; value?: unknown } }[] }[] }).vpcs ?? [];
      for (const vnet of cidrVnets) {
        if (vnet.cidrs.status === "known") {
          checkSubnets(vnet.id, vnet.cidrs.value, vnet.subnets ?? []);
        } else {
          diagnostics.push(
            diag("CIDR_UNVERIFIED", "warning", "semantic", `VNet ${vnet.id} CIDRs are unknown (${vnet.cidrs.reason}); sibling-overlap containment was not checked`, [vnet.id], "semantic.cidr.unknown-reported"),
          );
          for (const subnet of vnet.subnets ?? []) {
            if (subnet.cidrs.status !== "known") continue;
            for (const c of (subnet.cidrs.value as readonly CIDR[] | undefined) ?? []) {
              const p = parseSchemaCIDR(c);
              if ("code" in p) {
                diagnostics.push(diag("CIDR_INVALID", "error", "semantic", `subnet ${subnet.id}: ${p.message}`, [subnet.id], "semantic.cidr.parse"));
              }
            }
          }
        }
      }
    }
  } else {
    // GCP: no invented global VPC CIDR; subnet ranges validated across the
    // ENTIRE network (all regions), not per region.
    for (const network of spec.cloud.networks) {
      const all: { id: string; parsed: ParsedCIDR }[] = [];
      for (const netRegion of network.regions) {
        for (const subnet of netRegion.subnets) {
          if (subnet.cidrs.status !== "known") {
            diagnostics.push(diag("CIDR_UNVERIFIED", "warning", "semantic", `subnet ${subnet.id} CIDRs are unknown; containment was not checked`, [subnet.id], "semantic.cidr.subnet-unknown-reported"));
            continue;
          }
          for (const c of (subnet.cidrs.value as readonly CIDR[] | undefined) ?? []) {
            const p = parseSchemaCIDR(c);
            if (!("code" in p)) all.push({ id: subnet.id, parsed: p });
            else diagnostics.push(diag("CIDR_INVALID", "error", "semantic", `subnet ${subnet.id}: ${p.message}`, [subnet.id], "semantic.cidr.parse"));
          }
        }
      }
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i];
          const b = all[j];
          if (a && b && overlapsCIDR(a.parsed, b.parsed)) {
            diagnostics.push(diag("CIDR_OVERLAP", "error", "semantic", `subnets ${a.id} and ${b.id} in network ${network.id} overlap across regions`, [a.id, b.id], "semantic.cidr.no-sibling-overlap"));
          }
        }
      }
    }
  }
  return {
    id: "cidr",
    phase: "semantic",
    status: diagnostics.some((d) => d.severity === "error") ? "failed" : "passed",
    diagnostics,
  };
}

const isFiniteInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);

export function validateEndpoints(spec: StratusSpec, indexes: NormalizedIndexes): GateResult {
  const diagnostics: Diagnostic[] = [];
  // Step fields must be finite integers — they serialize into badge text.
  for (const edge of spec.edges) {
    if ("step" in edge && edge.step !== undefined && !isFiniteInt(edge.step)) {
      diagnostics.push(
        diag("FIELD_INVALID", "error", "semantic", `edge ${edge.id} step must be a finite integer`, [edge.id], "semantic.edge.step-integer", [
          { instruction: `set edge ${edge.id} step to a finite integer` },
        ]),
      );
    }
  }
  for (const edge of spec.edges) {
    const endpoints: { endpoint: unknown; label: string }[] = [];
    if (edge.kind === "request") {
      endpoints.push({ endpoint: edge.from, label: "from" }, { endpoint: edge.to, label: "to" });
    } else if (edge.kind === "service-target") {
      endpoints.push({ endpoint: edge.from, label: "from" }, { endpoint: edge.to, label: "to" });
    } else {
      endpoints.push({ endpoint: edge.from, label: "from" }, { endpoint: edge.to, label: "to" });
    }
    for (const { endpoint, label } of endpoints) {
      const ep = endpoint as { kind: string; resourceId?: string; actorId?: string; scopeId?: string; attachmentId?: string };
      if (ep.kind === "resource") {
        const endpointEntity = ep.resourceId ? indexes.byId.get(ep.resourceId) : undefined;
        const endpointKind = (endpointEntity as { kind?: string } | undefined)?.kind;
        if (!ep.resourceId || !endpointEntity) {
          diagnostics.push(
            diag("EDGE_ENDPOINT_INVALID", "error", "semantic", `edge ${edge.id} ${label} references unknown resource ${ep.resourceId ?? "?"}`, [edge.id], "semantic.edge.endpoint-resolves", [
              { instruction: `correct the ${label} endpoint of edge ${edge.id}` },
            ]),
          );
        } else if (endpointKind === "external" || endpointKind === "scope") {
          // The endpoint kind must agree with the referenced entity: an
          // external actor or a scope is not a resource.
          diagnostics.push(
            diag("EDGE_ENDPOINT_INVALID", "error", "semantic", `edge ${edge.id} ${label} references ${ep.resourceId} as a resource but it is a ${endpointKind}`, [edge.id], "semantic.edge.endpoint-kind-agreement", [
              { instruction: `use the correct endpoint kind for ${ep.resourceId}` },
            ]),
          );
        } else if (indexes.attachmentInstances.has(ep.resourceId) && (indexes.attachmentInstances.get(ep.resourceId)?.length ?? 0) > 1 && !ep.attachmentId) {
          diagnostics.push(
            diag("EDGE_INSTANCE_AMBIGUOUS", "error", "semantic", `edge ${edge.id} ${label} targets multi-instance resource ${ep.resourceId} without selecting an attachment`, [edge.id, ep.resourceId], "semantic.edge.instance-selected", [
              { instruction: `set attachmentId on the ${label} endpoint of ${edge.id}` },
            ]),
          );
        } else if (ep.attachmentId && !indexes.byId.has(ep.attachmentId)) {
          diagnostics.push(
            diag("REFERENCE_MISSING", "error", "semantic", `edge ${edge.id} ${label} references unknown attachment ${ep.attachmentId}`, [edge.id], "semantic.edge.attachment-exists"),
          );
        } else if (ep.attachmentId && ep.resourceId && indexes.byId.has(ep.attachmentId)) {
          // The attachment must belong to the referenced resource — a foreign
          // attachment is an error, never a silent fallback.
          const attParent = indexes.parentOf.get(ep.attachmentId);
          if (attParent !== ep.resourceId) {
            diagnostics.push(
              diag("EDGE_ENDPOINT_INVALID", "error", "semantic", `edge ${edge.id} ${label} selects attachment ${ep.attachmentId} which belongs to ${attParent ?? "?"}, not ${ep.resourceId}`, [edge.id, ep.attachmentId], "semantic.edge.attachment-owns", [
                { instruction: `set attachmentId to an attachment of ${ep.resourceId}` },
              ]),
            );
          }
        }
      } else if (ep.kind === "external") {
        if (!ep.actorId || !indexes.byId.has(ep.actorId)) {
          diagnostics.push(
            diag("EDGE_ENDPOINT_INVALID", "error", "semantic", `edge ${edge.id} ${label} references unknown external actor`, [edge.id], "semantic.edge.endpoint-resolves"),
          );
        }
      } else if (ep.kind === "scope") {
        if (!ep.scopeId || !indexes.byId.has(ep.scopeId)) {
          diagnostics.push(
            diag("EDGE_ENDPOINT_INVALID", "error", "semantic", `edge ${edge.id} ${label} references unknown scope ${ep.scopeId ?? "?"}`, [edge.id], "semantic.edge.endpoint-resolves"),
          );
        }
      }
    }
    // Cross-boundary edges must carry non-whitespace semantic labels.
    if (!edge.semanticLabel || edge.semanticLabel.text.trim().length === 0) {
      diagnostics.push(
        diag("EDGE_LABEL_REQUIRED", "error", "semantic", `edge ${edge.id} crosses boundaries and must carry a semantic label`, [edge.id], "semantic.edge.cross-boundary-label", [
          { instruction: `set semanticLabel.text on edge ${edge.id}` },
        ]),
      );
    }
  }
  return {
    id: "endpoints",
    phase: "semantic",
    status: diagnostics.length > 0 ? "failed" : "passed",
    diagnostics,
  };
}

export function validateRoutingFacts(spec: StratusSpec, indexes: NormalizedIndexes): GateResult {
  const diagnostics: Diagnostic[] = [];
  for (const rf of spec.routingFacts) {
    if (rf.kind === "route-table") {
      if (!indexes.byId.has(rf.ownerScopeId)) {
        diagnostics.push(
          diag("REFERENCE_MISSING", "error", "semantic", `route table ${rf.id} owner scope ${rf.ownerScopeId} is missing`, [rf.id], "semantic.routing.owner-resolves"),
        );
      }
      for (const ap of rf.appliesTo) {
        if (ap.kind === "subnet" && !indexes.byId.has(ap.subnetId)) {
          diagnostics.push(
            diag("REFERENCE_MISSING", "error", "semantic", `route table ${rf.id} applies to unknown subnet ${ap.subnetId}`, [rf.id], "semantic.routing.applies-resolves"),
          );
        }
      }
      for (const row of rf.rows) {
        if (row.target.status === "known") {
          const t = row.target.value;
          if (t.kind === "resource") {
            const entity = indexes.byId.get(t.resourceId);
            if (!entity) {
              diagnostics.push(
                diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `route table ${rf.id} row ${row.id} targets unknown resource ${t.resourceId}`, [rf.id, row.id], "semantic.routing.target-resolves"),
              );
            } else {
              // The target kind must agree with the referenced entity: an
              // external actor or a scope is not a resource.
              const entityKind = (entity as { kind?: string }).kind;
              const scopeKinds = ["external", "scope", "aws-vpc", "aws-region", "aws-az-slice", "aws-cloud", "gcp-network", "gcp-network-region", "gcp-region", "azure-region", "azure-vnet", "subnet"];
              if (entityKind !== undefined && scopeKinds.includes(entityKind)) {
                diagnostics.push(
                  diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `route table ${rf.id} row ${row.id} targets ${t.resourceId} as a resource but it is a ${entityKind}`, [rf.id, row.id], "semantic.routing.target-kind-agreement"),
                );
              }
            }
          }
          if (t.kind === "attachment" && !indexes.byId.has(t.attachmentId)) {
            diagnostics.push(
              diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `route table ${rf.id} row ${row.id} targets unknown attachment ${t.attachmentId}`, [rf.id], "semantic.routing.attachment-resolves"),
            );
          }
        }
      }
    } else if (rf.kind === "routing-decision") {
      if (rf.basis.kind === "route") {
        const table = indexes.byId.get(rf.basis.tableId);
        if (!table) {
          diagnostics.push(
            diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `routing decision ${rf.id} cites unknown table ${rf.basis.tableId}`, [rf.id], "semantic.routing.basis-resolves"),
          );
        } else if ((table as unknown as { kind?: string }).kind !== "route-table") {
          // The cited table must be a declared route table — not an external
          // actor, resource, or any other entity kind.
          diagnostics.push(
            diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `routing decision ${rf.id} cites ${rf.basis.tableId} which is a ${(table as unknown as { kind: string }).kind}, not a route table`, [rf.id], "semantic.routing.basis-is-table"),
          );
        } else {
          // The cited row must exist in the cited table.
          const rows = (table as unknown as { rows?: readonly { id: string }[] }).rows ?? [];
          const basisRowId = (rf.basis as { rowId?: string }).rowId;
          if (basisRowId !== undefined && !rows.some((r) => r.id === basisRowId)) {
            diagnostics.push(
              diag("ROUTING_FACT_INCONSISTENT", "error", "semantic", `routing decision ${rf.id} cites row ${basisRowId} which is not declared in table ${rf.basis.tableId}`, [rf.id], "semantic.routing.basis-row-exists"),
            );
          }
        }
      }
    }
  }
  // Route cards must reference declared route tables.
  for (const card of spec.routeCards) {
    const table = indexes.byId.get(card.tableId);
    if (!table || (table as { kind?: string }).kind !== "route-table") {
      diagnostics.push(
        diag("REFERENCE_MISSING", "error", "semantic", `route card ${card.id} references ${card.tableId} which is not a declared route table`, [card.id], "semantic.route-card.table-exists"),
      );
    }
  }
  // Traffic planes referenced by edges must be declared.
  const planeIds = new Set(spec.planes.map((p) => p.id));
  for (const edge of spec.edges) {
    if ("planeId" in edge && !planeIds.has(edge.planeId)) {
      diagnostics.push(
        diag("REFERENCE_MISSING", "error", "semantic", `edge ${edge.id} references unknown traffic plane ${edge.planeId}`, [edge.id], "semantic.edge.plane-exists"),
      );
    }
  }
  return {
    id: "routing-facts",
    phase: "semantic",
    status: diagnostics.length > 0 ? "failed" : "passed",
    diagnostics,
  };
}

// ---- Receipt ----

export interface SemanticValidation {
  gates: readonly GateResult[];
  receipt: ValidationReceipt;
  specHash: string;
  hasErrors: boolean;
}

export function validateSemantic(spec: StratusSpec): SemanticValidation {
  const { indexes, canonical, problems } = normalizeSpec(spec);
  const gates: GateResult[] = [];
  if (problems.length > 0) {
    gates.push({
      id: "normalize",
      phase: "semantic",
      status: "failed",
      diagnostics: problems.map((p) =>
        diag(
          (p.code === "ID_DUPLICATE" ? "ID_DUPLICATE" : "CONTAINMENT_INVALID") as DiagnosticCode,
          "error",
          "semantic",
          p.message,
          p.subjects,
          "semantic.normalize",
        ),
      ),
    });
  }
  gates.push(validateContainment(spec, indexes));
  gates.push(validatePlacement(spec, indexes));
  gates.push(validateCIDR(spec));
  gates.push(validateEndpoints(spec, indexes));
  gates.push(validateRoutingFacts(spec, indexes));
  const hasErrors = gates.some((g) => g.status === "failed");
  const hasUnknown = gates.some((g) => g.status === "unknown");
  const receipt: ValidationReceipt = {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    specHash: hash(canonical),
    metricsHash: metricsHash(),
    profileId: "aws-normalized-spacious-v1",
    gates,
    referenceGrade: hasErrors ? "blocked" : hasUnknown ? "unknown" : "eligible",
    scope: "diagram-spec-conformance-not-cloud-security",
  };
  return { gates, receipt, specHash: hash(canonical), hasErrors };
}



/** Deterministic 64-bit FNV-1a hash (hex) — no crypto dependency, offline. */
export function hash(input: string): string {
  let h = 0xcbf29ce484222325n;
  const fnvPrime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * fnvPrime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

// Re-exports for pipeline use.
export { PINNED_METRICS, THRESHOLDS };

// Stratus semantic model (T001) — implemented from the lead-engineer
// implementation report (docs/implementation-report.md §1).
// Three separate concepts: semantic ownership (one owner per scope/resource),
// deployment placement (multi-subnet/zone attachment), paint geometry
// (explicitly linked visual instances; membership bands cross tiers).

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
  /** Stable tie-break: order ?? 0, then binary ID comparison. */
  order?: number;
}

export interface GeoRegion extends Entity {
  code: string;
  zones: readonly string[];
}

export interface ZoneRef {
  /** References GeoRegion, not a paint frame. */
  regionId: Id;
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

export interface SubnetAttachment extends Entity {
  subnetId: Id;
  /** AWS zone is derived from the subnet and must agree if supplied. */
  zone?: ZoneRef;
  role: "primary" | "standby" | "member" | "interface";
}

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

export interface Resource<P extends Provider> extends Entity {
  kind: "resource";
  /** Runtime enum comes from the pinned catalog (src/cloud.ts). */
  service: string;
  placement: Placement;
  tier: Tier;
  exposure?: "internet-facing" | "internal" | "not-applicable";
  addresses?: readonly {
    family: "ipv4" | "ipv6";
    /** Individual address, not a subnet CIDR. */
    value: string;
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

/** A VPC's slice of a geographical AZ — not ownership of the AZ itself. */
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

/** Deliberately no synthetic VPC CIDR: GCP networks have regional ranges. */
export interface GcpVPC extends ScopeBase<"gcp"> {
  kind: "gcp-vpc";
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

// ---- Membership policies and spatial frames ----

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
  membership:
    | { kind: "policy"; policyId: Id }
    | { kind: "resources"; resourceIds: NonEmpty<Id> };
  presentation: "segmented-band" | "outline";
}

// ---- Edges: semantics, variants, address families ----

export type Face = "top" | "right" | "bottom" | "left";

export interface ResourceEndpoint {
  kind: "resource";
  resourceId: Id;
  /** Required when selecting a particular deployed instance. */
  attachmentId?: Id;
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
  /** Explicit author-approved alternative; never generated by truncation. */
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
  /** IDs of RoutingDecision facts. */
  routing: Fact<NonEmpty<Id>>;
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

// ---- Routing facts: explain why packets follow an edge ----

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
  /** Interpreted by the provider adapter, not universally. */
  priority?: number;
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
    | { kind: "unknown"; reason: string };
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

// ---- Top-level spec ----

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

// ---- Decoding ----

export interface DecodeOk {
  ok: true;
  spec: StratusSpec;
}

export interface DecodeFail {
  ok: false;
  diagnostics: readonly {
    code: "SCHEMA_INVALID";
    message: string;
    pointer: string;
  }[];
}

export type DecodeResult = DecodeOk | DecodeFail;

/**
 * Decode unknown input into a StratusSpec. Structural validation only —
 * cross-reference and CIDR errors are semantic gates (validator.ts).
 * Implemented with hand-rolled narrowing so the decoder and the JSON Schema
 * agree on structural validity without a runtime dependency.
 */
const MAX_ENTITIES = 512;

/** Recursive structural contract for the region/vpc/az/subnet tree. */
const validateGcpResourceArray = (v: unknown, pointer: string, diags: { code: "SCHEMA_INVALID"; message: string; pointer: string }[]): boolean => {
  if (v === undefined) return true; // resources are optional
  const fail = (message: string, rp: string): void => {
    diags.push({ code: "SCHEMA_INVALID", message, pointer: rp });
  };
  if (!Array.isArray(v)) {
    fail("resources must be an array", pointer);
    return false;
  }
  if (v.length > MAX_ENTITIES) {
    fail(`resources must contain at most ${MAX_ENTITIES} entries`, pointer);
    return false;
  }
  for (let i = 0; i < v.length; i += 1) {
    const r = v[i];
    const rp = `${pointer}/${i}`;
    if (typeof r !== "object" || r === null || Array.isArray(r)) {
      fail("resource must be an object", rp);
      continue;
    }
    const rec = r as Record<string, unknown>;
    if (typeof rec.id !== "string" || rec.id.length === 0 || rec.id.length > 128) {
      fail("resource id must be a non-empty string (max 128)", `${rp}/id`);
    }
    if (typeof rec.service !== "string" || rec.service.length === 0) {
      fail("resource.service must be a non-empty string", `${rp}/service`);
    }
    if (typeof rec.placement !== "object" || rec.placement === null || Array.isArray(rec.placement)) {
      fail("resource.placement must be an object", `${rp}/placement`);
      continue;
    }
    const pRec = rec.placement as Record<string, unknown>;
    if (pRec.kind === "single-subnet" && (typeof pRec.attachment !== "object" || pRec.attachment === null || typeof (pRec.attachment as Record<string, unknown>).subnetId !== "string")) {
      fail("single-subnet resource placement requires attachment.subnetId", `${rp}/placement/attachment`);
    }
    if (pRec.kind === "multi-subnet" && !Array.isArray(pRec.attachments)) {
      fail("multi-subnet resource placement requires attachments[]", `${rp}/placement/attachments`);
    }
    if (pRec.kind === "multi-subnet" && Array.isArray(pRec.attachments)) {
      for (let ai = 0; ai < pRec.attachments.length; ai += 1) {
        const a = pRec.attachments[ai];
        if (typeof a !== "object" || a === null || typeof (a as Record<string, unknown>).subnetId !== "string") {
          fail("multi-subnet attachment must be an object with subnetId", `${rp}/placement/attachments/${ai}`);
        }
      }
    }
  }
  return true;
};

function decodeStructure(regions: unknown[], provider: "aws" | "gcp" | "azure"): { ok: true } | { ok: false; diagnostics: { code: "SCHEMA_INVALID"; message: string; pointer: string }[] } {
  const diags: { code: "SCHEMA_INVALID"; message: string; pointer: string }[] = [];
  const fail = (message: string, pointer: string) => {
    diags.push({ code: "SCHEMA_INVALID", message, pointer });
    return { ok: false, diagnostics: diags } as const;
  };
  const seen = new Set<string>();
  const requireId = (v: unknown, pointer: string): string | null => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      fail("entity must be an object", pointer);
      return null;
    }
    const id = (v as Record<string, unknown>).id;
    if (typeof id !== "string" || id.length === 0 || id.length > 128) {
      fail("entity id must be a non-empty string (max 128)", `${pointer}/id`);
      return null;
    }
    if (seen.has(id)) {
      fail(`duplicate entity id "${id}"`, `${pointer}/id`);
      return null;
    }
    seen.add(id);
    return id;
  };
  const requireArray = (v: unknown, pointer: string, name: string): unknown[] | null => {
    if (!Array.isArray(v)) {
      fail(`${name} must be an array`, pointer);
      return null;
    }
    if (v.length > MAX_ENTITIES) {
      fail(`${name} must contain at most ${MAX_ENTITIES} entries`, pointer);
      return null;
    }
    return v;
  };
  const requireResourceArray = (v: unknown, pointer: string): void => {
    if (v === undefined) return; // resources are optional
    if (!Array.isArray(v)) {
      fail("resources must be an array", pointer);
      return;
    }
    if (v.length > MAX_ENTITIES) {
      fail(`resources must contain at most ${MAX_ENTITIES} entries`, pointer);
      return;
    }
    for (let i = 0; i < v.length; i += 1) {
      const r = v[i];
      const rp = `${pointer}/${i}`;
      if (typeof r !== "object" || r === null || Array.isArray(r)) {
        fail("resource must be an object", rp);
        continue;
      }
      const rec = r as Record<string, unknown>;
      if (typeof rec.id !== "string" || rec.id.length === 0 || rec.id.length > 128) {
        fail("resource id must be a non-empty string (max 128)", `${rp}/id`);
      }
      if (typeof rec.service !== "string" || rec.service.length === 0) {
        fail("resource.service must be a non-empty string", `${rp}/service`);
      }
      if (typeof rec.placement !== "object" || rec.placement === null || Array.isArray(rec.placement)) {
        fail("resource.placement must be an object", `${rp}/placement`);
      }
      if (typeof rec.label !== "string" || rec.label.length === 0) {
        fail("resource.label must be a non-empty string", `${rp}/label`);
      }
      if (rec.attachment !== undefined) {
        if (typeof rec.attachment !== "object" || rec.attachment === null || Array.isArray(rec.attachment)) {
          fail("resource.attachment must be an object when present", `${rp}/attachment`);
        } else {
          const att = rec.attachment as Record<string, unknown>;
          if (typeof att.subnetId !== "string" || att.subnetId.length === 0) {
            fail("resource.attachment.subnetId must be a non-empty string", `${rp}/attachment/subnetId`);
          }
        }
      }
      // Subnet placements carry the attachment INSIDE the placement object —
      // a single-subnet/multi-subnet placement without one crashes downstream.
      const placement = rec.placement as Record<string, unknown> | undefined;
      const placementKind = placement?.kind;
      if (placementKind === "single-subnet" && placement?.attachment === undefined) {
        fail("single-subnet placement requires attachment.subnetId", `${rp}/placement/attachment`);
      }
      if (placementKind === "multi-subnet" && placement?.attachments === undefined) {
        fail("multi-subnet placement requires attachments[]", `${rp}/placement/attachments`);
      }
      const placementAttachment = placement?.attachment;
      if (placementAttachment !== undefined) {
        if (typeof placementAttachment !== "object" || placementAttachment === null || Array.isArray(placementAttachment)) {
          fail("placement.attachment must be an object when present", `${rp}/placement/attachment`);
        } else {
          const att = placementAttachment as Record<string, unknown>;
          if (typeof att.subnetId !== "string" || att.subnetId.length === 0) {
            fail("placement.attachment.subnetId must be a non-empty string", `${rp}/placement/attachment/subnetId`);
          }
        }
      }
      const placementAttachments = placement?.attachments;
      if (placementAttachments !== undefined) {
        if (!Array.isArray(placementAttachments)) {
          fail("placement.attachments must be an array when present", `${rp}/placement/attachments`);
        } else {
          for (let ai = 0; ai < placementAttachments.length; ai += 1) {
            const att = placementAttachments[ai];
            if (typeof att !== "object" || att === null || Array.isArray(att)) {
              fail("placement attachment must be an object", `${rp}/placement/attachments/${ai}`);
              continue;
            }
            const aRec = att as Record<string, unknown>;
            if (typeof aRec.subnetId !== "string" || aRec.subnetId.length === 0) {
              fail("placement attachment subnetId must be a non-empty string", `${rp}/placement/attachments/${ai}/subnetId`);
            }
          }
        }
      }
    }
  };
  for (let ri = 0; ri < regions.length; ri += 1) {
    const region = regions[ri];
    const rPointer = `/cloud/regions/${ri}`;
    if (requireId(region, rPointer) === null) continue;
    const r = region as Record<string, unknown>;
    requireResourceArray(r.resources, `${rPointer}/resources`);
    if (provider === "gcp") {
      // GCP: regions hold subnets directly (optional — regions may be empty);
      // networks are separate.
      if (r.subnets !== undefined) {
        if (!Array.isArray(r.subnets)) { fail("region.subnets must be an array", `${rPointer}/subnets`); continue; }
        if (r.subnets.length > MAX_ENTITIES) { fail(`region.subnets must contain at most ${MAX_ENTITIES} entries`, `${rPointer}/subnets`); continue; }
        for (let si = 0; si < r.subnets.length; si += 1) {
          requireId(r.subnets[si], `${rPointer}/subnets/${si}`);
        }
      }
      continue;
    }
    // Azure regions may declare vnets under vnets OR the vpcs alias.
    const azureVnets = provider === "azure"
      ? (r.vnets !== undefined ? r.vnets : r.vpcs)
      : r.vpcs;
    if (!Array.isArray(azureVnets)) { fail(provider === "azure" ? "region.vnets must be an array" : "region.vpcs must be an array", provider === "azure" ? `${rPointer}/vnets` : `${rPointer}/vpcs`); continue; }
    if (azureVnets.length > MAX_ENTITIES) { fail(`region vnets must contain at most ${MAX_ENTITIES} entries`, provider === "azure" ? `${rPointer}/vnets` : `${rPointer}/vpcs`); continue; }
    if (provider === "azure") {
      for (let vi = 0; vi < azureVnets.length; vi += 1) {
        const vnet = azureVnets[vi];
        if (typeof vnet !== "object" || vnet === null || Array.isArray(vnet)) continue;
        const vRec = vnet as Record<string, unknown>;
        if (vRec.subnets !== undefined && !Array.isArray(vRec.subnets)) {
          fail("vnet.subnets must be an array when present", `${rPointer}/${provider === "azure" && r.vnets !== undefined ? "vnets" : "vpcs"}/${vi}/subnets`);
        }
      }
    }
    for (let vi = 0; vi < azureVnets.length; vi += 1) {
      const vpc = azureVnets[vi];
      const vPointer = `${rPointer}/${provider === "azure" && r.vnets !== undefined ? "vnets" : "vpcs"}/${vi}`;
      if (requireId(vpc, vPointer) === null) continue;
      const v = vpc as Record<string, unknown>;
      requireResourceArray(v.resources, `${vPointer}/resources`);
      if (provider === "azure") {
        // Azure: VNets hold subnets directly (optional — vnets may be empty).
        if (v.subnets !== undefined) {
          if (!Array.isArray(v.subnets)) { fail("vnet.subnets must be an array", `${vPointer}/subnets`); continue; }
          if (v.subnets.length > MAX_ENTITIES) { fail(`vnet.subnets must contain at most ${MAX_ENTITIES} entries`, `${vPointer}/subnets`); continue; }
          for (let si = 0; si < v.subnets.length; si += 1) {
            const subnet = v.subnets[si];
            const sPointer = `${vPointer}/subnets/${si}`;
            if (requireId(subnet, sPointer) === null) continue;
            requireResourceArray((subnet as Record<string, unknown>).resources, `${sPointer}/resources`);
          }
        }
        continue;
      }
      // AWS: VPCs hold AZ slices, which hold subnets.
      if (!Array.isArray(v.azs)) { fail("vpc.azs must be an array", `${vPointer}/azs`); continue; }
      if (v.azs.length > MAX_ENTITIES) { fail(`vpc.azs must contain at most ${MAX_ENTITIES} entries`, `${vPointer}/azs`); continue; }
      for (let ai = 0; ai < v.azs.length; ai += 1) {
        const az = v.azs[ai];
        const aPointer = `${vPointer}/azs/${ai}`;
        if (requireId(az, aPointer) === null) continue;
        const a = az as Record<string, unknown>;
        requireResourceArray(a.resources, `${aPointer}/resources`);
        if (!Array.isArray(a.subnets)) { fail("az.subnets must be an array", `${aPointer}/subnets`); continue; }
        if (a.subnets.length > MAX_ENTITIES) { fail(`az.subnets must contain at most ${MAX_ENTITIES} entries`, `${aPointer}/subnets`); continue; }
        for (let si = 0; si < a.subnets.length; si += 1) {
          const subnet = a.subnets[si];
          const sPointer = `${aPointer}/subnets/${si}`;
          if (requireId(subnet, sPointer) === null) continue;
          requireResourceArray((subnet as Record<string, unknown>).resources, `${sPointer}/resources`);
        }
      }
    }
  }
  if (diags.length > 0) return { ok: false, diagnostics: diags };
  return { ok: true };
}

export function decodeSpec(input: unknown): DecodeResult {
  const diags: { code: "SCHEMA_INVALID"; message: string; pointer: string }[] = [];
  const fail = (message: string, pointer: string): DecodeFail => {
    diags.push({ code: "SCHEMA_INVALID", message, pointer });
    return { ok: false, diagnostics: diags };
  };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("spec must be an object", "");
  }
  const o = input as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    return fail("schemaVersion must be 1", "/schemaVersion");
  }
  const provider = o.provider;
  if (provider !== "aws" && provider !== "gcp" && provider !== "azure") {
    return fail("provider must be aws|gcp|azure", "/provider");
  }
  if (typeof o.title !== "string" || o.title.length === 0 || o.title.length > 200) {
    return fail("title must be a non-empty string (max 200)", "/title");
  }
  const cloud = o.cloud;
  if (typeof cloud !== "object" || cloud === null || Array.isArray(cloud)) {
    return fail("cloud must be an object", "/cloud");
  }
  const cloudRec = cloud as Record<string, unknown>;
  if (!Array.isArray(cloudRec.regions)) {
    return fail("cloud.regions must be an array", "/cloud/regions");
  }
  // GCP's primary scope is cloud.networks — cloud.regions may be empty there.
  const regionsPrimary = provider !== "gcp";
  if (regionsPrimary && (cloudRec.regions.length === 0 || cloudRec.regions.length > MAX_ENTITIES)) {
    return fail(`cloud.regions must contain 1..${MAX_ENTITIES} entries`, "/cloud/regions");
  }
  if (cloudRec.regions.length > MAX_ENTITIES) {
    return fail(`cloud.regions must contain at most ${MAX_ENTITIES} entries`, "/cloud/regions");
  }
  const cloudKind =
    provider === "aws" ? "aws-cloud" : provider === "gcp" ? "gcp-cloud" : "azure-cloud";
  if ((cloud as Record<string, unknown>).kind !== cloudKind) {
    return fail(`cloud.kind must be "${cloudKind}"`, "/cloud/kind");
  }
  for (const key of [
    "geography", "externals", "policies", "frames", "planes",
    "edges", "routingFacts", "routeCards", "views",
  ] as const) {
    const v = o[key];
    if (!Array.isArray(v)) {
      return fail(`${key} must be an array`, `/${key}`);
    }
    if (v.length > MAX_ENTITIES) {
      return fail(`${key} must contain at most ${MAX_ENTITIES} entries`, `/${key}`);
    }
    // Every top-level entity must be an object with an id — nulls and
    // primitives return diagnostics instead of throwing downstream.
    for (let i = 0; i < v.length; i += 1) {
      const item = v[i];
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return fail(`${key}[${i}] must be an object`, `/${key}/${i}`);
      }
      const id = (item as Record<string, unknown>).id;
      if (typeof id !== "string" || id.length === 0 || id.length > 128) {
        return fail(`${key}[${i}].id must be a non-empty string (max 128)`, `/${key}/${i}/id`);
      }
    }
  }
  // Recursive structural contract: every entity must be an object with a
  // string id; region/vpc/az/subnet nesting must be structurally sound.
  const structural = decodeStructure(cloudRec.regions, provider);
  if (!structural.ok) return structural;
  if (provider === "gcp") {
    // GCP networks are the primary scope: validate their regions/subnets.
    if (!Array.isArray(cloudRec.networks)) {
      return fail("cloud.networks must be an array for GCP", "/cloud/networks");
    }
    if ((cloudRec.networks as unknown[]).length > MAX_ENTITIES) {
      return fail(`cloud.networks must contain at most ${MAX_ENTITIES} entries for GCP`, "/cloud/networks");
    }
    for (let ni = 0; ni < (cloudRec.networks as unknown[]).length; ni += 1) {
      const network = (cloudRec.networks as unknown[])[ni];
      const nPointer = `/cloud/networks/${ni}`;
      if (typeof network !== "object" || network === null || Array.isArray(network)) {
        return fail("network must be an object", `${nPointer}`);
      }
      const net = network as Record<string, unknown>;
      if (typeof net.id !== "string" || net.id.length === 0) {
        return fail("network id must be a non-empty string", `${nPointer}/id`);
      }
      // GCP network-level resources: every entry must be an object.
      const netResources = net.resources;
      if (netResources !== undefined) {
        if (!Array.isArray(netResources)) {
          return fail("network.resources must be an array when present", `${nPointer}/resources`);
        }
        for (let ri = 0; ri < netResources.length; ri += 1) {
          const r = netResources[ri];
          if (typeof r !== "object" || r === null || Array.isArray(r)) {
            return fail("network resource must be an object", `${nPointer}/resources/${ri}`);
          }
          const rec = r as Record<string, unknown>;
          if (typeof rec.id !== "string" || rec.id.length === 0) {
            return fail("network resource id must be a non-empty string", `${nPointer}/resources/${ri}/id`);
          }
          if (typeof rec.service !== "string" || rec.service.length === 0) {
            return fail("network resource service must be a non-empty string", `${nPointer}/resources/${ri}/service`);
          }
          if (typeof rec.placement !== "object" || rec.placement === null || Array.isArray(rec.placement)) {
            return fail("network resource placement must be an object", `${nPointer}/resources/${ri}/placement`);
          }
          const npRec = rec.placement as Record<string, unknown>;
          if (npRec.kind === "single-subnet" && (typeof npRec.attachment !== "object" || npRec.attachment === null || typeof (npRec.attachment as Record<string, unknown>).subnetId !== "string")) {
            return fail("single-subnet network resource placement requires attachment.subnetId", `${nPointer}/resources/${ri}/placement/attachment`);
          }
          if (npRec.kind === "multi-subnet" && !Array.isArray(npRec.attachments)) {
            return fail("multi-subnet network resource placement requires attachments[]", `${nPointer}/resources/${ri}/placement/attachments`);
          }
          if (npRec.kind === "multi-subnet" && Array.isArray(npRec.attachments)) {
            for (let ai = 0; ai < npRec.attachments.length; ai += 1) {
              const a = npRec.attachments[ai];
              if (typeof a !== "object" || a === null || typeof (a as Record<string, unknown>).subnetId !== "string") {
                return fail("multi-subnet attachment must be an object with subnetId", `${nPointer}/resources/${ri}/placement/attachments/${ai}`);
              }
            }
          }
          if (npRec.kind === "multi-zone" && !Array.isArray(npRec.zones)) {
            return fail("multi-zone network resource placement requires zones[]", `${nPointer}/resources/${ri}/placement/zones`);
          }
          if (npRec.kind === "multi-zone" && Array.isArray(npRec.zones)) {
            for (let zi = 0; zi < npRec.zones.length; zi += 1) {
              const z = npRec.zones[zi];
              if (typeof z !== "object" || z === null || typeof (z as Record<string, unknown>).regionId !== "string" || typeof (z as Record<string, unknown>).zone !== "string") {
                return fail("multi-zone zone must be an object with regionId and zone", `${nPointer}/resources/${ri}/placement/zones/${zi}`);
              }
            }
          }
          if (npRec.kind === "single-zone" && (typeof npRec.zone !== "object" || npRec.zone === null || typeof (npRec.zone as Record<string, unknown>).regionId !== "string" || typeof (npRec.zone as Record<string, unknown>).zone !== "string")) {
            return fail("single-zone network resource placement requires zone.regionId/zone", `${nPointer}/resources/${ri}/placement/zone`);
          }
        }
      }
      if (!Array.isArray(net.regions)) {
        return fail("network.regions must be an array", `${nPointer}/regions`);
      }
      for (const netRegion of net.regions) {
        if (typeof netRegion !== "object" || netRegion === null || Array.isArray(netRegion)) {
          return fail("network region must be an object", `${nPointer}/regions`);
        }
        const netSubnets = (netRegion as Record<string, unknown>).subnets;
        if (netSubnets !== undefined) {
          if (!Array.isArray(netSubnets)) {
            return fail("network region subnets must be an array when present", `${nPointer}/regions/subnets`);
          }
          if (netSubnets.length > MAX_ENTITIES) {
            return fail(`network region subnets must contain at most ${MAX_ENTITIES} entries`, `${nPointer}/regions/subnets`);
          }
          for (let si = 0; si < netSubnets.length; si += 1) {
            const subnet = netSubnets[si];
            if (typeof subnet !== "object" || subnet === null || Array.isArray(subnet)) {
              return fail("network region subnet must be an object", `${nPointer}/regions/subnets/${si}`);
            }
            const sid = (subnet as Record<string, unknown>).id;
            if (typeof sid !== "string" || sid.length === 0 || sid.length > 128) {
              return fail("network region subnet id must be a non-empty string (max 128)", `${nPointer}/regions/subnets/${si}/id`);
            }
            validateGcpResourceArray((subnet as Record<string, unknown>).resources, `${nPointer}/regions/subnets/${si}/resources`, diags);
          }
        }
        // GCP network-region resources validated (array + id/service/placement).
        validateGcpResourceArray((netRegion as Record<string, unknown>).resources, `${nPointer}/regions/resources`, diags);
      }
    }
  }
  // Cloud-level and network-level resources: every entry must be an object
  // with id/service/placement — nulls return diagnostics, not crashes.
  const cloudResources = (cloudRec as { resources?: unknown }).resources;
  if (cloudResources !== undefined) {
    if (!Array.isArray(cloudResources)) {
      return fail("cloud.resources must be an array when present", "/cloud/resources");
    }
    for (let i = 0; i < cloudResources.length; i += 1) {
      const r = cloudResources[i];
      if (typeof r !== "object" || r === null || Array.isArray(r)) {
        return fail("cloud resource must be an object", `/cloud/resources/${i}`);
      }
      const rec = r as Record<string, unknown>;
      if (typeof rec.id !== "string" || rec.id.length === 0) {
        return fail("cloud resource id must be a non-empty string", `/cloud/resources/${i}/id`);
      }
      if (typeof rec.service !== "string" || rec.service.length === 0) {
        return fail("cloud resource service must be a non-empty string", `/cloud/resources/${i}/service`);
      }
      if (typeof rec.placement !== "object" || rec.placement === null || Array.isArray(rec.placement)) {
        return fail("cloud resource placement must be an object", `/cloud/resources/${i}/placement`);
      }
      const pRec = rec.placement as Record<string, unknown>;
      if (pRec.kind === "single-subnet" && (typeof pRec.attachment !== "object" || pRec.attachment === null || typeof (pRec.attachment as Record<string, unknown>).subnetId !== "string")) {
        return fail("single-subnet cloud resource placement requires attachment.subnetId", `/cloud/resources/${i}/placement/attachment`);
      }
      if (pRec.kind === "multi-subnet" && !Array.isArray(pRec.attachments)) {
        return fail("multi-subnet cloud resource placement requires attachments[]", `/cloud/resources/${i}/placement/attachments`);
      }
      if (pRec.kind === "multi-subnet" && Array.isArray(pRec.attachments)) {
        for (let ai = 0; ai < pRec.attachments.length; ai += 1) {
          const a = pRec.attachments[ai];
          if (typeof a !== "object" || a === null || typeof (a as Record<string, unknown>).subnetId !== "string") {
            return fail("multi-subnet attachment must be an object with subnetId", `/cloud/resources/${i}/placement/attachments/${ai}`);
          }
        }
      }
    }
  }
  const geography = o.geography;
  if (geography !== undefined) {
    if (!Array.isArray(geography)) {
      return fail("geography must be an array when present", "/geography");
    }
    if (geography.length > MAX_ENTITIES) {
      return fail(`geography must contain at most ${MAX_ENTITIES} entries`, "/geography");
    }
    for (let gi = 0; gi < geography.length; gi += 1) {
      const g = geography[gi];
      const gPointer = `/geography/${gi}`;
      if (typeof g !== "object" || g === null || Array.isArray(g)) {
        return fail("geography region must be an object", gPointer);
      }
      const gRec = g as Record<string, unknown>;
      if (typeof gRec.id !== "string" || gRec.id.length === 0 || gRec.id.length > 128) {
        return fail("geography region id must be a non-empty string (max 128)", `${gPointer}/id`);
      }
      if (typeof gRec.code !== "string" || gRec.code.length === 0) {
        return fail("geography region code must be a non-empty string", `${gPointer}/code`);
      }
      if (!Array.isArray(gRec.zones)) {
        return fail("geography region zones must be an array", `${gPointer}/zones`);
      }
      for (let zi = 0; zi < gRec.zones.length; zi += 1) {
        if (typeof gRec.zones[zi] !== "string" || (gRec.zones[zi] as string).length === 0) {
          return fail("geography zone must be a non-empty string", `${gPointer}/zones/${zi}`);
        }
      }
    }
  }
  // Edges: endpoints must be objects with a kind.
  const edges = o.edges;
  if (edges !== undefined) {
    if (!Array.isArray(edges)) {
      return fail("edges must be an array when present", "/edges");
    }
    for (let ei = 0; ei < edges.length; ei += 1) {
      const e = edges[ei];
      const ePointer = `/edges/${ei}`;
      if (typeof e !== "object" || e === null || Array.isArray(e)) {
        return fail("edge must be an object", ePointer);
      }
      const eRec = e as Record<string, unknown>;
      for (const side of ["from", "to"]) {
        const endpoint = eRec[side];
        if (endpoint === undefined) continue;
        if (typeof endpoint !== "object" || endpoint === null || Array.isArray(endpoint)) {
          return fail(`edge.${side} must be an object`, `${ePointer}/${side}`);
        }
        const epRec = endpoint as Record<string, unknown>;
        if (typeof epRec.kind !== "string" || epRec.kind.length === 0) {
          return fail(`edge.${side}.kind must be a non-empty string`, `${ePointer}/${side}/kind`);
        }
      }
    }
  }
  const pres = o.presentation;
  if (typeof pres !== "object" || pres === null) {
    return fail("presentation must be an object", "/presentation");
  }
  const p = pres as Record<string, unknown>;
  if (p.profile !== "normalized" || p.spacing !== "comfortable") {
    return fail('presentation must be { profile: "normalized", spacing: "comfortable" }', "/presentation");
  }
  if (p.flow !== "top-down" && p.flow !== "left-right") {
    return fail('presentation.flow must be "top-down" | "left-right"', "/presentation/flow");
  }
  if (diags.length > 0) return { ok: false, diagnostics: diags };
  return { ok: true, spec: input as StratusSpec };
}

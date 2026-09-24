// Canonical ordering, indexes, derived ownership (T001/T002).
// From the lead-engineer report: sort unordered entities by (order ?? 0,
// binary ID); preserve semantic arrays (route stages, explicit view order);
// expand multi-subnet resources into labeled attachment instances.

import type { StratusSpec, Entity, Resource, Provider, SubnetAttachment, Id } from "./schema.ts";

export function canonicalSort<T extends Entity>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface NormalizedIndexes {
  byId: Map<string, Entity>;
  parentOf: Map<string, string>;
  /** Multi-subnet resources: resourceId → attachment instances. */
  attachmentInstances: Map<string, readonly SubnetAttachment[]>;
  subnetOwner: Map<string, string>; // subnetId → network scope id
  networkOfResource: Map<string, string>; // resourceId → owning VPC/VNet id
  subnetResource: Map<string, string>; // subnetId → resourceId placed there
  /** Route-card rows: rowId → owning route card id. */
  routeRowOwner: Map<string, string>;
  /** Route tables by id. */
  routeCardById: Map<string, Entity>;
}

export interface NormalizedSpec {
  spec: StratusSpec;
  indexes: NormalizedIndexes;
  canonical: string;
  problems: { code: string; message: string; subjects: string[] }[];
}

/** Walk the provider tree and index parentage + ownership. */
function indexTree(
  spec: StratusSpec,
  indexes: NormalizedIndexes,
): { code: "REFERENCE_MISSING" | "CONTAINMENT_INVALID" | "ID_DUPLICATE"; message: string; subjects: string[] }[] {
  const problems: { code: "REFERENCE_MISSING" | "CONTAINMENT_INVALID" | "ID_DUPLICATE"; message: string; subjects: string[] }[] = [];
  const register = (id: string, entity: Entity, parent?: string) => {
    if (indexes.byId.has(id)) {
      problems.push({ code: "ID_DUPLICATE", message: `duplicate id: ${id}`, subjects: [id] });
      return;
    }
    indexes.byId.set(id, entity);
    if (parent) indexes.parentOf.set(id, parent);
  };
  const geo = new Set(spec.geography.map((g) => g.id));
  for (const g of spec.geography) {
    // Geography goes through the same duplicate-detection path as entities.
    register(g.id, g);
    for (const z of g.zones) geo.add(`${g.id}::${z}`);
  }

  const indexResource = (r: Resource<Provider>, ownerScopeId: string, networkId: string) => {
    register(r.id, r, ownerScopeId);
    indexes.networkOfResource.set(r.id, networkId);
    if (r.placement.kind === "single-subnet") {
      const att = r.placement.attachment;
      indexes.attachmentInstances.set(r.id, [att]);
      indexes.subnetResource.set(att.subnetId, r.id);
      // Attachments go through the same duplicate-detection path as entities.
      register(att.id, att as unknown as Entity, r.id);
    } else if (r.placement.kind === "multi-subnet") {
      indexes.attachmentInstances.set(r.id, r.placement.attachments);
      for (const a of r.placement.attachments) {
        indexes.subnetResource.set(a.subnetId, r.id);
        register(a.id, a as unknown as Entity, r.id);
      }
    }
  };

  // Cloud-level entity AND resources are indexed too (exhaustive traversal).
  register(spec.cloud.id, spec.cloud as unknown as Entity, undefined);
  const cloudResources = (spec.cloud as { resources?: readonly Resource<Provider>[] }).resources ?? [];
  for (const r of cloudResources) indexResource(r, spec.cloud.id, spec.cloud.id);
  if (spec.provider === "aws") {
    for (const region of spec.cloud.regions) {
      register(region.id, region, spec.cloud.id);
      for (const r of region.resources ?? []) indexResource(r, region.id, region.id);
      for (const vpc of region.vpcs) {
        register(vpc.id, vpc, region.id);
        for (const r of vpc.resources ?? []) indexResource(r, vpc.id, vpc.id);
        for (const az of vpc.azs) {
          register(az.id, az, vpc.id);
          for (const r of az.resources ?? []) indexResource(r, az.id, vpc.id);
          for (const subnet of az.subnets ?? []) {
            register(subnet.id, subnet, az.id);
            indexes.subnetOwner.set(subnet.id, vpc.id);
            for (const r of subnet.resources ?? []) indexResource(r, subnet.id, vpc.id);
          }
        }
      }
    }
  } else if (spec.provider === "gcp") {
    for (const network of spec.cloud.networks) {
      register(network.id, network, spec.cloud.id);
      for (const r of (network as { resources?: readonly Resource<Provider>[] }).resources ?? []) indexResource(r, network.id, network.id);
      for (const netRegion of network.regions) {
        register(netRegion.id, netRegion, network.id);
        for (const r of netRegion.resources ?? []) if (r) indexResource(r, netRegion.id, network.id);
        for (const subnet of netRegion.subnets ?? []) {
          register(subnet.id, subnet, netRegion.id);
          indexes.subnetOwner.set(subnet.id, network.id);
          for (const r of subnet.resources ?? []) if (r) indexResource(r, subnet.id, network.id);
        }
      }
    }
    for (const region of spec.cloud.regions) {
      register(region.id, region, spec.cloud.id);
      // GCP geographic-region resources are indexed too.
      for (const r of region.resources ?? []) indexResource(r, region.id, region.id);
    }
  } else {
    for (const region of spec.cloud.regions) {
      register(region.id, region, spec.cloud.id);
      for (const r of region.resources ?? []) indexResource(r, region.id, region.id);
      type AzureVnetLike = { id: string; label?: string; subnets?: readonly Entity[]; resources?: readonly Resource<Provider>[] };
      const azureVnets = (region as { vnets?: readonly AzureVnetLike[]; vpcs?: readonly AzureVnetLike[] }).vnets ?? (region as { vpcs?: readonly AzureVnetLike[] }).vpcs ?? [];
      for (const vnet of azureVnets) {
        register(vnet.id, vnet as Entity, region.id);
        for (const r of vnet.resources ?? []) indexResource(r, vnet.id, vnet.id);
        for (const subnet of vnet.subnets ?? []) {
          register(subnet.id, subnet, vnet.id);
          indexes.subnetOwner.set(subnet.id, vnet.id);
          for (const r of (subnet as { resources?: readonly Resource<Provider>[] }).resources ?? []) indexResource(r, subnet.id, vnet.id);
        }
      }
    }
  }
  for (const e of spec.externals) register(e.id, e);
  for (const p of spec.policies) register(p.id, p);
  for (const f of spec.frames) register(f.id, f);
  for (const pl of spec.planes) register(pl.id, pl);
  for (const e of spec.edges) register(e.id, e);
  for (const rf of spec.routingFacts) {
    register(rf.id, rf);
    if (rf.kind === "route-table") {
      for (const row of rf.rows) {
        const rowId = `${rf.id}::${row.id}`;
        if (indexes.routeRowOwner.has(rowId)) {
          problems.push({ code: "ID_DUPLICATE", message: `duplicate route row: ${rowId}`, subjects: [rowId] });
        }
        indexes.routeRowOwner.set(rowId, rf.id);
      }
    }
  }
  for (const rc of spec.routeCards) {
    indexes.routeCardById.set(rc.id, rc);
    register(rc.id, rc);
  }
  for (const v of spec.views) register(v.id, v);
  return problems;
}

export interface NormalizeResult {
  spec: StratusSpec;
  indexes: NormalizedIndexes;
  canonical: string;
  problems: { code: "REFERENCE_MISSING" | "CONTAINMENT_INVALID" | "ID_DUPLICATE"; message: string; subjects: string[] }[];
}

export function normalizeSpec(spec: StratusSpec): NormalizeResult {
  const indexes: NormalizedIndexes = {
    byId: new Map(),
    parentOf: new Map(),
    attachmentInstances: new Map(),
    subnetOwner: new Map(),
    networkOfResource: new Map(),
    subnetResource: new Map(),
    routeRowOwner: new Map(),
    routeCardById: new Map(),
  };
  const problems = indexTree(spec, indexes);
  // Canonical ordering: unordered entity collections are sorted by
  // (order ?? 0, binary ID) before layout consumes them. Genuinely ordered
  // sequences (route stages, view order) are preserved as authored.
  const byCanonical = <T extends Entity>(items: readonly T[]): T[] => canonicalSort(items);
  type RegionLike = { id: Id; label: string; vpcs?: readonly VpcLike[]; vnets?: readonly VnetLike[] };
  type VpcLike = { id: Id; label: string; azs?: readonly { id: Id; label: string; subnets: readonly Entity[] }[] };
  type VnetLike = { id: Id; label: string; subnets: readonly Entity[] };
  type NetworkLike = { id: Id; label: string; regions: readonly VnetLike[] };
  const cloud = spec.cloud as unknown as {
    regions: readonly RegionLike[];
    networks?: readonly NetworkLike[];
  };
  // Resource collections are sorted too — reversing VPC/AZ/subnet resources
  // must not change the spec or scene hashes.
  const sortResources = <T extends { id: Id }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortRes = (items: readonly { id: Id }[] | undefined): { id: Id }[] | undefined =>
    items === undefined ? undefined : sortResources(items);
  const orderedCloud = {
    ...cloud,
    // Cloud-level resources are sorted as well — reversing them must not
    // change the spec or scene hashes.
    ...((cloud as { resources?: readonly { id: Id }[] }).resources !== undefined
      ? { resources: sortRes((cloud as { resources?: readonly { id: Id }[] }).resources) }
      : {}),
    regions: byCanonical(cloud.regions as readonly (RegionLike & { resources?: readonly { id: Id }[] })[]).map((region) => ({
      ...region,
      resources: sortRes(region.resources ?? []),
      ...(region.vpcs
        ? {
            vpcs: byCanonical(region.vpcs as readonly (VpcLike & { resources?: readonly { id: Id }[]; subnets?: readonly Entity[] })[]).map((vpc) => ({
              ...vpc,
              resources: sortRes(vpc.resources ?? []),
              // Azure vpcs-alias subnets are canonicalized as well.
              ...(vpc.subnets !== undefined
                ? { subnets: byCanonical(vpc.subnets).map((s) => ({ ...s, resources: sortRes((s as { resources?: readonly { id: Id }[] }).resources) })) }
                : {}),
              ...(vpc.azs
                ? {
                    azs: byCanonical(vpc.azs as readonly ({ id: Id; label: string; subnets: readonly Entity[]; resources?: readonly { id: Id }[] })[]).map((az) => ({
                      ...az,
                      resources: sortRes(az.resources ?? []),
                      subnets: byCanonical(az.subnets).map((s) => ({ ...s, resources: sortRes((s as { resources?: readonly { id: Id }[] }).resources) })),
                    })),
                  }
                : {}),
            })),
          }
        : {}),
      ...(region.vnets
        ? {
            vnets: byCanonical(region.vnets as readonly (VnetLike & { resources?: readonly { id: Id }[] })[]).map((vnet) => ({
              ...vnet,
              resources: sortRes(vnet.resources ?? []),
              subnets: byCanonical(vnet.subnets ?? []).map((s) => ({ ...s, resources: sortRes((s as { resources?: readonly { id: Id }[] }).resources) })),
            })),
          }
        : {}),
    })),
    ...(cloud.networks
      ? {
          networks: byCanonical(cloud.networks as readonly (NetworkLike & { resources?: readonly { id: Id }[] })[]).map((net) => ({
            ...net,
            resources: sortRes(net.resources),
            regions: byCanonical(net.regions as readonly (VnetLike & { resources?: readonly { id: Id }[] })[]).map((r) => ({
              ...r,
              resources: sortRes(r.resources),
              subnets: byCanonical(r.subnets).map((s) => ({ ...s, resources: sortRes((s as { resources?: readonly { id: Id }[] }).resources) })),
            })),
          })),
        }
      : {}),
  };
  const ordered = {
    ...spec,
    geography: byCanonical(spec.geography),
    externals: byCanonical(spec.externals),
    policies: byCanonical(spec.policies),
    frames: byCanonical(spec.frames),
    planes: byCanonical(spec.planes),
    edges: byCanonical(spec.edges),
    routingFacts: byCanonical(spec.routingFacts),
    routeCards: byCanonical(spec.routeCards),
    // Views are genuinely ordered (progressive disclosure) — preserved as authored.
    views: spec.views,
    cloud: orderedCloud as unknown as StratusSpec["cloud"],
  } as StratusSpec;
  const canonical = canonicalJSON(ordered);
  return { spec: ordered, indexes, canonical, problems };
}

/** Deterministic canonical JSON with sorted object keys. */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Least common semantic ancestor scope for a set of subnet ids. */
export function leastCommonAncestor(indexes: NormalizedIndexes, subnetIds: readonly string[]): string | undefined {
  const chains = subnetIds.map((id) => ancestorChain(indexes, id));
  if (chains.length === 0) return undefined;
  const first = chains[0];
  if (first === undefined) return undefined;
  let common = first;
  for (const chain of chains.slice(1)) {
    let i = 0;
    while (i < common.length && i < chain.length && common[i] === chain[i]) i++;
    common = common.slice(0, i);
  }
  return common[common.length - 1];
}

export function ancestorChain(indexes: NormalizedIndexes, id: string): string[] {
  const chain: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    chain.unshift(cur);
    cur = indexes.parentOf.get(cur);
  }
  return chain;
}


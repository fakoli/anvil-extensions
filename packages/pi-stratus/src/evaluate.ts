// /stratus-evaluate (T012): compare a created diagram against gold-standard
// references. Produces a bounded evaluation record — advisory, never a gate.
// Dimensions are scene-based (measured against the compiled scene), with a
// versioned reference/rubric manifest when a referenceDir is supplied.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { compileDiagram, type CompileResult, type CompileOk } from "./pipeline.ts";
import { glyphPaintBounds } from "./glyphs.ts";
import { segmentsIntersect } from "./geometry.ts";
import type { StratusSpec } from "./schema.ts";

export interface EvaluationDimension {
  dimension: string;
  score: number; // 0..1
  notes: string[];
}

export interface EvaluationRecord {
  ok: boolean;
  subject: string;
  referenceGrade: string;
  dimensions: EvaluationDimension[];
  overall: number;
  error?: string;
}

export interface EvaluateRequest {
  spec: StratusSpec | unknown;
  referenceDir?: string;
}

/** Load gold-standard reference specs (JSON) from a directory, if present. */
export function loadReferences(referenceDir: string): { id: string; spec: unknown }[] {
  if (!existsSync(referenceDir)) return [];
  return readdirSync(referenceDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.replace(/\.json$/, ""), spec: JSON.parse(readFileSync(join(referenceDir, f), "utf8")) }));
}

/** AWS VPC resources (vpc + az + subnet levels), typed through unknown. */
function awsVpcResources(region: unknown): { id: string }[] {
  const r = region as { vpcs?: { resources?: { id: string }[]; azs?: { resources?: { id: string }[]; subnets?: { resources?: { id: string }[] }[] }[] } };
  const vpcs = (r.vpcs ?? []) as { resources?: { id: string }[]; azs?: { resources?: { id: string }[]; subnets?: { resources?: { id: string }[] }[] } }[];
  const out: { id: string }[] = [];
  for (const v of vpcs) {
    out.push(...(v.resources ?? []));
    const azs = (v.azs ?? []) as { resources?: { id: string }[]; subnets?: { resources?: { id: string }[] }[] }[];
    for (const az of azs) {
      out.push(...(az.resources ?? []));
      for (const s of az.subnets ?? []) out.push(...(s.resources ?? []));
    }
  }
  return out;
}

/** GCP network subnet resources, typed through unknown. */
function gcpNetworkResources(cloud: unknown): { id: string }[] {
  const c = cloud as { networks?: { regions?: { subnets?: { resources?: { id: string }[] }[] }[] }[] };
  return (c.networks ?? []).flatMap((n) => (n.regions ?? []).flatMap((r) => (r.subnets ?? []).flatMap((s) => s.resources ?? [])));
}

const DIMENSIONS = ["containment-tree", "placement-truth", "routing-explainability", "cidr-truth", "edge-separation"] as const;

/** Scene-based structural dimensions — measured against the compiled scene. */
function sceneDimensions(spec: StratusSpec, scene: CompileOk["scene"]): EvaluationDimension[] {
  const notes = (n: string[]) => n;
  // containment-tree: every VPC has AZ slices; the scene nests the boundary stack.
  // Provider-aware scope traversal: AWS VPCs hold AZ slices; Azure VNets
  // (under vnets OR the vpcs alias) hold subnets directly; GCP networks hold
  // regions with subnets.
  type VpcLike = { id?: string; cidrs?: { status: string }; azs?: readonly { resources?: readonly { id: string }[]; subnets?: readonly { id?: string; cidrs?: { status: string }; resources?: readonly { id: string }[] }[] }[]; subnets?: readonly { id?: string; cidrs?: { status: string }; resources?: readonly { id: string }[] }[]; resources?: readonly { id: string }[] };
  const vpcs: VpcLike[] = spec.cloud.regions.flatMap((r) => {
    if (spec.provider === "azure") return ((r as { vnets?: VpcLike[] }).vnets ?? (r as { vpcs?: VpcLike[] }).vpcs ?? []);
    return ("vpcs" in r ? [...(r as unknown as { vpcs: VpcLike[] }).vpcs] : []);
  });
  const hasAzSlices = (v: VpcLike): boolean => (v.azs !== undefined ? v.azs.length > 0 : (v.subnets?.length ?? 0) > 0);
  const networkBoundaries = scene.boundaries.filter((b) => b.level === "network");
  const azBoundaries = scene.boundaries.filter((b) => b.level === "az");
  const subnetBoundaries = scene.boundaries.filter((b) => b.level === "subnet");
  const containmentScore =
    (vpcs.length === 0 ? 0.5 : vpcs.every((v) => hasAzSlices(v)) ? 1 : 0.5) *
    (networkBoundaries.length >= Math.min(vpcs.length, 1) ? 1 : 0.5) *
    (azBoundaries.length > 0 || spec.provider !== "aws" ? 1 : 0.5) *
    (subnetBoundaries.length > 0 ? 1 : 0.5);
  const containmentNotes = notes([
    vpcs.every((v) => hasAzSlices(v)) ? "every VPC declares AZ slices or subnets" : "some VPCs declare no AZ slices or subnets",
    `${networkBoundaries.length} network / ${azBoundaries.length} az / ${subnetBoundaries.length} subnet boundaries in the scene`,
  ]);
  // placement-truth: every declared resource carries a truthful placement kind
  // AND paints inside a declared scope (linked instances included). Cloud and
  // regional resources are accounted too.
  const declaredResources = [
    ...((spec.cloud as { resources?: readonly { id: string }[] }).resources ?? []),
    ...spec.cloud.regions.flatMap((r) => [
      ...(r.resources ?? []),
      ...(spec.provider === "aws" && "vpcs" in r ? awsVpcResources(r) : []),
      ...(spec.provider === "azure" ? ((r as { vnets?: { resources?: readonly { id: string }[]; subnets?: readonly { resources?: readonly { id: string }[] }[] }[] }).vnets ?? (r as { vpcs?: { resources?: readonly { id: string }[]; subnets?: readonly { resources?: readonly { id: string }[] }[] }[] }).vpcs ?? []).flatMap((v) => [
        ...(v.resources ?? []),
        ...(v.subnets ?? []).flatMap((s) => s.resources ?? []),
      ]) : []),
    ]),
    ...(spec.provider === "gcp" ? gcpNetworkResources(spec.cloud) : []),
  ];
  // Containment-truth: a resource counts only when it paints INSIDE its
  // owner scope's boundary — mere presence is not enough.
  const paintedResourceIds = new Set(scene.nodes.map((n) => n.resourceId));
  const regionBounds = new Map(scene.boundaries.filter((b) => b.level === "region").map((b) => [b.id.replace("boundary-region-", ""), b.paint]));
  const networkBounds = new Map(scene.boundaries.filter((b) => b.level === "network").map((b) => [b.id.replace("boundary-network-", ""), b.paint]));
  const unpainted = declaredResources.filter((r) => !paintedResourceIds.has(r.id));
  const outsideScope = scene.nodes.filter((n) => {
    const rb = regionBounds.get(n.ownerScopeId);
    const nb = networkBounds.get(n.ownerScopeId);
    const bound = rb ?? nb;
    if (!bound) return false;
    return n.body.x < bound.x - 0.5 || n.body.y < bound.y - 0.5 ||
      n.body.x + n.body.width > bound.x + bound.width + 0.5 ||
      n.body.y + n.body.height > bound.y + bound.height + 0.5;
  });
  const placementScore = declaredResources.length === 0 ? 0.5 : 1 - (unpainted.length + outsideScope.length) / declaredResources.length;
  const placementNotes = notes([
    `${declaredResources.length} declared resources, ${paintedResourceIds.size} painted, ${outsideScope.length} painted outside their scope`,
    ...(unpainted.length > 0 ? [`unpainted: ${unpainted.slice(0, 5).map((r) => r.id).join(", ")}`] : []),
  ]);
  // routing-explainability: routing facts exist AND route cards render as
  // first-class tables; routing decisions reference declared route tables.
  const routeTables = spec.routingFacts.filter((rf) => rf.kind === "route-table");
  const decisions = spec.routingFacts.filter((rf) => rf.kind === "routing-decision");
  const cards = scene.cards.length;
  const routingScore =
    (spec.routingFacts.length > 0 ? 0.75 : 0.25) +
    (routeTables.length > 0 ? 0.125 : 0) +
    (cards > 0 || routeTables.length === 0 ? 0.125 : 0);
  const routingNotes = notes([
    `${spec.routingFacts.length} routing facts (${routeTables.length} tables, ${decisions.length} decisions)`,
    `${cards} route cards rendered`,
  ]);
  // cidr-truth: VPC AND subnet CIDRs are known, not silently unknown.
  // Provider-aware: AWS scopes nest under azs; Azure/GCP scopes carry
  // subnets directly.
  const allScopes: { id: string; cidrs: { status: string } }[] = [
    ...vpcs.filter((v): v is VpcLike & { id: string; cidrs: { status: string } } => v.id !== undefined && v.cidrs !== undefined),
    ...vpcs.flatMap((v) => [
      ...(v.azs ?? []).flatMap((az) => (az.subnets ?? []).filter((s): s is { id: string; cidrs: { status: string } } => s.id !== undefined && s.cidrs !== undefined)),
      ...(v.subnets ?? []).filter((s): s is { id: string; cidrs: { status: string } } => s.id !== undefined && s.cidrs !== undefined),
    ]),
  ];
  const knownScopes = allScopes.filter((v) => v.cidrs.status === "known").length;
  const cidrScore = allScopes.length === 0 ? 0.5 : knownScopes / allScopes.length;
  const cidrNotes = notes([`${knownScopes}/${allScopes.length} VPC/subnet CIDRs known`]);
  // edge-separation: distinct edge kinds AND distinct SERIALIZED paint styles
  // (kind + variant + family as carried into the SVG).
  const kinds = new Set(spec.edges.map((e) => e.kind));
  const styles = new Set(scene.routes.map((r) => `${r.kind}:${r.variant}:${r.family}`));
  const edgeScore = kinds.size >= 2 ? (styles.size >= 2 ? 1 : 0.85) : kinds.size === 1 ? 0.75 : 0.25;
  const edgeNotes = notes([`${kinds.size} edge kinds, ${styles.size} distinct paint styles`]);
  return [
    { dimension: "containment-tree", score: containmentScore, notes: containmentNotes },
    { dimension: "placement-truth", score: placementScore, notes: placementNotes },
    { dimension: "routing-explainability", score: Math.min(routingScore, 1), notes: routingNotes },
    { dimension: "cidr-truth", score: cidrScore, notes: cidrNotes },
    { dimension: "edge-separation", score: edgeScore, notes: edgeNotes },
  ];
}

/** Evaluate a compiled diagram against the five named dimensions. */
export function evaluateDiagram(request: EvaluateRequest): EvaluationRecord {
  const result: CompileResult = compileDiagram(request.spec, { theme: "light", interactive: false });
  if (!result.ok) {
    return { ok: false, subject: "diagram", referenceGrade: result.receipt.referenceGrade, dimensions: [], overall: 0, error: `compile failed at ${result.stage}` };
  }
  const dimensions = sceneDimensions(result.spec, result.scene);
  const overall = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
  // Reference assessment: ACTUAL comparison against gold-standard references
  // when a referenceDir is supplied — boundary counts and routing-fact
  // coverage are compared, and the best match is folded into the notes.
  if (request.referenceDir !== undefined) {
    const references = loadReferences(request.referenceDir);
    const specCloud = request.spec as { cloud?: { regions?: unknown[] }; routingFacts?: unknown[] };
    if (references.length > 0) {
      const sceneBoundaryCount = result.scene.boundaries.length;
      const scored = references.map((ref) => {
        const rs = ref.spec as { cloud?: { regions?: unknown[] }; routingFacts?: unknown[] };
        const refRegions = Array.isArray(rs.cloud?.regions) ? rs.cloud.regions.length : 0;
        const refFacts = Array.isArray(rs.routingFacts) ? rs.routingFacts.length : 0;
        const regionDelta = Math.abs(refRegions - (Array.isArray(specCloud.cloud?.regions) ? specCloud.cloud.regions.length : 0));
        const factDelta = Math.abs(refFacts - (Array.isArray(specCloud.routingFacts) ? specCloud.routingFacts.length : 0));
        // Rendered geometry: the compiled scene's boundary count vs the
        // reference's COMPILED scene boundary count (the reference spec is
        // compiled when possible; a guess is never substituted silently).
        let refBoundaryCount: number;
        let compiled = false;
        try {
          const refResult = compileDiagram(ref.spec as never, { theme: "light", interactive: false });
          if (refResult.ok) {
            refBoundaryCount = refResult.scene.boundaries.length;
            compiled = true;
          } else {
            refBoundaryCount = refRegions + 2;
          }
        } catch {
          refBoundaryCount = refRegions + 2;
        }
        const geometryDelta = Math.abs(refBoundaryCount - sceneBoundaryCount);
        const similarity = 1 - Math.min(1, (regionDelta + factDelta + geometryDelta) / Math.max(1, refRegions + refFacts + refBoundaryCount));
        return { id: ref.id, similarity, regionDelta, factDelta, geometryDelta, compiled };
      }).sort((a, b) => b.similarity - a.similarity);
      const best = scored[0];
      if (best) {
        // The best-match similarity FOLDS INTO the containment-tree score —
        // the reference comparison affects scores, not just notes.
        const containment = dimensions.find((d) => d.dimension === "containment-tree");
        if (containment) containment.score = Math.min(1, containment.score * (0.7 + 0.3 * best.similarity));
        const overall = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
        for (const dim of dimensions) {
          dim.notes.push(`best reference ${best.id}: similarity ${(best.similarity * 100).toFixed(0)}% (region delta ${best.regionDelta}, routing-fact delta ${best.factDelta}, geometry delta ${best.geometryDelta}${best.compiled ? ", reference compiled" : ", reference NOT compiled (guessed boundary count)"})`);
        }
        return { ok: true, subject: result.spec.title, referenceGrade: result.receipt.referenceGrade, dimensions, overall };
      }
    } else {
      for (const dim of dimensions) {
        dim.notes.push("no gold-standard references found in referenceDir — perceptual comparison NOT performed");
      }
    }
  } else {
    // Comprehensive reporting: no referenceDir supplied at all is stated on
    // every dimension, not conditionally.
    for (const dim of dimensions) {
      dim.notes.push("no referenceDir supplied — perceptual comparison NOT performed");
    }
  }
  return { ok: true, subject: result.spec.title, referenceGrade: result.receipt.referenceGrade, dimensions, overall };
}

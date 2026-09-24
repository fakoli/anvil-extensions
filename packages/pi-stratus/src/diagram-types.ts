// General-purpose diagram types (T014): workflow, sequence, dataflow, and
// lifecycle specs validate through the same gates and render through the same
// SVG/HTML serialization. Shared boundary/spacing constructs; no per-type forks.

import { paletteFor, FONT, type ThemeName } from "./profiles.ts";
import { escapeXml } from "./renderer.ts";
import { ENGINE_VERSION } from "./validator.ts";

export type GeneralKind = "workflow" | "sequence" | "dataflow" | "lifecycle";

export interface GeneralNode {
  id: string;
  label: string;
  kind?: string;
}

export interface GeneralEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** sequence: message order; lifecycle: transition trigger. */
  order?: number;
}

export interface GeneralSpec {
  schemaVersion: 1;
  kind: GeneralKind;
  title: string;
  nodes: GeneralNode[];
  edges: GeneralEdge[];
  lanes?: { id: string; label: string; nodeIds: string[] }[];
  theme?: "light" | "dark";
}

export interface GeneralDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  subjects: string[];
}

export interface GeneralReceipt {
  schemaVersion: 1;
  engineVersion: string;
  kind: GeneralKind;
  gates: { id: string; status: "passed" | "failed"; diagnostics: GeneralDiagnostic[] }[];
  referenceGrade: "eligible" | "blocked";
}

export interface GeneralRender {
  svg: string;
  html: string;
  receipt: GeneralReceipt;
}

const KINDS: readonly GeneralKind[] = ["workflow", "sequence", "dataflow", "lifecycle"];

/** Structural validation: shared gates for every general type. */
export function validateGeneral(spec: GeneralSpec): { diagnostics: GeneralDiagnostic[]; receipt: GeneralReceipt } {
  const diagnostics: GeneralDiagnostic[] = [];
  if (!KINDS.includes(spec.kind)) {
    diagnostics.push({ code: "KIND_INVALID", severity: "error", message: `unknown diagram kind: ${String(spec.kind)}`, subjects: [] });
  }
  const ids = new Set<string>();
  for (const n of spec.nodes) {
    if (ids.has(n.id)) diagnostics.push({ code: "ID_DUPLICATE", severity: "error", message: `duplicate node id: ${n.id}`, subjects: [n.id] });
    ids.add(n.id);
  }
  for (const e of spec.edges) {
    if (!ids.has(e.from)) diagnostics.push({ code: "REFERENCE_MISSING", severity: "error", message: `edge ${e.id} from references unknown node ${e.from}`, subjects: [e.id] });
    if (!ids.has(e.to)) diagnostics.push({ code: "REFERENCE_MISSING", severity: "error", message: `edge ${e.id} to references unknown node ${e.to}`, subjects: [e.id] });
  }
  // Lifecycle edges form transitions between declared states (no self-loops).
  if (spec.kind === "lifecycle") {
    for (const e of spec.edges) {
      if (e.from === e.to) diagnostics.push({ code: "TRANSITION_SELF_LOOP", severity: "warning", message: `transition ${e.id} loops on ${e.from}`, subjects: [e.id] });
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error");
  const receipt: GeneralReceipt = {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    kind: spec.kind,
    gates: [{ id: "general-semantic", status: errors.length > 0 ? "failed" : "passed", diagnostics }],
    referenceGrade: errors.length > 0 ? "blocked" : "eligible",
  };
  return { diagnostics, receipt };
}

interface Box { x: number; y: number; width: number; height: number; label: string; id: string }
interface Arrow { points: { x: number; y: number }[]; label?: string }

const CELL_W = 150;
const CELL_H = 56;
const GAP_X = 90;
const GAP_Y = 72;
const M = 24;

/** Deterministic per-kind layout into boxes + arrows. Shared spacing minima. */
export function layoutGeneral(spec: GeneralSpec): { boxes: Box[]; arrows: Arrow[]; width: number; height: number; legend: string[] } {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const boxes: Box[] = [];
  const arrows: Arrow[] = [];
  const legend: string[] = [`${spec.kind} diagram`];

  if (spec.kind === "sequence") {
    // Participants across the top; messages as horizontal arrows at increasing y.
    const count = Math.max(1, spec.nodes.length);
    const width = M * 2 + count * CELL_W + (count - 1) * GAP_X;
    spec.nodes.forEach((n, i) => {
      boxes.push({ id: n.id, label: n.label, x: M + i * (CELL_W + GAP_X), y: M, width: CELL_W, height: CELL_H });
    });
    const ordered = [...spec.edges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    ordered.forEach((e, i) => {
      const fromBox = boxes.find((b) => b.id === e.from);
      const toBox = boxes.find((b) => b.id === e.to);
      if (!fromBox || !toBox) return;
      const y = M + CELL_H + 48 + i * GAP_Y;
      arrows.push({ points: [{ x: fromBox.x + CELL_W / 2, y }, { x: toBox.x + CELL_W / 2, y }], ...(e.label !== undefined ? { label: e.label } : {}) });
    });
    const height = M + CELL_H + 48 + Math.max(1, ordered.length) * GAP_Y + M;
    return { boxes, arrows, width, height, legend };
  }

  // workflow / dataflow / lifecycle: layered top-down by longest-path depth.
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const n of spec.nodes) incoming.set(n.id, []);
  for (const e of spec.edges) if (byId.has(e.from) && byId.has(e.to)) incoming.get(e.to)?.push(e.from);
  const resolve = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id) ?? 0;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = incoming.get(id) ?? [];
    const d = parents.length === 0 ? 0 : Math.max(...parents.map((p) => resolve(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  for (const n of spec.nodes) resolve(n.id, new Set());

  const layers = new Map<number, string[]>();
  for (const n of spec.nodes) {
    const d = depth.get(n.id) ?? 0;
    const layer = layers.get(d) ?? [];
    layer.push(n.id);
    layers.set(d, layer);
  }
  const maxLayer = Math.max(0, ...layers.keys());
  const width = M * 2 + Math.max(1, ...[...layers.values()].map((l) => l.length)) * CELL_W + GAP_X * 3;
  for (const [d, layer] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    layer.forEach((id, i) => {
      const n = byId.get(id);
      if (!n) return;
      boxes.push({ id, label: n.label, x: M + i * (CELL_W + GAP_X), y: M + d * (CELL_H + GAP_Y), width: CELL_W, height: CELL_H });
    });
  }
  for (const e of spec.edges) {
    const from = boxes.find((b) => b.id === e.from);
    const to = boxes.find((b) => b.id === e.to);
    if (!from || !to) continue;
    const labelOpt = e.label !== undefined ? { label: e.label } : {};
    if (to.y > from.y) {
      arrows.push({ ...(labelOpt as { label?: string }), points: [
        { x: from.x + CELL_W / 2, y: from.y + CELL_H },
        { x: from.x + CELL_W / 2, y: (from.y + CELL_H + to.y) / 2 },
        { x: to.x + CELL_W / 2, y: (from.y + CELL_H + to.y) / 2 },
        { x: to.x + CELL_W / 2, y: to.y },
      ] });
    } else {
      // Same layer (lifecycle cycle): route around the right side.
      const rightX = Math.max(from.x + from.width, to.x + to.width) + 40;
      arrows.push({ ...(labelOpt as { label?: string }), points: [
        { x: from.x + from.width, y: from.y + CELL_H / 2 },
        { x: rightX, y: from.y + CELL_H / 2 },
        { x: rightX, y: to.y + CELL_H / 2 },
        { x: to.x + to.width, y: to.y + CELL_H / 2 },
      ] });
    }
  }
  const height = M * 2 + (maxLayer + 1) * (CELL_H + GAP_Y);
  // Size from real extents: arrows may extend beyond the declared width
  // (same-layer cycle routes around the right side).
  const extentW = Math.max(width, ...arrows.flatMap((a) => a.points.map((p) => p.x + M)), ...boxes.map((b) => b.x + b.width + M));
  const extentH = Math.max(height, ...arrows.flatMap((a) => a.points.map((p) => p.y + M)), ...boxes.map((b) => b.y + b.height + M));
  return { boxes, arrows, width: extentW, height: extentH, legend };
}

/** Render a general spec into SVG + standalone HTML with a truthful receipt. */
export function renderGeneral(spec: GeneralSpec, theme: ThemeName = "light"): GeneralRender {
  const { diagnostics, receipt } = validateGeneral(spec);
  const { boxes, arrows, width, height, legend } = layoutGeneral(spec);
  const p = paletteFor(theme);
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="general-title">`);
  out.push(`<title id="general-title">${escapeXml(spec.title)}</title>`);
  out.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${p.background}"/>`);
  // Sequence diagrams draw lifelines under their participant boxes.
  if (spec.kind === "sequence") {
    for (const b of boxes) {
      out.push(`<line x1="${b.x + b.width / 2}" y1="${b.y + b.height}" x2="${b.x + b.width / 2}" y2="${height - M}" stroke="${p.muted}" stroke-width="1" stroke-dasharray="4 4"/>`);
    }
  }
  for (const a of arrows) {
    const pts = a.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${p.ipv4}" stroke-width="1.5"/>`);
    // Directional arrowhead along the final segment.
    const ptsArr = a.points;
    if (ptsArr.length >= 2) {
      const p1 = ptsArr[ptsArr.length - 2];
      const p2 = ptsArr[ptsArr.length - 1];
      if (p1 !== undefined && p2 !== undefined) {
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const size = 8;
        const x1 = p2.x - size * Math.cos(angle - Math.PI / 6);
        const y1 = p2.y - size * Math.sin(angle - Math.PI / 6);
        const x2 = p2.x - size * Math.cos(angle + Math.PI / 6);
        const y2 = p2.y - size * Math.sin(angle + Math.PI / 6);
        out.push(`<polygon points="${p2.x},${p2.y} ${x1},${y1} ${x2},${y2}" fill="${p.ipv4}"/>`);
      }
    }
    if (a.label) {
      const mid = a.points[Math.floor(a.points.length / 2)] ?? { x: 0, y: 0 };
      out.push(`<text x="${mid.x}" y="${mid.y - 6}" font-family="${FONT.family}" font-size="12" fill="${p.muted}" text-anchor="middle">${escapeXml(a.label)}</text>`);
    }
  }
  for (const b of boxes) {
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" fill="none" stroke="${p.primary}" stroke-width="1.5"/>`);
    out.push(`<text x="${b.x + b.width / 2}" y="${b.y + b.height / 2 + 4}" font-family="${FONT.family}" font-size="13" fill="${p.primary}" text-anchor="middle">${escapeXml(b.label)}</text>`);
  }
  out.push(`<text x="${M}" y="${height - 8}" font-family="${FONT.family}" font-size="11" fill="${p.muted}">${escapeXml(legend.join(" · "))} — validation: ${receipt.referenceGrade}</text>`);
  out.push(`</svg>`);
  const summary = `Validation: ${receipt.referenceGrade} — gates: ${receipt.gates.map((g) => `${g.id}:${g.status}`).join(", ")}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(spec.title)}</title>
<style>body { margin: 0; font-family: ${FONT.family}; background: ${p.background}; color: ${p.primary}; } #figure { max-width: 100%; height: auto; }</style>
</head>
<body><figure id="figure">${out.join("\n")}</figure><div id="summary" style="padding:8px 16px;font-size:12px;color:${p.muted}">${escapeXml(summary)}</div>
<script type="application/json" id="general-data">${JSON.stringify({ title: spec.title, receipt }).replaceAll("<", "\\u003c")}</script>
</body>
</html>`;
  return { svg: out.join("\n"), html, receipt };
}

/** Decode an unknown input into a GeneralSpec with typed diagnostics. */
export function decodeGeneral(input: unknown): { ok: true; spec: GeneralSpec } | { ok: false; diagnostics: GeneralDiagnostic[] } {
  const diagnostics: GeneralDiagnostic[] = [];
  if (typeof input !== "object" || input === null) {
    return { ok: false, diagnostics: [{ code: "SCHEMA_INVALID", severity: "error", message: "spec must be an object", subjects: [] }] };
  }
  const raw = input as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "schemaVersion must be 1", subjects: ["/schemaVersion"] });
  }
  if (!KINDS.includes(raw.kind as GeneralKind)) {
    diagnostics.push({ code: "KIND_INVALID", severity: "error", message: `kind must be one of ${KINDS.join(", ")}`, subjects: ["/kind"] });
  }
  if (typeof raw.title !== "string" || raw.title.length === 0) {
    diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "title must be a non-empty string", subjects: ["/title"] });
  }
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "nodes must be a non-empty array", subjects: ["/nodes"] });
  } else {
    for (let i = 0; i < raw.nodes.length; i += 1) {
      const n = raw.nodes[i];
      const np = `/nodes/${i}`;
      if (typeof n !== "object" || n === null || Array.isArray(n)) {
        diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "node must be an object", subjects: [np] });
        continue;
      }
      const rec = n as Record<string, unknown>;
      if (typeof rec.id !== "string" || rec.id.length === 0 || rec.id.length > 128) {
        diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "node id must be a non-empty string (max 128)", subjects: [`${np}/id`] });
      }
      if (typeof rec.label !== "string" || rec.label.length === 0) {
        diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "node label must be a non-empty string", subjects: [`${np}/label`] });
      }
    }
  }
  if (raw.edges !== undefined) {
    if (!Array.isArray(raw.edges)) {
      diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "edges must be an array", subjects: ["/edges"] });
    } else {
      for (let i = 0; i < raw.edges.length; i += 1) {
        const e = raw.edges[i];
        const ep = `/edges/${i}`;
        if (typeof e !== "object" || e === null || Array.isArray(e)) {
          diagnostics.push({ code: "SCHEMA_INVALID", severity: "error", message: "edge must be an object", subjects: [ep] });
        }
      }
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics };
  const spec: GeneralSpec = {
    schemaVersion: 1,
    kind: raw.kind as GeneralKind,
    title: raw.title as string,
    nodes: (raw.nodes as GeneralSpec["nodes"]),
    edges: (raw.edges as GeneralSpec["edges"]) ?? [],
  };
  if (raw.lanes !== undefined) spec.lanes = raw.lanes as NonNullable<GeneralSpec["lanes"]>;
  if (raw.theme !== undefined) spec.theme = raw.theme as NonNullable<GeneralSpec["theme"]>;
  return { ok: true, spec };
}

export { KINDS as GENERAL_KINDS, ENGINE_VERSION };

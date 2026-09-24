// Rect/segment predicates, ports, route normalization (T002/T004).
// Deterministic geometry predicates from the lead-engineer report.

import type { Face } from "./schema.ts";
import { THRESHOLDS, faceNormal } from "./profiles.ts";

export interface Point { x: number; y: number }

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment {
  start: Point;
  end: Point;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when `child` fits entirely inside `parent`'s content box. */
export function rectContains(parent: Rect, child: Rect): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
  );
}

/** Inset a rect by padding on each side. */
export function insetRect(r: Rect, left: number, top: number, right: number, bottom: number): Rect {
  return {
    x: r.x + left,
    y: r.y + top,
    width: Math.max(0, r.width - left - right),
    height: Math.max(0, r.height - top - bottom),
  };
}

export function inflateRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function faceLength(r: Rect, face: Face): number {
  return face === "left" || face === "right" ? r.height : r.width;
}

/** Port position for slot j of n on a face, centered spread. */
export function portOnFace(r: Rect, face: Face, slot: number, count: number): Point {
  const cornerInset = 12;
  const span = faceLength(r, face) - 2 * cornerInset;
  const offset = count <= 1 ? span / 2 : (span / (count - 1)) * slot;
  switch (face) {
    case "top": return { x: r.x + cornerInset + offset, y: r.y };
    case "bottom": return { x: r.x + cornerInset + offset, y: r.y + r.height };
    case "left": return { x: r.x, y: r.y + cornerInset + offset };
    case "right": return { x: r.x + r.width, y: r.y + cornerInset + offset };
  }
}

export function isOrthogonal(points: readonly Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) return false;
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return false;
  }
  return true;
}

export function segmentLength(s: Segment): number {
  return Math.abs(s.end.x - s.start.x) + Math.abs(s.end.y - s.start.y);
}

/** Normalize a polyline: dedupe points, merge collinear runs, reject backtracking. */
export function normalizePolyline(points: readonly Point[]): { points: Point[]; backtrack: boolean } {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
  }
  // Merge collinear runs.
  const merged: Point[] = [];
  for (let i = 0; i < out.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = out[i];
    const next = out[i + 1];
    if (cur === undefined) continue;
    if (prev && next) {
      const collinearH = prev.y === cur.y && cur.y === next.y;
      const collinearV = prev.x === cur.x && cur.x === next.x;
      const dirH = Math.sign(cur.x - prev.x) === Math.sign(next.x - cur.x);
      const dirV = Math.sign(cur.y - prev.y) === Math.sign(next.y - cur.y);
      if ((collinearH && dirH) || (collinearV && dirV)) continue;
    }
    merged.push(cur);
  }
  // Reject backtracking (180° reversal).
  let backtrack = false;
  for (let i = 2; i < merged.length; i++) {
    const a = merged[i - 2];
    const b = merged[i - 1];
    const c = merged[i];
    if (a === undefined || b === undefined || c === undefined) continue;
    if (a.x === c.x && a.y === c.y) backtrack = true;
    if ((a.x === b.x && b.x === c.x && Math.sign(b.y - a.y) === -Math.sign(c.y - b.y) && b.y !== a.y && c.y !== b.y) ||
        (a.y === b.y && b.y === c.y && Math.sign(b.x - a.x) === -Math.sign(c.x - b.x) && b.x !== a.x && c.x !== b.x)) {
      backtrack = true;
    }
  }
  return { points: merged, backtrack };
}

export function segmentViolations(points: readonly Point[]): { zero: number; micro: number; microInterior: boolean } {
  let zero = 0;
  let micro = 0;
  let microInterior = false;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev === undefined || cur === undefined) continue;
    const len = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    if (len < 0.01) {
      zero++;
      continue;
    }
    const isEndpointStub = i === 1 || i === points.length - 1;
    if (len < THRESHOLDS.microSegmentMin) {
      micro++;
      if (!isEndpointStub) microInterior = true;
    } else if (len < THRESHOLDS.interiorSegmentMin && !isEndpointStub) {
      microInterior = true;
    }
  }
  return { zero, micro, microInterior };
}

/** First/last segment side contracts: outward from source, into target. */
export function sideContractViolations(
  points: readonly Point[],
  sourceFace: Face,
  targetFace: Face,
): boolean {
  if (points.length < 2) return false;
  const first = points[1];
  const p0 = points[0];
  if (first === undefined || p0 === undefined) return false;
  const sn = faceNormal(sourceFace);
  // First segment must move along the outward normal of the source face.
  const firstDx = Math.sign(first.x - p0.x);
  const firstDy = Math.sign(first.y - p0.y);
  if (!(firstDx === sn.dx && firstDy === sn.dy) && !(firstDx === 0 && firstDy === 0)) {
    return true;
  }
  const last = points[points.length - 2];
  const end = points[points.length - 1];
  if (last === undefined || end === undefined) return false;
  const tn = faceNormal(targetFace);
  // Final segment must oppose the target's outward normal (arrive inward).
  const lastDx = Math.sign(end.x - last.x);
  const lastDy = Math.sign(end.y - last.y);
  if (!(lastDx === -tn.dx && lastDy === -tn.dy)) return true;
  return false;
}

/** Distance from a point to a segment (Manhattan-friendly approximation). */
export function pointSegmentDistance(p: Point, s: Segment): number {
  const dx = s.end.x - s.start.x;
  const dy = s.end.y - s.start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.abs(p.x - s.start.x) + Math.abs(p.y - s.start.y);
  let t = ((p.x - s.start.x) * dx + (p.y - s.start.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: s.start.x + t * dx, y: s.start.y + t * dy };
  return Math.abs(p.x - proj.x) + Math.abs(p.y - proj.y);
}

/** Minimum distance between two segments (axis-aligned). */
export function segmentDistance(a: Segment, b: Segment): number {
  const candidates = [
    pointSegmentDistance(a.start, b),
    pointSegmentDistance(a.end, b),
    pointSegmentDistance(b.start, a),
    pointSegmentDistance(b.end, a),
  ];
  return Math.min(...candidates);
}

/** True when a segment runs parallel within `proximity` of a rect edge for ≥ overlap. */
export function borderRun(s: Segment, r: Rect): boolean {
  const horizontal = s.start.y === s.end.y;
  const vertical = s.start.x === s.end.x;
  const overlapLen = horizontal
    ? Math.min(s.end.x, r.x + r.width) - Math.max(s.start.x, r.x)
    : vertical
      ? Math.min(s.end.y, r.y + r.height) - Math.max(s.start.y, r.y)
      : 0;
  if (overlapLen < THRESHOLDS.borderRunOverlap) return false;
  if (horizontal) {
    const dTop = Math.abs(s.start.y - r.y);
    const dBottom = Math.abs(s.start.y - (r.y + r.height));
    return dTop <= THRESHOLDS.borderRunProximity || dBottom <= THRESHOLDS.borderRunProximity;
  }
  if (vertical) {
    const dLeft = Math.abs(s.start.x - r.x);
    const dRight = Math.abs(s.start.x - (r.x + r.width));
    return dLeft <= THRESHOLDS.borderRunProximity || dRight <= THRESHOLDS.borderRunProximity;
  }
  return false;
}

/** Segment-segment proper intersection (axis-aligned). */
export function segmentsIntersect(a: Segment, b: Segment): boolean {
  const aH = a.start.y === a.end.y;
  const bH = b.start.y === b.end.y;
  if (aH === bH) return false; // parallel — not a crossing
  const [h, v] = aH ? [a, b] : [b, a];
  const vx = v.start.x;
  const hy = h.start.y;
  const withinX = vx >= Math.min(h.start.x, h.end.x) && vx <= Math.max(h.start.x, h.end.x);
  const withinY = hy >= Math.min(v.start.y, v.end.y) && hy <= Math.max(v.start.y, v.end.y);
  const withinVY = hy >= Math.min(v.start.y, v.end.y) && hy <= Math.max(v.start.y, v.end.y);
  const withinHX = vx >= Math.min(h.start.x, h.end.x) && vx <= Math.max(h.start.x, h.end.x);
  return withinX && withinY && withinVY && withinHX;
}

/** Quantize to 1/64 px fixed point, consistently. */
export function quantize(n: number): number {
  return Math.round(n * 64) / 64;
}

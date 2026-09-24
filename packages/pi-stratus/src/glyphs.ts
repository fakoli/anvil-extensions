// Glyph geometry (T005): original geometric marks — circular gateways,
// chip compute, boxed external. No trademark reproduction (R009).

export type GlyphKind = "gateway" | "compute" | "external" | "service" | "data" | "security";

export interface GlyphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GlyphFragment {
  kind: "circle" | "rect" | "line";
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string | "none";
  stroke?: string;
  strokeWidth?: number;
}

/** Return the SVG fragment list for a glyph centered in the given rect. */
/**
 * The actual painted bounds of a glyph inside its allocation cell — separate
 * from the cell itself. Routes terminate at these visible bounds, and
 * collision checks use them instead of the invisible cell edges.
 */
export function glyphPaintBounds(glyph: GlyphKind, rect: GlyphRect): GlyphRect {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  switch (glyph) {
    case "gateway":
      // Circle r=20 → square bounds 40×40 centered.
      return { x: cx - 20, y: cy - 20, width: 40, height: 40 };
    case "external":
      return rect;
    case "compute": {
      // Chip 32×32 plus tabs along the longer axis (32×40 portrait,
      // 40×32 landscape after transpose).
      const landscape = rect.width > rect.height;
      return landscape
        ? { x: cx - 20, y: cy - 16, width: 40, height: 32 }
        : { x: cx - 16, y: cy - 20, width: 32, height: 40 };
    }
    case "service":
      return { x: cx - 14, y: cy - 14, width: 28, height: 28 };
    case "data":
      // Cylinder: 28×32 body with ellipse caps.
      return { x: cx - 14, y: cy - 16, width: 28, height: 32 };
    case "security":
      // Shield: 26×30.
      return { x: cx - 13, y: cy - 15, width: 26, height: 30 };
  }
}

export function glyphFragments(glyph: GlyphKind, rect: GlyphRect, primary: string, muted: string): GlyphFragment[] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  switch (glyph) {
    case "gateway":
      return [
        { kind: "circle", cx, cy, r: 20, fill: "none", stroke: primary, strokeWidth: 1.5 },
        { kind: "circle", cx, cy, r: 12, fill: "none", stroke: primary, strokeWidth: 1 },
      ];
    case "external":
      return [{ kind: "rect", x: rect.x, y: rect.y, width: rect.width, height: rect.height, fill: "none", stroke: muted, strokeWidth: 1.5 }];
    case "compute": {
      // Tabs extend along the longer axis (orientation-aware).
      const landscape = rect.width > rect.height;
      if (landscape) {
        return [
          { kind: "rect", x: cx - 16, y: cy - 16, width: 32, height: 32, fill: "none", stroke: primary, strokeWidth: 1.5 },
          { kind: "rect", x: cx - 20, y: cy - 16, width: 4, height: 6, fill: primary },
          { kind: "rect", x: cx - 20, y: cy + 10, width: 4, height: 6, fill: primary },
          { kind: "rect", x: cx + 16, y: cy - 16, width: 4, height: 6, fill: primary },
          { kind: "rect", x: cx + 16, y: cy + 10, width: 4, height: 6, fill: primary },
        ];
      }
      return [
        { kind: "rect", x: cx - 16, y: cy - 16, width: 32, height: 32, fill: "none", stroke: primary, strokeWidth: 1.5 },
        { kind: "rect", x: cx - 16, y: cy - 20, width: 6, height: 4, fill: primary },
        { kind: "rect", x: cx + 10, y: cy - 20, width: 6, height: 4, fill: primary },
        { kind: "rect", x: cx - 16, y: cy + 16, width: 6, height: 4, fill: primary },
        { kind: "rect", x: cx + 10, y: cy + 16, width: 6, height: 4, fill: primary },
      ];
    }
    case "service":
      return [{ kind: "rect", x: cx - 14, y: cy - 14, width: 28, height: 28, fill: "none", stroke: primary, strokeWidth: 1.5 }];
    case "data":
      // Cylinder: body rect + top/bottom ellipse hints.
      return [
        { kind: "rect", x: cx - 14, y: cy - 12, width: 28, height: 24, fill: "none", stroke: primary, strokeWidth: 1.5 },
        { kind: "circle", cx, cy: cy - 12, r: 7, fill: "none", stroke: primary, strokeWidth: 1.5 },
        { kind: "circle", cx, cy: cy + 12, r: 7, fill: "none", stroke: primary, strokeWidth: 1 },
      ];
    case "security":
      // Shield: outline + inner mark.
      return [
        { kind: "rect", x: cx - 13, y: cy - 15, width: 26, height: 30, fill: "none", stroke: primary, strokeWidth: 1.5 },
        { kind: "rect", x: cx - 6, y: cy - 6, width: 12, height: 12, fill: "none", stroke: primary, strokeWidth: 1 },
      ];
  }
}

/** Map a resource tier to its glyph kind. */
export function tierToGlyph(tier: string): GlyphKind {
  switch (tier) {
    case "ingress": return "gateway";
    case "compute": return "compute";
    case "load-balancer": return "service";
    case "data": return "data";
    case "auxiliary": return "security";
    default: return "service";
  }
}

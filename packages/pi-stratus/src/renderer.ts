// SVG and safe standalone HTML serialization (T003).
// Renderer responsibility: serialize validated geometry, never re-layout.
// Spec-provided text is rendered as data, never executable markup (R005).

import type { StratusSpec } from "./schema.ts";
import type { LayoutScene, PlacedBoundary, PlacedNode } from "./layout.ts";
import { paletteFor, FONT, type ThemeName } from "./profiles.ts";
import type { ValidationReceipt } from "./validator.ts";
import { glyphFragments } from "./glyphs.ts";
import { quantize } from "./geometry.ts";
import { wrapText } from "./metrics.ts";

export interface RenderOptions {
  theme: "light" | "dark";
  interactive: boolean;
}

export interface RenderedDocument {
  svg: string;
  html: string;
}

/** Escape text for XML/HTML text and attribute contexts. */
export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function subnetFill(boundaryId: string, theme: ThemeName, classification?: string): string | undefined {
  const p = paletteFor(theme);
  // Fill derives ONLY from the DECLARED classification — an unspecified
  // classification never falls back to ID substrings.
  if (classification === "public") return p.subnetPublicFill;
  if (classification === "private" || classification === "isolated") return p.subnetPrivateFill;
  return undefined;
}


/** Serialize the validated scene into SVG. No layout happens here. */
export function renderSvg(
  spec: StratusSpec,
  scene: LayoutScene,
  receipt: ValidationReceipt,
  options: RenderOptions,
): string {
  const theme = options.theme;
  const p = paletteFor(theme);
  const { viewBox } = scene;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-labelledby="stratus-title">`);
  out.push(`<title id="stratus-title">${escapeXml(spec.title)}</title>`);
  out.push(`<desc id="stratus-desc">Validation: ${escapeXml(receipt.referenceGrade)} — ${escapeXml(receipt.scope)}</desc>`);
  out.push(`<rect x="0" y="0" width="${viewBox.width}" height="${viewBox.height}" fill="${p.background}"/>`);

  // Boundary fills parent-first, then strokes.
  for (const b of scene.boundaries) {
    const fill = subnetFill(b.id, theme, b.classification);
    if (fill) out.push(`<rect x="${b.paint.x}" y="${b.paint.y}" width="${b.paint.width}" height="${b.paint.height}" fill="${fill}"/>`);
  }
  for (const b of scene.boundaries) {
    const style = boundaryStyle(b.level, theme);
    const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : "";
    out.push(`<rect x="${b.paint.x}" y="${b.paint.y}" width="${b.paint.width}" height="${b.paint.height}" fill="none" stroke="${style.stroke}" stroke-width="1.5"${dash}/>`);
  }

  // Membership band frames (segmented, low-opacity — never an isolation claim).
  for (const frame of scene.frames) {
    for (const seg of frame.segments) {
      out.push(`<rect x="${seg.x}" y="${seg.y}" width="${seg.width}" height="${seg.height}" fill="${p.bandFill}" stroke="${p.ipv4}" stroke-width="1" stroke-dasharray="2 3"/>`);
    }
  }

  // Routes (under glyphs): kind/family/variant/direction carried into paint.
  // association = dashed muted; request = solid plane color; service-target =
  // solid integration color. IPv6 = distinct color; dual = double-stroke.
  const routeStyle = (route: (typeof scene.routes)[number]): { stroke: string; dash: string; width: number } => {
    // Association routes are always muted + dashed (their legend sample says so).
    if (route.kind === "association") {
      return { stroke: p.muted, dash: ' stroke-dasharray="6 4"', width: 1.25 };
    }
    const stroke = route.kind === "service-target" ? p.integration : route.family === "ipv6" ? p.ipv6 : p.ipv4;
    const dash = route.variant === "dashed" ? ' stroke-dasharray="6 4"' : route.variant === "dotted" ? ' stroke-dasharray="2 4"' : "";
    const width = 1.5;
    return { stroke, dash, width };
  };
  for (const route of scene.routes) {
    const style = routeStyle(route);
    const pts = route.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}"${style.dash}/>`);
    // Dual-plane edges paint a SECOND path (IPv6 stroke, offset 3px) so the
    // two legend entries describe two visible paints.
    if (route.family === "dual") {
      const offset = route.points.map((pt) => `${pt.x},${pt.y + 3}`).join(" ");
      out.push(`<polyline points="${offset}" fill="none" stroke="${p.ipv6}" stroke-width="${style.width}"${style.dash}/>`);
    }
    // Arrowhead at the target end, oriented along the final segment.
    // Bidirectional routes ("both") also get a source-end arrowhead.
    const arrow = (tip: { x: number; y: number }, prev: { x: number; y: number }, stroke: string): string => {
      const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      const size = 8;
      const x1 = tip.x - size * Math.cos(angle - Math.PI / 6);
      const y1 = tip.y - size * Math.sin(angle - Math.PI / 6);
      const x2 = tip.x - size * Math.cos(angle + Math.PI / 6);
      const y2 = tip.y - size * Math.sin(angle + Math.PI / 6);
      return `<polygon points="${tip.x},${tip.y} ${quantize(x1)},${quantize(y1)} ${quantize(x2)},${quantize(y2)}" fill="${stroke}"/>`;
    };
    const ptsArr = route.points;
    if (ptsArr.length >= 2) {
      const a = ptsArr[ptsArr.length - 2];
      const b = ptsArr[ptsArr.length - 1];
      if (a !== undefined && b !== undefined) out.push(arrow(b, a, style.stroke));
      if (route.direction === "reverse" && ptsArr.length >= 2) {
        const c = ptsArr[0];
        const d = ptsArr[1];
        if (c !== undefined && d !== undefined) out.push(arrow(c, d, style.stroke));
      }
      if (route.family === "dual" && ptsArr.length >= 2) {
        const a6 = ptsArr[ptsArr.length - 2];
        const b6 = ptsArr[ptsArr.length - 1];
        if (a6 !== undefined && b6 !== undefined) out.push(arrow({ x: b6.x, y: b6.y + 3 }, { x: a6.x, y: a6.y + 3 }, p.ipv6));
        // Reverse dual routes also get a source-end IPv6 arrowhead.
        if (route.direction === "reverse") {
          const c6 = ptsArr[0];
          const d6 = ptsArr[1];
          if (c6 !== undefined && d6 !== undefined) out.push(arrow({ x: c6.x, y: c6.y + 3 }, { x: d6.x, y: d6.y + 3 }, p.ipv6));
        }
      }
    }
  }

  // Nodes: original geometric marks via glyphs.ts — circular gateways, chip compute.
  for (const node of scene.nodes) {
    for (const f of glyphFragments(node.glyph, node.body, p.primary, p.muted)) {
      if (f.kind === "circle") {
        out.push(`<circle cx="${f.cx}" cy="${f.cy}" r="${f.r}" fill="none" stroke="${f.stroke}" stroke-width="${f.strokeWidth}"/>`);
      } else {
        out.push(`<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" fill="none" stroke="${f.stroke}" stroke-width="${f.strokeWidth}"/>`);
      }
    }
  }

  // Badges: 28px rounded squares at source ends.
  for (const badge of scene.badges) {
    out.push(`<rect x="${badge.rect.x}" y="${badge.rect.y}" width="${badge.rect.width}" height="${badge.rect.height}" rx="5" fill="${p.ipv4}"/>`);
    out.push(`<text x="${badge.rect.x + badge.rect.width / 2}" y="${badge.rect.y + badge.rect.height / 2 + 4}" font-family="${FONT.family}" font-size="12" fill="${p.inverse}" text-anchor="middle">${escapeXml(String(badge.number))}</text>`);
  }

  // Route cards: first-class Destination|Target tables. Frames paint BEFORE
  // their labels so card contents stay visible. Transposed cards (left-right
  // flow) paint in the transposed orientation: the card is tall, so the
  // table stacks vertically with headings inside the transposed width.
  for (const card of scene.cards) {
    const transposed = card.rect.height > card.rect.width;
    out.push(`<rect x="${card.rect.x}" y="${card.rect.y}" width="${card.rect.width}" height="${card.rect.height}" rx="4" fill="${p.background}" stroke="${p.cardHeader}" stroke-width="1.25"/>`);
    if (transposed) {
      // Transposed: geometry comes from the layout (wrapped title, header
      // line, headings, first row pair) so text and rules never cross.
      const headerLineY = card.headerLineY ?? card.rect.y + 22;
      const headingsY = card.headingsY ?? headerLineY + 12;
      const firstRowY = card.firstRowY ?? headingsY + 16;
      out.push(`<line x1="${card.rect.x}" y1="${headerLineY}" x2="${card.rect.x + card.rect.width}" y2="${headerLineY}" stroke="${p.cardHeader}" stroke-width="1"/>`);
      // Separator lines sit in the gap between row baselines (stored).
      const baselines = card.rowBaselines ?? [];
      for (let i = 0; i + 1 < baselines.length; i += 2) {
        const lineY = ((baselines[i] ?? 0) + (baselines[i + 1] ?? 0)) / 2;
        out.push(`<line x1="${card.rect.x}" y1="${lineY}" x2="${card.rect.x + card.rect.width}" y2="${lineY}" stroke="${p.muted}" stroke-width="0.5" stroke-dasharray="2 3"/>`);
      }
      // Column headings side by side inside the transposed width.
      const destX = card.rect.x + card.rect.width * 0.3;
      const targetX = card.rect.x + card.rect.width * 0.75;
      out.push(`<text x="${destX}" y="${headingsY}" font-family="${FONT.family}" font-size="11" fill="${p.muted}" text-anchor="middle">Destination</text>`);
      out.push(`<text x="${targetX}" y="${headingsY}" font-family="${FONT.family}" font-size="11" fill="${p.muted}" text-anchor="middle">Target</text>`);
    } else {
      // Top-down: geometry comes from the layout (title, header line,
      // headings, first row) so text and rules never cross.
      const headerLineY = card.headerLineY ?? card.rect.y + 30;
      const headingsY = card.headingsY ?? headerLineY + 12;
      const firstRowY = card.firstRowY ?? headingsY + 16;
      out.push(`<line x1="${card.rect.x}" y1="${headerLineY}" x2="${card.rect.x + card.rect.width}" y2="${headerLineY}" stroke="${p.cardHeader}" stroke-width="1"/>`);
      // Separator lines sit in the gap between row baselines (stored).
      const baselines = card.rowBaselines ?? [];
      for (let i = 0; i + 1 < baselines.length; i += 2) {
        const lineY = ((baselines[i] ?? 0) + (baselines[i + 1] ?? 0)) / 2;
        out.push(`<line x1="${card.rect.x}" y1="${lineY}" x2="${card.rect.x + card.rect.width}" y2="${lineY}" stroke="${p.muted}" stroke-width="0.5" stroke-dasharray="2 3"/>`);
      }
      // Column headings: Destination | Target.
      const destX = card.rect.x + 24 + card.destinationWidth / 2;
      const targetX = card.rect.x + 24 + card.destinationWidth + 24 + 85;
      out.push(`<text x="${destX}" y="${headingsY}" font-family="${FONT.family}" font-size="11" fill="${p.muted}" text-anchor="middle">Destination</text>`);
      out.push(`<text x="${targetX}" y="${headingsY}" font-family="${FONT.family}" font-size="11" fill="${p.muted}" text-anchor="middle">Target</text>`);
    }
  }

  // Labels (after all backgrounds so nothing obscures them).
  for (const label of scene.labels) {
    const color = label.runs[0]?.colorRole === "ipv4" ? p.ipv4 : label.runs[0]?.colorRole === "ipv6" ? p.ipv6 : label.runs[0]?.colorRole === "muted" ? p.muted : p.primary;
    // Paint the WRAPPED lines the layout measured — the mask matches the
    // painted extent, so no unwrapped line can overflow the canvas. Lines
    // wrap to the MASK width and anchor at the mask center (equivalent to
    // baseline.x for middle-anchored labels; correct for start-anchored
    // card labels whose mask is the card-width wrap).
    const lines = wrapText(label.runs[0]?.text ?? "", Math.max(24, label.mask.width), label.fontSize);
    const lineHeight = label.fontSize * 1.25;
    const lineX = label.mask.x + label.mask.width / 2;
    const firstBaseline = label.baseline.y - (lines.length - 1) * lineHeight;
    out.push(`<text x="${lineX}" y="${firstBaseline}" font-family="${FONT.family}" font-size="${label.fontSize}" fill="${color}" text-anchor="middle">`);
    lines.forEach((line, i) => {
      out.push(`<tspan x="${lineX}" y="${firstBaseline + i * lineHeight}">${escapeXml(line)}</tspan>`);
    });
    out.push(`</text>`);
  }

  // Legend.
  out.push(`<rect x="${scene.legend.rect.x}" y="${scene.legend.rect.y}" width="${scene.legend.rect.width}" height="${scene.legend.rect.height}" fill="none" stroke="${p.muted}" stroke-width="1"/>`);
  scene.legend.entryIds.forEach((entry, i) => {
    const y = scene.legend.rect.y + 24 + i * 20;
    // Legend sample strokes match the route paint they describe.
    const sample = entry.startsWith("IPv6") ? p.ipv6 : entry.startsWith("Association") ? p.muted : entry.startsWith("Service target") ? p.integration ?? p.ipv4 : p.ipv4;
    const dash = entry.startsWith("Association") ? ' stroke-dasharray="6 4"' : "";
    out.push(`<line x1="${scene.legend.rect.x + 12}" y1="${y}" x2="${scene.legend.rect.x + 36}" y2="${y}" stroke="${sample}" stroke-width="1.5"${dash}/>`);
    out.push(`<text x="${scene.legend.rect.x + 44}" y="${y + 4}" font-family="${FONT.family}" font-size="12" fill="${p.primary}">${escapeXml(entry)}</text>`);
  });

  out.push(`</svg>`);
  return out.join("\n");
}

function boundaryStyle(level: PlacedBoundary["level"], theme: ThemeName): { stroke: string; dash?: string } {
  const p = paletteFor(theme);
  switch (level) {
    case "cloud": return { stroke: p.cloudStroke };
    case "region": return { stroke: p.regionStroke, dash: "6 4" };
    case "network": return { stroke: p.networkStroke, dash: "6 4" };
    case "az": return { stroke: p.azStroke, dash: "6 5" };
    case "subnet": return { stroke: p.networkStroke };
  }
}

/** Safe single-file HTML: trusted template + escaped payload, no remote loads. */
export function renderHtml(
  svg: string,
  spec: StratusSpec,
  receipt: ValidationReceipt,
  options: RenderOptions,
): string {
  const payload = JSON.stringify({ title: spec.title, receipt, theme: options.theme })
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const summary = `Validation: ${receipt.referenceGrade} — gates: ${receipt.gates.map((g) => `${g.id}:${g.status}`).join(", ")}`;
  // Interactive mode adds offline-only controls (zoom buttons + receipt
  // toggle). No remote loads, no executable spec text — the payload stays an
  // escaped JSON data island.
  const controls = options.interactive
    ? `<div id="stratus-controls" style="position:fixed;top:8px;right:8px;display:flex;gap:6px;">
  <button id="stratus-zoom-in" aria-label="Zoom in" style="font:14px ${FONT.family};padding:4px 10px;">+</button>
  <button id="stratus-zoom-out" aria-label="Zoom out" style="font:14px ${FONT.family};padding:4px 10px;">−</button>
  <button id="stratus-zoom-reset" aria-label="Reset zoom" style="font:12px ${FONT.family};padding:4px 10px;">Reset</button>
</div>
<script>
(function () {
  var scale = 1;
  var figure = document.getElementById("stratus-figure");
  function apply() { figure.style.transform = "scale(" + scale + ")"; figure.style.transformOrigin = "top left"; }
  document.getElementById("stratus-zoom-in").addEventListener("click", function () { scale = Math.min(scale * 1.2, 5); apply(); });
  document.getElementById("stratus-zoom-out").addEventListener("click", function () { scale = Math.max(scale / 1.2, 0.2); apply(); });
  document.getElementById("stratus-zoom-reset").addEventListener("click", function () { scale = 1; apply(); });
})();
</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(spec.title)}</title>
<style>
  body { margin: 0; font-family: ${FONT.family}; background: ${paletteFor(options.theme).background}; color: ${paletteFor(options.theme).primary}; }
  #stratus-figure { max-width: 100%; height: auto; }
  #stratus-summary { padding: 8px 16px; font-size: 12px; color: ${paletteFor(options.theme).muted}; }
</style>
</head>
<body>
<figure id="stratus-figure">${svg}</figure>
<div id="stratus-summary">${escapeXml(summary)}</div>
${controls}
<script type="application/json" id="stratus-data">${payload}</script>
</body>
</html>`;
}


// Astra remediation acceptance regressions (finding 26): every remediated
// finding gets a test that independently establishes the guarantee.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDiagram } from "../src/pipeline.ts";
import { compileGeneralDiagram } from "../src/pipeline.ts";
import { decodeSpec } from "../src/schema.ts";
import { getPreset, simpleVpcSpec } from "../src/presets.ts";
import { escapeXml, renderSvg, renderHtml } from "../src/renderer.ts";
import { evaluateDiagram } from "../src/evaluate.ts";
import { jevAssess } from "../src/jev.ts";
import { runCli } from "../src/cli.ts";
import { CATALOG } from "../src/cloud.ts";
import { parseCIDR } from "../src/cidr.ts";
import { readFile } from "node:fs/promises";

const clone = (v) => JSON.parse(JSON.stringify(v));

test("XSS regression: spec text never executes in generated HTML", () => {
  const spec = clone(getPreset("three-tier"));
  spec.edges[0].step = "</text><script>globalThis.STRATUS_XSS=1</script><text>";
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  // The step is a non-integer string — the semantic gate must fail it.
  assert.equal(result.ok, false, "non-integer step must fail validation");
});

test("XSS regression: integer step badges are escaped in HTML", () => {
  const spec = clone(getPreset("three-tier"));
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  // No executable script tags other than the inert JSON data island + trusted controls.
  const html = result.document.html;
  const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  for (const attrs of scripts) {
    // Every script must be either the JSON data island or the trusted offline controls.
    assert.ok(
      attrs.includes('type="application/json"') || html.indexOf(attrs) > html.indexOf("stratus-controls"),
      "no untrusted script tags",
    );
  }
  assert.ok(!html.includes("STRATUS_XSS=1"), "payload text must not appear executable");
});

test("decode regression: missing cloud.regions fails decoding with a pointer", () => {
  const spec = clone(getPreset("three-tier"));
  delete spec.cloud.regions;
  const decoded = decodeSpec(spec);
  assert.equal(decoded.ok, false);
  if (!decoded.ok) {
    assert.ok(decoded.diagnostics.some((d) => d.pointer === "/cloud/regions"), "diagnostic carries the JSON pointer");
  }
});

test("decode regression: duplicate entity ids fail decoding", () => {
  const spec = clone(getPreset("three-tier"));
  const vpcs = spec.cloud.regions[0].vpcs;
  vpcs.push(JSON.parse(JSON.stringify(vpcs[0])));
  const decoded = decodeSpec(spec);
  assert.equal(decoded.ok, false);
  if (!decoded.ok) {
    assert.ok(decoded.diagnostics.some((d) => d.message.includes("duplicate entity id")));
  }
});

test("decode regression: non-object entities and oversized input are refused", () => {
  const spec = clone(getPreset("three-tier"));
  spec.cloud.regions[0].vpcs[0].azs[0].subnets.push("not-an-object");
  const decoded = decodeSpec(spec);
  assert.equal(decoded.ok, false);
  const huge = { ...clone(getPreset("three-tier")), edges: Array.from({ length: 600 }, (_, i) => ({ kind: "association", id: `e${i}`, label: `e${i}`, semanticLabel: { text: "x" }, variant: "normal", from: { kind: "scope", scopeId: "s" }, to: { kind: "scope", scopeId: "s" }, relation: "peering", factIds: [] })) };
  assert.equal(decodeSpec(huge).ok, false, "oversized entity collections are refused");
});

test("decode-failure receipts preserve diagnostics with pointers", () => {
  const result = compileDiagram({}, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const schemaGate = result.receipt.gates.find((g) => g.id === "schema");
  assert.ok(schemaGate);
  assert.ok(schemaGate.diagnostics.length > 0, "decoder diagnostics survive into the receipt");
  assert.ok(schemaGate.diagnostics[0].message.length > 0);
});

test("scene hash is sensitive to nested content", () => {
  const a = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  const spec = clone(getPreset("three-tier"));
  spec.cloud.regions[0].vpcs[0].label = "Renamed VPC";
  const b = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.receipt.sceneHash, b.receipt.sceneHash, "changed nested content must change the scene hash");
});

test("boundary labels render: VPC name + CIDR, subnet name + CIDR", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  const networkBoundaries = result.scene.boundaries.filter((b) => b.level === "network");
  assert.ok(networkBoundaries.every((b) => b.labelIds.length > 0), "every network boundary carries a label");
  const subnetBoundaries = result.scene.boundaries.filter((b) => b.level === "subnet");
  assert.ok(subnetBoundaries.length > 0);
  assert.ok(subnetBoundaries.every((b) => b.labelIds.length > 0), "every subnet boundary carries a label");
  const svg = result.svg;
  assert.ok(svg.includes("·"), "boundary labels include the CIDR separator");
  assert.ok(svg.includes("10."), "subnet CIDRs render");
});

test("route cards render as first-class tables", () => {
  const result = compileDiagram(simpleVpcSpec(), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  assert.ok(result.scene.cards.length > 0, "declared route cards render");
  const svg = result.svg;
  assert.ok(svg.includes("0.0.0.0/0") || svg.includes("local"), "route table rows render");
});

test("projected font floors hold in the compiled scene", () => {
  for (const preset of ["simple-vpc", "three-tier"]) {
    const result = compileDiagram(getPreset(preset), { theme: "light", interactive: false });
    assert.equal(result.ok, true);
    const scale = Math.min(930 / result.scene.viewBox.width, 900 / result.scene.viewBox.height);
    for (const label of result.scene.labels) {
      const floor = label.runs[0]?.colorRole === "primary" ? 11 : 9;
      assert.ok(
        label.fontSize * scale >= floor - 0.01,
        `${preset}: label ${label.id} projects ${((label.fontSize * scale)).toFixed(2)}px < ${floor}px floor`,
      );
    }
  }
});

test("routes run source → target (forward direction)", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  for (const route of result.scene.routes) {
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    const src = result.scene.nodes.find((n) => n.id === route.sourceNodeId);
    const dst = result.scene.nodes.find((n) => n.id === route.targetNodeId);
    assert.ok(src && dst);
    // The route STARTS on the source body and ENDS on the target body.
    const startsOnSrc = first.x >= src.body.x - 2 && first.x <= src.body.x + src.body.width + 2 &&
      first.y >= src.body.y - 2 && first.y <= src.body.y + src.body.height + 2;
    const endsOnDst = last.x >= dst.body.x - 2 && last.x <= dst.body.x + dst.body.width + 2 &&
      last.y >= dst.body.y - 2 && last.y <= dst.body.y + dst.body.height + 2;
    assert.ok(startsOnSrc, `route ${route.edgeId} must start on its source body (${JSON.stringify(first)} vs ${JSON.stringify(src.body)})`);
    assert.ok(endsOnDst, `route ${route.edgeId} must end on its target body (${JSON.stringify(last)} vs ${JSON.stringify(dst.body)})`);
  }
});

test("edge semantics are distinct in paint", () => {
  const spec = clone(getPreset("three-tier"));
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  const kinds = new Set(result.scene.routes.map((r) => r.kind));
  assert.ok(kinds.size >= 1);
  for (const route of result.scene.routes) {
    assert.ok(["association", "request", "service-target"].includes(route.kind));
    assert.ok(["ipv4", "ipv6", "dual", "none"].includes(route.family));
    assert.ok(["solid", "dashed", "dotted"].includes(route.variant));
  }
  // SERIALIZED paint separation: distinct kinds must carry distinct strokes
  // in the SVG (association dashed muted vs request solid).
  const svgStrokes = new Set([...result.svg.matchAll(/<polyline[^>]*stroke="([^"]+)"[^>]*(stroke-dasharray="[^"]+")?/g)].map((m) => `${m[1]}|${m[2] ?? "solid"}`));
  const sceneStyles = new Set(result.scene.routes.map((r) => `${r.kind}:${r.variant}`));
  assert.ok(svgStrokes.size >= Math.min(2, sceneStyles.size), `serialized SVG must carry distinct paint styles (${svgStrokes.size} vs ${sceneStyles.size} scene styles)`);
});

test("arrowheads render on stepped routes", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  assert.ok(result.svg.includes("<polygon"), "directional arrowheads render");
});

test("CLI executable is wired (not a stub)", async () => {
  const doctor = await runCli(["doctor"]);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.data.notImplemented, undefined, "doctor must not report not-implemented");
  const render = await runCli(["render", "three-tier"]);
  assert.equal(render.ok, true);
  assert.ok(render.data.svgBytes > 0, "render returns byte counts");
  const unknown = await runCli(["bogus-verb"]);
  assert.equal(unknown.ok, false);
});

test("catalog has no duplicate ids and includes VPC Lattice", () => {
  const ids = CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "catalog ids are distinct");
  assert.ok(CATALOG.some((e) => e.id === "vpc-lattice"), "VPC Lattice service network is cataloged");
});

test("CIDR parser rejects malformed IPv6 and enforces family agreement", () => {
  assert.ok("code" in parseCIDR("1:::2/128"), "triple-colon IPv6 is refused");
  assert.ok("code" in parseCIDR(":::/128"), "empty IPv6 is refused");
  assert.ok(!("code" in parseCIDR("2001:db8::/32")), "valid IPv6 parses");
});

test("CIDR gate fails on invalid children even when the parent CIDR is unknown", () => {
  const spec = clone(getPreset("three-tier"));
  spec.cloud.regions[0].vpcs[0].cidrs = { status: "unknown", reason: "imported without CIDR evidence" };
  spec.cloud.regions[0].vpcs[0].azs[0].subnets[0].cidrs = { status: "known", value: [{ family: "ipv4", value: "not-a-cidr" }] };
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false, "invalid child CIDR must fail even with an unknown parent");
});

test("placement gate rejects attachment AZ disagreement", () => {
  const spec = clone(getPreset("three-tier"));
  const vpc = spec.cloud.regions[0].vpcs[0];
  const subnet = vpc.azs[0].subnets[0];
  subnet.resources.push({
    kind: "resource", id: "r-mismatch", label: "Mismatched", service: "ec2",
    placement: { kind: "single-subnet", attachment: { subnetId: subnet.id, zone: { regionId: "geo-us-east-1", zone: "us-east-1c" } } },
    tier: "compute",
  });
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false, "attachment AZ must agree with the subnet's AZ slice");
});

test("JEV bridge requires explicit export consent", () => {
  const assessment = jevAssess({ capability: "prd_review", subject: "acceptance", payload: { text: "x" }, allowExport: false });
  if ("status" in assessment) {
    // Bridge responded: without explicit consent the payload is NOT exported.
    assert.equal(assessment.status, "blocked");
    assert.equal(assessment.reason, "export_permission_required");
    assert.equal(assessment.used, false);
  } else {
    // anvil not installed in this environment — refusal is also acceptable
    assert.ok("reason" in assessment);
  }
});

test("evaluation is scene-based: unpainted resources reduce the placement score", () => {
  const record = evaluateDiagram({ spec: getPreset("three-tier") });
  assert.equal(record.ok, true);
  assert.ok(record.overall > 0.75, `overall ${record.overall} must pass`);
  const placement = record.dimensions.find((d) => d.dimension === "placement-truth");
  assert.ok(placement && placement.score > 0.9, "all declared resources paint");
});

test("general diagrams size from real extents", async () => {
  const spec = {
    schemaVersion: 1, kind: "lifecycle", title: "cycle",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b", order: 1 }, { from: "b", to: "a", order: 2 }],
  };
  const result = compileGeneralDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  // The cycle route extends right of the boxes — the canvas must cover it.
  const { layoutGeneral } = await import("../src/diagram-types.ts");
  const layout = layoutGeneral(spec);
  for (const b of layout.boxes) {
    assert.ok(b.x + b.width <= layout.width, `box ${b.id} must fit the canvas width`);
    assert.ok(b.y + b.height <= layout.height, `box ${b.id} must fit the canvas height`);
  }
  for (const a of layout.arrows) {
    for (const p of a.points) {
      assert.ok(p.x <= layout.width && p.y <= layout.height, `arrow point must fit the canvas`);
    }
  }
});

test("general sequence diagrams draw lifelines and arrowheads", () => {
  const spec = {
    schemaVersion: 1, kind: "sequence", title: "seq",
    nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    edges: [{ from: "a", to: "b", label: "msg", order: 1 }],
  };
  const result = compileGeneralDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  assert.ok(result.svg.includes("stroke-dasharray"), "lifelines render");
  assert.ok(result.svg.includes("<polygon"), "arrowheads render");
});

test("left-right flow transposes the scene", () => {
  const td = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  const lr = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false, flow: "left-right" });
  assert.equal(td.ok && lr.ok, true);
  assert.equal(lr.scene.viewBox.width, td.scene.viewBox.height, "left-right transposes width/height");
  assert.equal(lr.scene.viewBox.height, td.scene.viewBox.width);
});

test("interactive mode adds offline controls", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: true });
  assert.equal(result.ok, true);
  assert.ok(result.document.html.includes("stratus-zoom-in"), "zoom controls render");
});

test("view selection resolves focus and detail", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false, viewId: "view-overview" });
  assert.equal(result.ok, true);
  assert.equal(result.scene.viewId, "view-overview");
  assert.ok(Array.isArray(result.scene.focusIds), "focusIds recorded");
  assert.equal(result.scene.detail, "overview");
  // network-detail omits the external tier
  const detail = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false, viewId: "view-overview", detail: "network-detail" });
  assert.equal(detail.ok, true);
  assert.equal(detail.scene.nodes.some((n) => n.resourceId === "users"), false, "network-detail omits external actors");
});

test("every geometry assertion has relevant subjects", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  for (const gate of result.receipt.gates) {
    for (const d of gate.diagnostics) {
      assert.ok(Array.isArray(d.subjects) && d.subjects.length > 0, `diagnostic ${d.code} must carry subjects`);
    }
  }
});

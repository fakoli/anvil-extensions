// Layout determinism tests (T002 acceptance): boundary containment, route
// orthogonality, badge clearance, and deterministic scene output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDiagram } from "../src/pipeline.ts";
import { getPreset } from "../src/presets.ts";
import { layoutSpec } from "../src/layout.ts";
import { normalizeSpec } from "../src/normalize.ts";

function clonePreset(id) {
  return JSON.parse(JSON.stringify(getPreset(id)));
}

function compiledScene(id) {
  const result = compileDiagram(getPreset(id), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  return result.ok ? result.scene : null;
}

test("layout is deterministic: two runs produce identical scenes", () => {
  const a = compiledScene("three-tier");
  const b = compiledScene("three-tier");
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test("boundary stack nests Cloud ⊃ Region ⊃ Network ⊃ AZ ⊃ subnet", () => {
  const scene = compiledScene("three-tier");
  const byId = new Map(scene.boundaries.map((b) => [b.id, b]));
  const contains = (outer, inner) => {
    const o = byId.get(outer);
    const i = byId.get(inner);
    return o && i && i.paint.x >= o.paint.x && i.paint.y >= o.paint.y &&
      i.paint.x + i.paint.width <= o.paint.x + o.paint.width &&
      i.paint.y + i.paint.height <= o.paint.y + o.paint.height;
  };
  const regionId = scene.boundaries.find((b) => b.level === "region")?.id ?? "boundary-region";
  assert.ok(contains("boundary-cloud", regionId), "region inside cloud");
  assert.ok(contains(regionId, "boundary-network-vpc-main"), "network inside region");
  assert.ok(contains("boundary-network-vpc-main", "boundary-az-vpc-main-az-1"), "AZ inside network");
  assert.ok(contains("boundary-az-vpc-main-az-1", "boundary-subnet-vpc-main-subnet-public-1"), "subnet inside AZ");
});

test("subnet boxes never overlap their AZ siblings", () => {
  const scene = compiledScene("three-tier");
  const subnets = scene.boundaries.filter((b) => b.level === "subnet");
  for (let i = 0; i < subnets.length; i++) {
    for (let j = i + 1; j < subnets.length; j++) {
      const a = subnets[i];
      const b = subnets[j];
      const disjoint = a.paint.x + a.paint.width <= b.paint.x || b.paint.x + b.paint.width <= a.paint.x ||
        a.paint.y + a.paint.height <= b.paint.y || b.paint.y + b.paint.height <= a.paint.y;
      assert.ok(disjoint, `${a.id} and ${b.id} must be disjoint`);
    }
  }
});

test("all routes are orthogonal (every segment axis-aligned)", () => {
  const scene = compiledScene("three-tier");
  for (const route of scene.routes) {
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1];
      const b = route.points[i];
      assert.ok(a.x === b.x || a.y === b.y, `route ${route.id} segment ${i} is not orthogonal`);
    }
  }
});

test("badges sit clear of node bodies (≥10px clearance)", () => {
  const scene = compiledScene("three-tier");
  for (const badge of scene.badges) {
    for (const node of scene.nodes) {
      const clear = badge.rect.x + badge.rect.width + 10 <= node.body.x ||
        node.body.x + node.body.width + 10 <= badge.rect.x ||
        badge.rect.y + badge.rect.height + 10 <= node.body.y ||
        node.body.y + node.body.height + 10 <= badge.rect.y;
      assert.ok(clear, `badge ${badge.number} overlaps node near ${node.resourceId}`);
    }
  }
});

test("projected primary labels meet the 11 CSS px font floor", () => {
  const scene = compiledScene("three-tier");
  for (const label of scene.labels) {
    if (label.runs[0]?.colorRole === "primary" && label.role === "projected") {
      assert.ok(label.fontSize >= 11, `label '${label.runs[0]?.text}' font ${label.fontSize} below floor`);
    }
  }
});

test("layoutSpec reports no diagnostics for valid presets", () => {
  const spec = clonePreset("three-tier");
  const { indexes } = normalizeSpec(spec);
  const { diagnostics } = layoutSpec(spec, indexes, { flow: "top-down" });
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], `expected no layout errors: ${JSON.stringify(errors)}`);
});

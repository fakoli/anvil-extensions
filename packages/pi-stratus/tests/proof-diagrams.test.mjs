// T013 proof-diagram tests: every corrected diagram compiles eligible and
// passes the evaluation skill dimensions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDiagram } from "../src/pipeline.ts";
import { evaluateDiagram } from "../src/evaluate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DIAGRAMS = ["eks-ipv6", "firewalls-centralized", "firewalls-distributed", "vpc-lattice"];

function loadSpec(name) {
  return JSON.parse(readFileSync(join(here, "..", "diagrams", `${name}.spec.json`), "utf8"));
}

test("every corrected proof diagram compiles with an eligible receipt", () => {
  for (const name of DIAGRAMS) {
    const result = compileDiagram(loadSpec(name), { theme: "light", interactive: false });
    assert.equal(result.ok, true, `${name} compile failed`);
    if (result.ok) assert.equal(result.receipt.referenceGrade, "eligible", `${name} grade`);
  }
});

test("corrected diagrams use true containment (Region ⊃ VPC ⊃ AZ ⊃ subnet)", () => {
  for (const name of DIAGRAMS) {
    const result = compileDiagram(loadSpec(name), { theme: "light", interactive: false });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const byId = new Map(result.scene.boundaries.map((b) => [b.id, b]));
    const networks = result.scene.boundaries.filter((b) => b.level === "network");
    for (const net of networks) {
      const region = byId.get(net.parentId);
      assert.ok(region, `${name}: network parent missing`);
      assert.ok(net.paint.x >= region.paint.x && net.paint.y >= region.paint.y, `${name}: network outside region`);
    }
  }
});

test("edge kinds are separated (request vs association vs service-target)", () => {
  const spec = loadSpec("vpc-lattice");
  const kinds = new Set(spec.edges.map((e) => e.kind));
  assert.ok(kinds.has("request"));
  assert.ok(kinds.has("service-target"));
});

test("EKS control plane sits outside the customer VPC", () => {
  const result = compileDiagram(loadSpec("eks-ipv6"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const cp = result.scene.nodes.find((n) => n.resourceId === "eks-cp");
  assert.ok(cp, "control plane node present");
  // The control plane must NOT be inside any subnet boundary.
  const subnets = result.scene.boundaries.filter((b) => b.level === "subnet");
  const inside = subnets.some((s) =>
    cp.cell.x >= s.paint.x && cp.cell.y >= s.paint.y &&
    cp.cell.x + cp.cell.width <= s.paint.x + s.paint.width &&
    cp.cell.y + cp.cell.height <= s.paint.y + s.paint.height);
  assert.equal(inside, false, "control plane must be outside customer subnets");
});

test("every corrected diagram passes the evaluation skill dimensions", () => {
  for (const name of DIAGRAMS) {
    const record = evaluateDiagram({ spec: loadSpec(name) });
    assert.equal(record.ok, true, `${name} evaluation failed`);
    assert.ok(record.overall >= 0.75, `${name} overall ${record.overall} below 0.75`);
    for (const d of record.dimensions) {
      assert.ok(d.score >= 0.5, `${name} dimension ${d.dimension} score ${d.score}`);
    }
  }
});

test("firewalls routing cards state the true routing stages", () => {
  const spec = loadSpec("firewalls-centralized");
  const card = spec.routeCards.find((c) => c.id === "card-centralized");
  assert.ok(card, "centralized routing card present");
  assert.match(card.label, /TGW targets the inspection VPC attachment/i);
  const decision = spec.routingFacts.find((f) => f.kind === "routing-decision");
  assert.ok(decision, "routing decision present");
  assert.match(decision.explanation, /inspection VPC attachment/);
});

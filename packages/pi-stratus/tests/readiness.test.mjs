// Readiness fixtures (Astra review 382308de next steps 2/3): two VPCs paint
// as separate network boundaries; regional resources resolve; unknown CIDRs
// are reported explicitly, never silently verified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDiagram } from "../src/pipeline.ts";
import { getPreset } from "../src/presets.ts";
import { normalizeSpec } from "../src/normalize.ts";

function clonePreset(id) {
  return JSON.parse(JSON.stringify(getPreset(id)));
}

test("two VPCs paint as two separate network boundaries", () => {
  const spec = clonePreset("simple-vpc");
  const vpc2 = JSON.parse(JSON.stringify(spec.cloud.regions[0].vpcs[0]));
  vpc2.id = "vpc-second";
  vpc2.label = "Second VPC";
  // The cloned IGW needs its own id — duplicate ids are a semantic error.
  if (Array.isArray(vpc2.resources) && vpc2.resources.length > 0) vpc2.resources[0].id = "igw-second";
  // Single AZ + single subnet keeps the two-VPC canvas inside the projection budget.
  vpc2.azs = [vpc2.azs[0]];
  vpc2.azs[0].id = "az-s1";
  vpc2.azs[0].subnets = [vpc2.azs[0].subnets[0]];
  vpc2.azs[0].subnets[0].id = "subnet-second-private";
  vpc2.azs[0].subnets[0].cidrs.value = [{ family: "ipv4", value: "10.1.1.0/24" }];
  vpc2.cidrs.value = [{ family: "ipv4", value: "10.1.0.0/16" }];
  spec.cloud.regions[0].vpcs.push(vpc2);
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  if (result.ok) {
    const networks = result.scene.boundaries.filter((b) => b.level === "network");
    assert.equal(networks.length, 2, `expected 2 network boundaries, got ${networks.length}`);
    // The two network boxes must be disjoint (side by side or stacked).
    const [a, b] = networks;
    const disjoint = a.paint.x + a.paint.width <= b.paint.x || b.paint.x + b.paint.width <= a.paint.x ||
      a.paint.y + a.paint.height <= b.paint.y || b.paint.y + b.paint.height <= a.paint.y;
    assert.ok(disjoint, "network boundaries must not overlap");
  }
});

test("regional resources are indexed and laid out in the region-scoped row", () => {
  const spec = clonePreset("simple-vpc");
  spec.cloud.regions[0].resources.push({
    kind: "resource", id: "lambda-reg", label: "Regional Lambda", service: "aws.lambda",
    placement: { kind: "region" }, tier: "auxiliary",
  });
  const { indexes } = normalizeSpec(spec);
  assert.ok(indexes.byId.has("lambda-reg"), "regional resource missing from byId index");
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  if (result.ok) {
    const lambdaNode = result.scene.nodes.find((n) => n.resourceId === "lambda-reg");
    assert.ok(lambdaNode, "regional resource not laid out");
  }
});

test("unknown VPC CIDRs produce CIDR_UNVERIFIED, never a silent pass", () => {
  const spec = clonePreset("simple-vpc");
  spec.cloud.regions[0].vpcs[0].cidrs = { status: "unknown", reason: "not declared in source" };
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true, "unknown CIDRs are a warning, not a block");
  const cidrGate = result.ok ? result.receipt.gates.find((g) => g.id === "cidr") : null;
  assert.ok(cidrGate, "cidr gate present");
  const codes = cidrGate.diagnostics.map((d) => d.code);
  assert.ok(codes.includes("CIDR_UNVERIFIED"), `expected CIDR_UNVERIFIED in ${JSON.stringify(codes)}`);
});

test("multi-subnet resources paint linked instances inside attached subnets", () => {
  const result = compileDiagram(getPreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(result.ok, true);
  if (result.ok) {
    // ALB has two attachments → two instances, one per public subnet.
    const albInstances = result.scene.nodes.filter((n) => n.resourceId === "alb-main");
    assert.equal(albInstances.length, 2, `expected 2 ALB instances, got ${albInstances.length}`);
    // Membership band links them.
    const band = result.scene.frames.find((f) => f.id === "frame-alb-main");
    assert.ok(band, "membership band for ALB missing");
    assert.equal(band.memberInstanceIds.length, 2);
    // Instances sit inside their subnet boundaries.
    const subnets = result.scene.boundaries.filter((b) => b.level === "subnet");
    for (const inst of albInstances) {
      const inside = subnets.some((s) =>
        inst.cell.x >= s.paint.x && inst.cell.y >= s.paint.y &&
        inst.cell.x + inst.cell.width <= s.paint.x + s.paint.width &&
        inst.cell.y + inst.cell.height <= s.paint.y + s.paint.height);
      assert.ok(inside, `ALB instance not inside any subnet`);
    }
  }
});

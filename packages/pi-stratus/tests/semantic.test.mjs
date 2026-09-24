// Semantic gate tests (T001/T004 acceptance): invalid fixtures must produce
// typed diagnostics with codes, subjects, and supported fixes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDiagram } from "../src/pipeline.ts";
import { getPreset } from "../src/presets.ts";
import { validateSemantic } from "../src/validator.ts";

function clonePreset(id) {
  return JSON.parse(JSON.stringify(getPreset(id)));
}

test("duplicate resource ids produce ID_DUPLICATE diagnostics", () => {
  const spec = clonePreset("three-tier");
  spec.cloud.regions[0].vpcs[0].resources.push({ ...spec.cloud.regions[0].vpcs[0].resources[0] });
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const codes = result.receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("ID_DUPLICATE"), `expected ID_DUPLICATE in ${JSON.stringify(codes)}`);
});

test("overlapping subnet CIDRs produce CIDR_OVERLAP diagnostics", () => {
  const spec = clonePreset("three-tier");
  const az = spec.cloud.regions[0].vpcs[0].azs[0];
  az.subnets[1].cidrs.value = [{ family: "ipv4", value: "10.0.1.0/24" }]; // same as subnet 0
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const codes = result.receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("CIDR_OVERLAP"), `expected CIDR_OVERLAP in ${JSON.stringify(codes)}`);
});

test("edges referencing unknown attachments produce REFERENCE_MISSING", () => {
  const spec = clonePreset("three-tier");
  spec.edges[0].to.attachmentId = "att-does-not-exist";
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const codes = result.receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("REFERENCE_MISSING"), `expected REFERENCE_MISSING in ${JSON.stringify(codes)}`);
});

test("NAT gateway in a private subnet produces PLACEMENT_INVALID", () => {
  const spec = clonePreset("three-tier");
  const nat = spec.cloud.regions[0].vpcs[0].resources.find((r) => r.id === "nat-1");
  nat.placement.attachment.subnetId = "subnet-private-1";
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const codes = result.receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("PLACEMENT_INVALID"), `expected PLACEMENT_INVALID in ${JSON.stringify(codes)}`);
});

test("route tables referencing unknown subnets produce REFERENCE_MISSING", () => {
  const spec = clonePreset("simple-vpc");
  spec.routingFacts[0].appliesTo.push({ kind: "subnet", subnetId: "subnet-ghost" });
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const codes = result.receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("REFERENCE_MISSING"), `expected REFERENCE_MISSING in ${JSON.stringify(codes)}`);
});

test("diagnostics carry subjects, evidence, and supported fixes", () => {
  const spec = clonePreset("three-tier");
  spec.edges[0].to.attachmentId = "att-ghost";
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  const diag = result.receipt.gates.flatMap((g) => g.diagnostics).find((d) => d.code === "REFERENCE_MISSING");
  assert.ok(diag);
  assert.ok(Array.isArray(diag.subjects) && diag.subjects.length > 0);
  assert.ok(diag.evidence && typeof diag.evidence.rule === "string");
  assert.ok(Array.isArray(diag.supportedFixes));
});

test("receipt is deterministic: same spec hashes to the same scene hash", () => {
  const spec = clonePreset("three-tier");
  const a = compileDiagram(spec, { theme: "light", interactive: false });
  const b = compileDiagram(clonePreset("three-tier"), { theme: "light", interactive: false });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.ok && b.ok ? a.receipt.sceneHash : "", b.ok ? b.receipt.sceneHash : "x");
});

test("blocked grade is reported when geometry gates fail", () => {
  const spec = clonePreset("three-tier");
  // Force an unresolvable edge to a ghost attachment — semantic failure blocks.
  spec.edges[0].to.attachmentId = "att-ghost";
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, false);
  assert.equal(result.receipt.referenceGrade, "blocked");
});

test("validateSemantic directly reports hasErrors for invalid specs", () => {
  const spec = clonePreset("three-tier");
  spec.cloud.regions[0].vpcs[0].resources.push({ ...spec.cloud.regions[0].vpcs[0].resources[0] });
  const semantic = validateSemantic(spec);
  assert.equal(semantic.hasErrors, true);
});

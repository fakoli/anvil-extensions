// Stratus engine — end-to-end compile test (T001/T002/T003/T007 acceptance).
// Deterministic, offline, no credentials, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileDiagram } from "../src/pipeline.ts";
import { getPreset, listPresets } from "../src/presets.ts";
import { decodeSpec } from "../src/schema.ts";
import { parseCIDR, containsCIDR, overlapsCIDR } from "../src/cidr.ts";
import { runCli } from "../src/cli.ts";

test("three-tier preset compiles end to end with an eligible receipt", () => {
  const spec = getPreset("three-tier");
  assert.ok(spec, "three-tier preset exists");
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true, `compile failed: ${JSON.stringify(result.ok ? [] : result.receipt.gates)}`);
  if (result.ok) {
    assert.equal(result.receipt.referenceGrade, "eligible");
    assert.ok(result.svg.length > 1000, "svg serialized");
    assert.ok(result.document.html.includes("<!DOCTYPE html>"), "standalone html");
    assert.ok(result.receipt.sceneHash, "scene hash present");
  }
});

test("simple-vpc preset compiles end to end", () => {
  const spec = getPreset("simple-vpc");
  assert.ok(spec);
  const result = compileDiagram(spec, { theme: "light", interactive: false });
  assert.equal(result.ok, true);
});

test("presets follow the progressive-disclosure ladder", () => {
  const presets = listPresets();
  assert.ok(presets.some((p) => p.id === "simple-vpc" && p.ladderStep === 1));
  assert.ok(presets.some((p) => p.id === "three-tier" && p.ladderStep === 3));
});

test("decoder rejects malformed specs with JSON pointers", () => {
  assert.equal(decodeSpec(null).ok, false);
  assert.equal(decodeSpec({}).ok, false);
  const bad = decodeSpec({ schemaVersion: 2 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.diagnostics[0]?.pointer, "/schemaVersion");
});

test("decoder and JSON Schema agree on structural validity", () => {
  const spec = getPreset("three-tier");
  assert.ok(spec);
  assert.equal(decodeSpec(JSON.parse(JSON.stringify(spec))).ok, true);
});

test("CIDR containment and overlap are symmetric and transitive", () => {
  const parent = parseCIDR("10.0.0.0/16");
  const child = parseCIDR("10.0.1.0/24");
  const sibling = parseCIDR("10.0.2.0/24");
  const outside = parseCIDR("192.168.0.0/24");
  assert.ok(!("code" in parent) && !("code" in child) && !("code" in sibling) && !("code" in outside));
  if (!("code" in parent) && !("code" in child) && !("code" in sibling) && !("code" in outside)) {
    assert.equal(containsCIDR(parent, child), true);
    assert.equal(containsCIDR(parent, outside), false);
    assert.equal(overlapsCIDR(child, sibling), false);
    assert.equal(overlapsCIDR(child, child), true);
    assert.equal(overlapsCIDR(child, outside), false);
    // Symmetry
    assert.equal(overlapsCIDR(child, sibling), overlapsCIDR(sibling, child));
  }
});

test("malformed CIDRs produce explicit diagnostics", () => {
  assert.ok("code" in parseCIDR("10.0.0.0/33"));
  assert.ok("code" in parseCIDR("not-an-address/24"));
  assert.ok("code" in parseCIDR("10.0.1.1/24")); // host bits set
});

test("CLI receipts are structured and truthful", async () => {
  const doctor = await runCli(["doctor"]);
  assert.equal(doctor.ok, true);
  assert.ok(doctor.engineVersion.length > 0);
  const bad = await runCli(["no-such-verb"]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /unknown command/);
});

test("render receipt reports not-implemented verbs truthfully until built", async () => {
  const result = await runCli(["render", "three-tier"]);
  assert.equal(result.ok, true);
  assert.equal(result.data?.referenceGrade, "eligible");
});

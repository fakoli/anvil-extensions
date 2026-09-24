// General-purpose diagram type tests (T014 acceptance).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGeneral, renderGeneral, validateGeneral, GENERAL_KINDS } from "../src/diagram-types.ts";

const workflow = {
  schemaVersion: 1,
  kind: "workflow",
  title: "Deploy workflow",
  nodes: [
    { id: "plan", label: "Plan" },
    { id: "review", label: "Review" },
    { id: "apply", label: "Apply" },
    { id: "verify", label: "Verify" },
  ],
  edges: [
    { id: "e1", from: "plan", to: "review" },
    { id: "e2", from: "review", to: "apply" },
    { id: "e3", from: "apply", to: "verify" },
  ],
};

test("all four kinds decode, validate eligible, and render standalone HTML", () => {
  for (const kind of GENERAL_KINDS) {
    const spec = { ...workflow, kind, title: `${kind} test` };
    const decoded = decodeGeneral(spec);
    assert.equal(decoded.ok, true, `${kind} decodes`);
    if (!decoded.ok) continue;
    const rendered = renderGeneral(decoded.spec);
    assert.equal(rendered.receipt.referenceGrade, "eligible", `${kind} eligible`);
    assert.ok(rendered.html.includes("<!DOCTYPE html>"), `${kind} standalone html`);
    assert.ok(rendered.svg.length > 500, `${kind} svg serialized`);
  }
});

test("sequence orders messages by the order field", () => {
  const spec = {
    schemaVersion: 1,
    kind: "sequence",
    title: "Handshake",
    nodes: [{ id: "a", label: "Client" }, { id: "b", label: "Server" }],
    edges: [
      { id: "m2", from: "b", to: "a", label: "response", order: 2 },
      { id: "m1", from: "a", to: "b", label: "syn", order: 1 },
    ],
  };
  const decoded = decodeGeneral(spec);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const rendered = renderGeneral(decoded.spec);
  // syn must appear before response in the SVG (ordered by y).
  const synAt = rendered.svg.indexOf("syn");
  const respAt = rendered.svg.indexOf("response");
  assert.ok(synAt > 0 && respAt > 0 && synAt < respAt, "messages ordered by order field");
});

test("duplicates and dangling references produce typed diagnostics", () => {
  const bad = {
    schemaVersion: 1,
    kind: "workflow",
    title: "bad",
    nodes: [{ id: "x", label: "X" }, { id: "x", label: "X2" }],
    edges: [{ id: "e", from: "x", to: "ghost" }],
  };
  const { diagnostics } = validateGeneral(bad);
  const codes = diagnostics.map((d) => d.code);
  assert.ok(codes.includes("ID_DUPLICATE"));
  assert.ok(codes.includes("REFERENCE_MISSING"));
});

test("decoder rejects malformed specs with pointers", () => {
  assert.equal(decodeGeneral(null).ok, false);
  const bad = decodeGeneral({ schemaVersion: 2, kind: "workflow", title: "x", nodes: [{ id: "a", label: "A" }] });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.diagnostics.some((d) => d.subjects.includes("/schemaVersion")));
});

test("layout is deterministic for the same spec", () => {
  const decoded = decodeGeneral(workflow);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const a = renderGeneral(decoded.spec);
  const b = renderGeneral(decoded.spec);
  assert.equal(a.svg, b.svg);
});

test("lifecycle self-loops warn but do not block", () => {
  const spec = {
    schemaVersion: 1,
    kind: "lifecycle",
    title: "State machine",
    nodes: [{ id: "running", label: "Running" }],
    edges: [{ id: "t1", from: "running", to: "running", label: "tick" }],
  };
  const { receipt } = validateGeneral(spec);
  const codes = receipt.gates.flatMap((g) => g.diagnostics.map((d) => d.code));
  assert.ok(codes.includes("TRANSITION_SELF_LOOP"));
  assert.equal(receipt.referenceGrade, "eligible");
});

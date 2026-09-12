// pi-insights — logic tests. Plain node + jiti (no bun dependency on this host).
// Run: node tests/run-tests.mjs
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? (() => {
    // pi-coding-agent is a root devDependency; its ESM "." export resolves,
    // and the bundle dir (with nested jiti/pi-tui/typebox) sits above it.
    let dir = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
    while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
    return dir;
  })();

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  ({ createJiti } = await import(`${PI_INSTALL_DIR}/node_modules/jiti/lib/jiti.mjs`));
}
import { pathToFileURL } from "node:url";

import { fileURLToPath } from "node:url";

const base = fileURLToPath(new URL("../index.ts", import.meta.url));
const jiti = createJiti(base, { interopDefault: true, fsCache: false });

const { classifyBash, validationKey } = await jiti.import("../src/signals.ts");
const { newLedger, recordPending, recordMilestone, recordValidationOutcome, applyIdleReset, resetPending } = await jiti.import("../src/state.ts");
const { renderLines, renderExpanded } = await jiti.import("../src/render.ts");
const { fromCheckpoint, toCheckpoint, CHECKPOINT_TYPE } = await jiti.import("../src/persistence.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

// --- validationKey ---------------------------------------------------------

test("validationKey ignores cd prefixes and takes the last meaningful segment", () => {
  assert.equal(validationKey("cd /tmp/x && pytest -q tests/"), "pytest tests/");
  assert.equal(validationKey("pytest"), "pytest");
  assert.equal(validationKey("cd /a && cd /b && npm run test"), "npm run test");
});

test("validationKey strips flags and keeps script names distinct", () => {
  assert.equal(validationKey("npm run test --silent"), "npm run test");
  assert.equal(validationKey("npm run lint"), "npm run lint");
  assert.notEqual(validationKey("npm run test"), validationKey("npm run lint"));
});

// --- classification --------------------------------------------------------

test("bash classification maps categories and plans", () => {
  const c = classifyBash('git commit -m "Fix the widget bug"');
  assert.equal(c.category, "git_mutate");
  assert.equal(c.plan.kind, "commit_created");
  assert.equal(c.plan.key, "commit:fix-the-widget-bug");
  const p = classifyBash("gh pr merge 15 --squash");
  assert.equal(p.category, "pr");
  assert.equal(p.plan.kind, "pr_merged");
  const i = classifyBash("ansible-playbook site.yml --check");
  assert.equal(i.category, "ansible");
  assert.equal(i.plan, null); // check mode is inspection
  const g = classifyBash("ls -la");
  assert.equal(g.category, "generic");
});

// --- milestone semantics ---------------------------------------------------

test("commit milestones increment count instead of deduplicating", () => {
  const l = newLedger();
  recordMilestone(l, "commit_created", "commit:a", 1);
  recordMilestone(l, "commit_created", "commit:a", 2);
  assert.equal(l.milestones.find((m) => m.kind === "commit_created").count, 2);
});

test("validation failure -> pass on the same key notes 'after failure'", () => {
  const l = newLedger();
  recordValidationOutcome(l, "validation:pytest", false, 1);
  recordMilestone(l, "validation_failed", "fail:validation:pytest", 1);
  recordValidationOutcome(l, "validation:pytest", true, 2);
  const r = recordMilestone(l, "validation_passed", "validation:pytest", 2);
  assert.equal(r.added, true);
  assert.equal(r.note, "after failure");
});

test("unrelated validation success does not clear a failure", () => {
  const l = newLedger();
  recordValidationOutcome(l, "validation:pytest", false, 1);
  recordValidationOutcome(l, "validation:lint", true, 2);
  const r = recordMilestone(l, "validation_passed", "validation:lint", 2);
  assert.equal(r.note, undefined);
});

test("non-commit milestone dedupes by kind+key", () => {
  const l = newLedger();
  const a = recordMilestone(l, "pr_merged", "pr_merge:gh pr merge 15", 1);
  const b = recordMilestone(l, "pr_merged", "pr_merge:gh pr merge 15", 2);
  assert.equal(a.added, true);
  assert.equal(b.added, false);
});

// --- pending window / idle -------------------------------------------------

test("points accumulate by weight; idle reset clears pending, keeps totals", () => {
  const l = newLedger();
  recordPending(l, { category: "generic", commandKey: "x", milestonePlan: null }, false, 1);
  recordPending(l, { category: "edit", commandKey: null, milestonePlan: null }, false, 2);
  recordPending(l, null, true, 3); // error counts 1
  assert.equal(l.pending.points, 1 + 2 + 1);
  assert.equal(l.totals.tools, 3);
  assert.equal(l.totals.errors, 1);
  applyIdleReset(l, 3 + 16 * 60_000);
  assert.equal(l.pending.points, 0);
  assert.equal(l.totals.tools, 3);
  resetPending(l);
});

// --- persistence -----------------------------------------------------------

test("checkpoint round-trips; malformed payloads rejected", () => {
  const l = newLedger();
  recordPending(l, { category: "edit", commandKey: null, milestonePlan: null }, false, 1);
  recordMilestone(l, "pr_opened", "pr_open:gh pr create 1", 1);
  const cp = toCheckpoint(l);
  const restored = fromCheckpoint(cp);
  assert.equal(restored.totals.tools, l.totals.tools);
  assert.equal(restored.milestones[0].kind, "pr_opened");
  assert.equal(fromCheckpoint({ version: 2 }), null);
  assert.equal(fromCheckpoint({ version: 1, totals: {} }), null);
  const bad = fromCheckpoint({ version: 1, totals: { tools: 1, edits: 0, errors: 0, turns: 0 }, milestones: [null, { nope: 1 }, { kind: "pr_opened", key: "k", at: 1, count: 1 }], validation: [{ key: "k", outcome: "weird", at: 1 }] });
  assert.equal(bad.milestones.length, 1);
  assert.equal(bad.validation.length, 0);
});

test("checkpoint type constant is namespaced", () => {
  assert.equal(CHECKPOINT_TYPE, "pi-insights.checkpoint");
});

// --- rendering -------------------------------------------------------------

test("renderLines prefers milestones, annotates activity, truncates", () => {
  const l = newLedger();
  assert.deepEqual(renderLines(l, 1), ["💡 ready"]);
  recordPending(l, { category: "edit", commandKey: null, milestonePlan: null }, false, 1);
  assert.match(renderLines(l, 1)[0], /🛠 1 edit/);
  recordMilestone(l, "validation_passed", "validation:pytest", 2, "after failure");
  const line = renderLines(l, 1)[0];
  assert.match(line, /🧪 validation passed \(after failure\)/);
  assert.match(line, /🛠 1 edit/); // single-line mode annotates activity
  assert.ok(line.length <= 100);
  const two = renderLines(l, 2);
  assert.equal(two.length, 2);
});

test("renderExpanded lists milestones and last validation", () => {
  const l = newLedger();
  recordMilestone(l, "pr_merged", "pr_merge:x", 1);
  recordValidationOutcome(l, "validation:pytest", true, 2);
  const lines = renderExpanded(l);
  assert.match(lines[0], /session:/);
  assert.ok(lines.some((s) => s.includes("PR merged")));
  assert.ok(lines.some((s) => s.includes("last validation: passed")));
});

const { installToolActivity } = await jiti.import("../src/tool-activity.ts");
test("tool wait status ages, tracks updates and parallel calls, and clears at boundaries", () => {
  const originals = [Date.now, globalThis.setInterval, globalThis.clearInterval];
  let now = 0, tick, enabled = true, unrefs = 0;
  Date.now = () => now;
  globalThis.setInterval = (fn) => { tick = fn; return { unref() { unrefs++; } }; };
  globalThis.clearInterval = () => { tick = undefined; };
  try {
    const handlers = new Map(), values = [];
    const ctx = { hasUI: true, mode: "tui", ui: { setStatus(key, value) { assert.equal(key, "pi-insights-tool"); values.push(value); } } };
    const clear = installToolActivity({ on(name, fn) { handlers.set(name, fn); } }, () => enabled);
    const emit = (name, event = {}, context = ctx) => handlers.get(name)(event, context);
    emit("tool_execution_start", { toolCallId: "one", toolName: "bash", args: { command: "private" } });
    assert.equal(unrefs, 1);
    now = 90000; tick();
    assert.equal(values.at(-1), "bash running 90s · no updates 90s");
    emit("tool_execution_update", { toolCallId: "one", partialResult: "private" });
    assert.match(values.at(-1), /no updates 0s$/);
    emit("tool_execution_start", { toolCallId: "two", toolName: "read" });
    assert.match(values.at(-1), /2 tools$/);
    emit("tool_execution_end", { toolCallId: "one" });
    assert.match(values.at(-1), /^read running/);
    emit("tool_execution_end", { toolCallId: "two", isError: true });
    assert.equal(values.at(-1), undefined); assert.equal(tick, undefined);
    for (const boundary of ["agent_end", "session_start", "session_shutdown"]) {
      emit("tool_execution_start", { toolCallId: "one", toolName: "bash" });
      emit(boundary); assert.equal(tick, undefined); assert.equal(values.at(-1), undefined);
    }
    emit("tool_execution_start", { toolCallId: "one", toolName: "bash" });
    clear(); assert.equal(tick, undefined);
    for (const mode of ["json", "print"]) {
      const count = values.length;
      emit("tool_execution_start", { toolCallId: "one", toolName: "bash" }, { ...ctx, mode });
      assert.equal(values.length, count); assert.equal(tick, undefined);
    }
    enabled = false;
    emit("tool_execution_start", { toolCallId: "one", toolName: "bash" });
    assert.equal(tick, undefined);
    enabled = true;
    emit("tool_execution_start", { toolCallId: "one", toolName: "\\x1b[2J".repeat(40) }, { ...ctx, mode: "rpc" });
    assert.ok(values.at(-1).length < 100); assert.ok(!values.at(-1).includes("\x1b"));
    enabled = false; tick(); assert.equal(tick, undefined);
    assert.ok(!JSON.stringify(values).includes("private"));
  } finally { [Date.now, globalThis.setInterval, globalThis.clearInterval] = originals; }
});

console.log(`\n${passed} tests passed`);
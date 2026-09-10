// pi-summerize — logic tests. Plain node + jiti (no bun dependency on this host).
// Run: node tests/run-tests.mjs
import assert from "node:assert/strict";
import { createJiti } from "/data/apps/devtools/node-24.20.0/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

const base = fileURLToPath(new URL("../index.ts", import.meta.url));
const PI_ROOT = "/data/apps/devtools/node-24.20.0/lib/node_modules/@earendil-works/pi-coding-agent";
const jiti = createJiti(base, {
  interopDefault: true,
  fsCache: false,
  // pi-ai/pi-tui ship inside the pi harness install; alias them for this test run.
  // The pi-ai alias points at dist/compat.js because node path-joins the aliased
  // specifier (dir + "/compat") without consulting the package exports map.
  alias: {
    "@earendil-works/pi-ai/compat": `${PI_ROOT}/node_modules/@earendil-works/pi-ai/dist/compat.js`,
    "@earendil-works/pi-ai": `${PI_ROOT}/node_modules/@earendil-works/pi-ai/dist/index.js`,
    "@earendil-works/pi-tui": `${PI_ROOT}/node_modules/@earendil-works/pi-tui`,
  },
});

const { readConfig, DEFAULTS_EXPORT } = await jiti.import("../src/config.ts");
const {
  collectTurns,
  countActivity,
  renderObservation,
  classifyEntry,
  EMPTY_COUNTS,
} = await jiti.import("../src/collect.ts");
const {
  sanitizeParagraph,
  isUsableParagraph,
  resolveModel,
  modelLabel,
  COMMENTARY_SYSTEM_PROMPT,
} = await jiti.import("../src/commentator.ts");
const { fallbackLine, WIDGET_KEY } = await jiti.import("../src/render.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function userMsg(text) {
  return { type: "message", message: { role: "user", content: [{ type: "text", text }] } };
}
function assistantMsg(text, toolCalls = []) {
  const content = [];
  if (text) content.push({ type: "text", text });
  for (const t of toolCalls) content.push({ type: "toolCall", name: t.name, result: t.result });
  return { type: "message", message: { role: "assistant", content } };
}

// --- config ----------------------------------------------------------------

const REAL_ENV = { ...process.env };
function withEnv(env, fn) {
  for (const k of Object.keys(env)) process.env[k] = env[k];
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
  }
}

test("readConfig defaults", () => {
  withEnv({ PI_SUMMERIZE_X: "ignore" }, () => {
    const c = readConfig();
    assert.equal(c.enabled, true);
    assert.equal(c.model, "default");
    assert.equal(c.minIntervalMs, DEFAULTS_EXPORT.minIntervalSeconds * 1000);
    assert.equal(c.maxTimeoutMs, DEFAULTS_EXPORT.maxTimeoutSeconds * 1000);
    assert.equal(c.maxInputChars, DEFAULTS_EXPORT.maxInputChars);
    assert.equal(c.maxOutputChars, DEFAULTS_EXPORT.maxOutputChars);
  });
});

test("readConfig parses and clamps", () => {
  withEnv(
    {
      PI_SUMMERIZE: "off",
      PI_SUMMERIZE_MODEL: "anvil/llm.secondary",
      PI_SUMMERIZE_MIN_INTERVAL_SECONDS: "-5",
      PI_SUMMERIZE_TIMEOUT_SECONDS: "99999",
      PI_SUMMERIZE_MAX_OUTPUT_CHARS: "50",
    },
    () => {
      const c = readConfig();
      assert.equal(c.enabled, false);
      assert.equal(c.model, "anvil/llm.secondary");
      assert.equal(c.minIntervalMs, 0);
      assert.equal(c.maxTimeoutMs, 600 * 1000);
      assert.equal(c.maxOutputChars, 100);
    }
  );
});

// --- collect ----------------------------------------------------------------

test("collectTurns keeps tail turns oldest-first and caps chars", () => {
  const branch = [];
  for (let i = 0; i < 20; i++) {
    branch.push(userMsg(`user message ${i} ` + "x".repeat(50)));
    branch.push(assistantMsg(`assistant reply ${i} ` + "y".repeat(50)));
  }
  const turns = collectTurns(branch, { maxTurns: 4, maxChars: 1000 });
  assert.ok(turns.length <= 4 && turns.length >= 2, `got ${turns.length} turns`);
  assert.equal(turns[0].role, "user");
  // tail content, not head
  assert.ok(turns[turns.length - 1].text.includes("19"), "should include the last turn");
  assert.ok(turns.every((t) => t.text.length <= 1200));
});

test("collectTurns skips non-message entries and leading text-less turns", () => {
  const branch = [
    { type: "custom", customType: "checkpoint", data: {} },
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] } },
    userMsg("hello"),
  ];
  const turns = collectTurns(branch, { maxTurns: 8, maxChars: 4000 });
  // leading tool-call-only assistant turn is dropped to center on substance;
  // its activity is still counted by countActivity.
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, "hello");
});

test("countActivity tallies tools, edits, failures", () => {
  const branch = [
    assistantMsg(null, [{ name: "bash" }, { name: "edit" }, { name: "edit" }, { name: "bash", result: { isError: true } }]),
    userMsg("ok"),
    assistantMsg("done", [{ name: "read" }]),
  ];
  const counts = countActivity(branch);
  assert.equal(counts.toolCalls, 5);
  assert.equal(counts.edits, 2);
  assert.equal(counts.failures, 1);
});

test("classifyEntry handles flat and wrapped message shapes", () => {
  const wrapped = classifyEntry({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "edit" }] } });
  const flat = classifyEntry({ role: "assistant", content: [{ type: "toolCall", name: "edit", isError: true }] });
  assert.equal(wrapped.edit, true);
  assert.equal(flat.failure, true);
});

test("renderObservation is bounded and names roles", () => {
  const obs = renderObservation(
    [{ role: "user", text: "fix the test" }, { role: "assistant", text: "fixed and validated" }],
    { toolCalls: 5, edits: 2, failures: 0 }
  );
  assert.ok(obs.includes("5 tool call(s)"));
  assert.ok(obs.includes("2 edit(s)"));
  assert.ok(obs.includes("USER: fix the test"));
  assert.ok(obs.includes("ASSISTANT: fixed and validated"));
  assert.ok(obs.length < 800);
});

// --- sanitize / usability ---------------------------------------------------

test("sanitizeParagraph collapses bullets, headings, and newlines", () => {
  const raw = "# Summary\n- Fixed the parser\n- Updated tests\n\n**Done.**";
  const out = sanitizeParagraph(raw, 700);
  assert.ok(!out.includes("#"));
  assert.ok(!out.includes("- "));
  assert.ok(!out.includes("\n"));
  assert.ok(out.includes("Fixed the parser"));
  assert.ok(out.includes("Done."));
});

test("sanitizeParagraph hard-caps at word boundary", () => {
  const out = sanitizeParagraph("word ".repeat(400), 100);
  assert.ok(out.length <= 103, `length ${out.length}`);
  assert.ok(out.endsWith("…"));
});

test("isUsableParagraph thresholds", () => {
  assert.equal(isUsableParagraph(""), false);
  assert.equal(isUsableParagraph("too short"), false);
  assert.equal(isUsableParagraph("This is a perfectly usable paragraph of commentary."), true);
});

test("system prompt forbids markdown and mandates one paragraph", () => {
  assert.ok(COMMENTARY_SYSTEM_PROMPT.includes("No markdown"));
  assert.ok(COMMENTARY_SYSTEM_PROMPT.includes("ONE short paragraph"));
});

// --- model resolution -------------------------------------------------------

test("resolveModel default returns ctx.model without warning", () => {
  const ctx = { model: { provider: "x", id: "m" }, modelRegistry: { find() { throw new Error("should not be called"); } } };
  const { model, warning } = resolveModel("default", ctx);
  assert.equal(model, ctx.model);
  assert.equal(warning, undefined);
});

test("resolveModel falls back with warning on unknown model", () => {
  const ctx = {
    model: { provider: "x", id: "m" },
    modelRegistry: { find() { return null; } },
    ui: { notify() {} },
  };
  const { model, warning } = resolveModel("anvil/llm.secondary", ctx);
  assert.equal(model, ctx.model);
  assert.ok(warning?.includes("not in registry"));
});

test("resolveModel rejects malformed spec with warning", () => {
  const ctx = { model: { provider: "x", id: "m" }, modelRegistry: { find() { return null; } }, ui: { notify() {} } };
  const { warning } = resolveModel("no-slash", ctx);
  assert.ok(warning?.includes("provider/model-id"));
});

// --- fallback rendering -----------------------------------------------------

test("fallbackLine summarizes counts and flags failures", () => {
  assert.equal(
    fallbackLine({ toolCalls: 3, edits: 0, failures: 0 }),
    "Since last commentary: 3 tool calls."
  );
  assert.equal(
    fallbackLine({ toolCalls: 1, edits: 1, failures: 1 }),
    "Since last commentary: 1 tool call, 1 edit, 1 failing call — some calls failed; the agent may retry."
  );
  assert.equal(fallbackLine(EMPTY_COUNTS), "Since last commentary: no activity.");
});

test("WIDGET_KEY is namespaced", () => {
  assert.ok(WIDGET_KEY.startsWith("pi-"));
});

console.log(`\n${passed} tests passed`);
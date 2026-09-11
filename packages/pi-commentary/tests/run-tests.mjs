// pi-commentary — logic tests. Plain node + jiti (no bun dependency on this host).
// Run: node tests/run-tests.mjs
// jiti resolves from the repo's own node_modules, falling back to the pi
// harness install (PI_INSTALL_DIR). No absolute author paths are required.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? "/data/apps/devtools/node-24.20.0/lib/node_modules/@earendil-works/pi-coding-agent";

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  ({ createJiti } = await import(`${PI_INSTALL_DIR}/node_modules/jiti/lib/jiti.mjs`));
}

const base = fileURLToPath(new URL("../index.ts", import.meta.url));
const stubState = { calls: [], text: undefined, defer: null, stopReason: undefined, throwInResult: null };
globalThis.__commentaryStub = stubState;

// ONE jiti instance for the whole suite: the model stream is stubbed for all
// tests (unit tests only exercise pure functions; wiring tests drive the
// entry). jiti's module registry is process-global, so a second instance with
// different aliases would NOT re-resolve already-loaded modules.
const jiti = createJiti(base, {
  interopDefault: true,
  fsCache: false,
  alias: {
    // stubbed model stream — no network in tests
    "@earendil-works/pi-ai/compat": new URL("./stubs/pi-ai-compat-stub.mjs", import.meta.url).pathname,
    "@earendil-works/pi-tui": `${PI_INSTALL_DIR}/node_modules/@earendil-works/pi-tui`,
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
  COMMENTARY_INSTRUCTIONS,
} = await jiti.import("../src/commentator.ts");
const { fallbackLine, banner, plainBanner, WIDGET_KEY } = await jiti.import("../src/render.ts");

let passed = 0;
function test(name, fn) {
  // await async bodies so failures propagate in order — a fire-and-forget
  // test() turned races (e.g. the G1 flake) into late unhandled rejections
  const out = fn();
  const done = () => {
    passed += 1;
    console.log(`  ok ${name}`);
  };
  if (out && typeof out.then === "function") return out.then(done);
  done();
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
  const saved = new Map(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const k of Object.keys(env)) process.env[k] = env[k];
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("readConfig defaults", () => {
  withEnv({ PI_COMMENTARY_X: "ignore" }, () => {
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
      PI_COMMENTARY: "off",
      PI_COMMENTARY_MODEL: "anvil/llm.secondary",
      PI_COMMENTARY_MIN_INTERVAL_SECONDS: "-5",
      PI_COMMENTARY_TIMEOUT_SECONDS: "99999",
      PI_COMMENTARY_MAX_OUTPUT_CHARS: "50",
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

test("instructions: Claude-Code-style tips, quiet signal, no markdown", () => {
  assert.ok(COMMENTARY_INSTRUCTIONS.includes("No markdown"));
  assert.ok(COMMENTARY_INSTRUCTIONS.includes("ONE short tip"));
  assert.ok(COMMENTARY_INSTRUCTIONS.includes("NOT apparent"), "tips must target what is not apparent");
  assert.ok(COMMENTARY_INSTRUCTIONS.includes("Never narrate"), "tips must not restate the transcript");
  assert.ok(COMMENTARY_INSTRUCTIONS.includes("exactly: NOTHING"), "quiet signal must be part of the contract");
});

test("isQuietSignal matches the NOTHING marker case-insensitively", async () => {
  const { isQuietSignal } = await jiti.import("../src/commentator.ts");
  assert.equal(isQuietSignal("NOTHING"), true);
  assert.equal(isQuietSignal("  nothing "), true);
  assert.equal(isQuietSignal("Nothing worth surfacing."), false);
  assert.equal(isQuietSignal(""), false);
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

test("banner separates commentary with accent label and dim rule", () => {
  const theme = { fg: (color, s) => `[${color}]${s}` };
  const b = banner(theme);
  assert.ok(b.startsWith("[accent]◆ tips "), `banner label must be accent: ${b}`);
  assert.ok(b.includes("[dim]─"), `rule must be dim: ${b}`);
  assert.ok(!b.includes("[default]"), `no unthemed segments: ${b}`);
  const plain = plainBanner();
  assert.ok(plain.startsWith("◆ tips ") && !plain.includes("["), `RPC banner is plain text: ${plain}`);
  const visible = (s) => s.replace(/\[[a-z]+\]/g, "");
  assert.equal(visible(b).length, plain.length, "TUI and RPC banners must align (same visible width)");
});

test("WIDGET_KEY is namespaced", () => {
  assert.ok(WIDGET_KEY.startsWith("pi-"));
});

console.log(`\n${passed} tests passed`);
test("sanitizeParagraph preserves inline-code identifiers with underscores", () => {
  const out = sanitizeParagraph("Updated `foo_bar_baz.ts` and the **bold** claim.", 700);
  assert.ok(out.includes("foo_bar_baz.ts"), out);
  assert.ok(out.includes("bold"), out);
  assert.ok(!out.includes("`"), out);
  assert.ok(!out.includes("**"), out);
});

test("sanitizeParagraph strips word-boundary underscores but keeps intraword ones", () => {
  const out = sanitizeParagraph("the _goal_ is foo_bar_baz", 700);
  assert.ok(out.includes("the goal is foo_bar_baz"), out);
});

// ===========================================================================
// Wiring tests — extension entry with stubbed model stream, fake pi/ctx.
// These exist because helper-only tests let a completely broken generation
// path pass (astra review finding 1).
// ===========================================================================

// index.ts calls readConfig() at import time — set wiring env first.
const SETTINGS_USER = join(tmpdir(), `pi-commentary-user-${process.pid}.json`);
process.env.PI_COMMENTARY = "on";
process.env.PI_COMMENTARY_MIN_INTERVAL_SECONDS = "0";
// settings-dialog tests must never touch the REAL user settings file
process.env.PI_COMMENTARY_USER_SETTINGS = SETTINGS_USER;
const entryModule = await jiti.import("../index.ts");

function makeBranch() {
  return [
    userMsg("fix the failing serialization test"),
    { type: "message", message: { role: "assistant", content: [
      { type: "text", text: "Found the timezone bug and fixed it." },
      { type: "toolCall", name: "edit" },
    ] } },
    { type: "message", message: { role: "toolResult", isError: false, toolCallId: "t1", content: [{ type: "text", text: "ok" }] } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Validated with the suite." }, { type: "toolCall", name: "bash" }] } },
    { type: "message", message: { role: "toolResult", isError: true, toolCallId: "t2", content: [{ type: "text", text: "exit 1" }] } },
  ];
}

function makeCtx(branchHolder, overrides = {}) {
  const ctx = {
    hasUI: true,
    mode: "tui",
    model: { provider: "test", id: "m1", name: "test/m1" },
    modelRegistry: {
      find: (p, m) => ({ provider: p, id: m, name: `${p}/${m}` }),
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k", headers: {} }),
      getProviderAuth: async () => null,
    },
    sessionManager: { getBranch: () => branchHolder.branch },
    ui: {
      widgets: {},
      notifications: [],
      setWidget(key, content, opts) { if (content === undefined) delete this.widgets[key]; else this.widgets[key] = { content, opts }; },
      notify(msg, level) { this.notifications.push({ msg, level }); },
    },
  };
  Object.assign(ctx, overrides);
  return ctx;
}

function makePi() {
  const handlers = {};
  const commands = {};
  return {
    handlers,
    commands,
    on(name, fn) { handlers[name] = fn; },
    registerCommand(name, def) { commands[name] = def; },
  };
}

async function waitFor(predicate, ms = 500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return predicate();
}

async function wiringTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

await wiringTest("wiring: NOTHING tip clears the widget instead of showing filler", async () => {
  stubState.calls = []; stubState.defer = null; stubState.text = "NOTHING";
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  assert.ok(await waitFor(() => stubState.calls.length === 1), "episode must consult the model");
  await waitFor(() => true, 40);
  assert.deepEqual(Object.keys(ctx.ui.widgets), [], "NOTHING must suppress the widget entirely");
  await pi.handlers["session_shutdown"]({}, ctx);
});

await wiringTest("wiring: settled after a turn launches model call and sets TUI widget (blocker regression)", async () => {
  stubState.calls = []; stubState.defer = null; stubState.throwInResult = null; stubState.text = undefined;
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const ok = await waitFor(() => stubState.calls.length === 1 && !!ctx.ui.widgets["pi-commentary"]);
  assert.ok(ok, "expected one model call and a widget");
  assert.ok(typeof ctx.ui.widgets["pi-commentary"].content === "function", "TUI widget uses component factory");
  // observation reflects the real toolResult-entry failure shape
  const sent = stubState.calls[0].options.messages[0].content[0].text;
  assert.ok(sent.includes("2 tool call(s)"), `sent: ${sent.slice(0, 120)}`);
  assert.ok(sent.includes("1 failing call(s)"), "failure counted from toolResult entry");
  assert.ok(sent.includes("COMMENT") === false);
  assert.ok(sent.includes("terse commentator") || sent.includes("tips widget"), "instructions ride in the user message");
});

await wiringTest("wiring: print/JSON mode is fully silent (no stream, no widget, no notify)", async () => {
  stubState.calls = [];
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder, { hasUI: false, mode: "print" });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(stubState.calls.length, 0);
  assert.deepEqual(Object.keys(ctx.ui.widgets), []);
  assert.deepEqual(ctx.ui.notifications, []);
});

await wiringTest("wiring: RPC receives plain string lines, not a factory", async () => {
  stubState.calls = []; stubState.text = "RPC paragraph about the fix.";
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder, { mode: "rpc" });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const ok = await waitFor(() => !!ctx.ui.widgets["pi-commentary"]);
  assert.ok(ok);
  const content = ctx.ui.widgets["pi-commentary"].content;
  assert.ok(Array.isArray(content) && content.every((l) => typeof l === "string"), "RPC widget must be string[]");
  assert.ok(content.join(" ").includes("RPC paragraph"));
});

await wiringTest("wiring: cursor gate — no NEW activity means no second commentary", async () => {
  stubState.calls = [];
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await waitFor(() => stubState.calls.length === 1);
  // settle again with unchanged branch: cursor consumed, should skip
  await pi.handlers["agent_settled"]({}, ctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(stubState.calls.length, 1, "no NEW activity -> no second call");
  // new activity arrives: gate opens, counts are delta-only
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const ok = await waitFor(() => stubState.calls.length === 2);
  assert.ok(ok);
  const sent = stubState.calls[1].options.messages[0].content[0].text;
  assert.ok(sent.includes("1 tool call(s)"), `delta counts, not lifetime: ${sent.slice(0, 100)}`);
  assert.ok(!sent.includes("3 tool call(s)"), "old activity not double-counted");
});

await wiringTest("wiring: off-while-pending aborts and on re-arms (no generation wedge)", async () => {
  stubState.calls = [];
  let releaseDefer;
  stubState.defer = new Promise((r) => { releaseDefer = r; });
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await waitFor(() => stubState.calls.length === 1);
  await pi.commands["commentary"].handler("off", ctx); // aborts the pending request
  releaseDefer();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(ctx.ui.widgets, {}, "off clears the widget");
  // re-arm: on + new turn + settle must launch again
  await pi.commands["commentary"].handler("on", ctx);
  stubState.defer = null;
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const ok = await waitFor(() => stubState.calls.length === 2);
  assert.ok(ok, "post off/on the extension still generates");
});

await wiringTest("wiring: activity during pending call drops the stale paragraph", async () => {
  stubState.calls = []; stubState.text = "stale paragraph";
  let releaseDefer;
  stubState.defer = new Promise((r) => { releaseDefer = r; });
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await waitFor(() => stubState.calls.length === 1);
  // new turn lands while the call is pending
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "write" }] } });
  await pi.handlers["turn_end"]({}, ctx);
  releaseDefer();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(Object.keys(ctx.ui.widgets), [], "stale result must not be rendered");
});

await wiringTest("wiring: model outage falls back once, not per failure", async () => {
  stubState.calls = [];
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder, {
    modelRegistry: {
      find: () => null,
      getApiKeyAndHeaders: async () => ({ ok: false, error: "no credentials" }),
      getProviderAuth: async () => null,
    },
  });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const first = await waitFor(() => !!ctx.ui.widgets["pi-commentary"]);
  assert.ok(first, "fallback widget shown");
  assert.ok(ctx.ui.notifications.some((n) => n.msg.includes("commentary unavailable")), "one degradation notice");
  const noticeCount = ctx.ui.notifications.filter((n) => n.msg.includes("commentary unavailable")).length;
  // second episode: fallback again, but no repeated notice
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await new Promise((r) => setTimeout(r, 30));
  const noticeCountAfter = ctx.ui.notifications.filter((n) => n.msg.includes("commentary unavailable")).length;
  assert.equal(noticeCount, 1);
  assert.equal(noticeCountAfter, 1, "no repeat notice while degraded");
});

await wiringTest("wiring: commands stay silent in print mode and do not announce skipped launches", async () => {
  stubState.calls = [];
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder, { hasUI: false, mode: "print" });
  await pi.commands["commentary"].handler("on", ctx);
  await pi.commands["commentary"].handler("off", ctx);
  await pi.commands["commentary"].handler("status", ctx);
  await pi.commands["commentary"].handler("", ctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(ctx.ui.notifications, [], "no notify in silent mode");
  assert.equal(stubState.calls.length, 0, "no model call in silent mode");
});

await wiringTest("wiring: forced /commentary in TUI announces only when actually launched", async () => {
  stubState.calls = []; stubState.defer = new Promise(() => {}); // keep request pending
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: [] };
  const ctx = makeCtx(holder);
  await pi.commands["commentary"].handler("now", ctx);
  const ok = await waitFor(() => stubState.calls.length === 1);
  assert.ok(ok, "/commentary now force-launches even on empty activity");
  assert.ok(ctx.ui.notifications.some((n) => n.msg.includes("composing")), "announced because it launched");
  // busy: second force must NOT announce
  ctx.ui.notifications.length = 0;
  await pi.commands["commentary"].handler("now", ctx);
  assert.equal(stubState.calls.length, 1, "no second call while busy");
  assert.deepEqual(ctx.ui.notifications, [], "no composing notice while busy");
  // cleanup: abort the pending request so no timers/waits dangle
  await pi.handlers["session_shutdown"]({}, ctx);
  stubState.defer = null;
  await new Promise((r) => setTimeout(r, 10));
});

// --- astra re-review regressions (A-E) --------------------------------------

await wiringTest("wiring: same-length branch replacement drops the stale paragraph", async () => {
  stubState.calls = []; stubState.text = "stale paragraph";
  let release;
  stubState.defer = new Promise((r) => { release = r; });
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  const launched = await waitFor(() => stubState.calls.length === 1);
  assert.ok(launched);
  // replace with a DIFFERENT branch of the SAME length (navigation)
  holder.branch = makeBranch();
  release();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(Object.keys(ctx.ui.widgets), [], "equal-length navigation must drop, not render");
  await pi.handlers["session_shutdown"]({}, ctx);
});

await wiringTest("wiring: widget renders above the editor (default placement, below insights)", async () => {
  stubState.calls = []; stubState.text = "placed paragraph";
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  assert.ok(await waitFor(() => Object.keys(ctx.ui.widgets).length === 1), "widget must render");
  const widget = ctx.ui.widgets["pi-commentary"];
  assert.ok(widget, "widget key must be pi-commentary");
  assert.equal(widget.opts?.placement, undefined, "placement must default to aboveEditor — no belowEditor option may be passed");
  await pi.handlers["session_shutdown"]({}, ctx);
});

await wiringTest("wiring: superseded request restores consumed activity for the next settle", async () => {
  stubState.calls = [];
  let release;
  stubState.defer = new Promise((r) => { release = r; });
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder);
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  assert.ok(await waitFor(() => stubState.calls.length === 1));
  // text-only turn (no tool calls) while the request is pending
  holder.branch.push(userMsg("any update?"));
  await pi.handlers["turn_end"]({}, ctx); // invalidates + restores consumed activity
  release();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(Object.keys(ctx.ui.widgets), [], "superseded result dropped");
  stubState.defer = null;
  // next settle must regenerate, re-offering the old (never shown) activity
  await pi.handlers["agent_settled"]({}, ctx);
  assert.ok(await waitFor(() => stubState.calls.length === 2), "activity was not lost");
  const sent = stubState.calls[1].options.messages[0].content[0].text;
  assert.ok(sent.includes("2 tool call(s)"), `old activity re-offered: ${sent.slice(0, 120)}`);
  await pi.handlers["session_shutdown"]({}, ctx);
});

await wiringTest("wiring: status distinguishes attempt vs emission and reports failures", async () => {
  stubState.calls = [];
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const ctx = makeCtx(holder, {
    modelRegistry: {
      find: () => null,
      getApiKeyAndHeaders: async () => ({ ok: false, error: "no credentials" }),
      getProviderAuth: async () => null,
    },
  });
  await pi.handlers["turn_end"]({}, ctx);
  await pi.handlers["agent_settled"]({}, ctx);
  await waitFor(() => !!ctx.ui.widgets["pi-commentary"]);
  ctx.ui.notifications.length = 0;
  await pi.commands["commentary"].handler("status", ctx);
  const statusMsg = ctx.ui.notifications[0]?.msg ?? "";
  assert.ok(statusMsg.includes("last attempt"), statusMsg);
  assert.ok(statusMsg.includes("last emission"), statusMsg);
  assert.ok(statusMsg.includes("last failure: auth"), statusMsg);
});

// ===========================================================================
// Settings layering + dialog persistence (feature: /commentary settings dialog)
// Each dialog test gets an ISOLATED user file (unique path) — no cross-test
// pid-file contamination; env override points the extension at it per-test.
// ===========================================================================

const settingsMod = await jiti.import("../src/settings.ts");

// USER_SETTINGS_PATH is a module-level const (evaluated at index import): the
// env override is set ONCE (to SETTINGS_USER, before the import) and every
// settings test reuses exactly that path.
function useIsolatedUserFile() {
  rmSync(SETTINGS_USER, { force: true });
  return SETTINGS_USER;
}
function dialogCtx(enabledChoice, scopePick, modelInput = "", intervalInput = "") {
  const notifications = [];
  let inputIndex = 0; // 0 = model prompt, 1 = interval prompt
  const ctx = makeCtx({ branch: [] }, { ui: {
    widgets: {}, notifications,
    setWidget() {}, notify(m, l) { notifications.push({ msg: m, level: l }); },
    select: async (t) => (t.includes("Companion") ? enabledChoice : t.includes("Save") ? scopePick : undefined),
    input: async () => (inputIndex++ === 0 ? modelInput : intervalInput),
  } });
  return { ctx, notifications };
}

await test("loadFileSettings layers project over user with provenance and rejects unknown keys", () => {
  const user = useIsolatedUserFile();
  const proj = join(base, "..", "tests", `tmp-proj-${process.pid}`);
  mkdirSync(join(proj, ".pi"), { recursive: true });
  writeFileSync(user, JSON.stringify({ enabled: false, model: "anvil/llm.secondary" }));
  writeFileSync(join(proj, ".pi", "pi-commentary.json"), JSON.stringify({ enabled: true, bogusKey: 1 }));
  const loaded = settingsMod.loadFileSettings(proj, user);
  assert.ok(loaded.sources.some((s) => s.startsWith("user:")), JSON.stringify(loaded.sources));
  assert.ok(loaded.sources.some((s) => s.startsWith("project:")));
  assert.equal(loaded.overrides.enabled, true, "project wins over user");
  assert.equal(loaded.overrides.model, "anvil/llm.secondary");
  assert.ok(loaded.problems.some((p) => p.includes("bogusKey")));
  rmSync(proj, { recursive: true, force: true });
  rmSync(user, { force: true });
});

await test("saveSettings merges instead of clobbering, atomically, and refuses malformed files", () => {
  const user = useIsolatedUserFile();
  writeFileSync(user, JSON.stringify({ model: "keep/me" }));
  settingsMod.saveSettings("user", { minIntervalSeconds: 30 }, undefined, user);
  const merged = JSON.parse(readFileSync(user, "utf8"));
  assert.equal(merged.model, "keep/me");
  assert.equal(merged.minIntervalSeconds, 30);
  rmSync(user, { force: true });
  writeFileSync(user, "{not json");
  let refused = null;
  try { settingsMod.saveSettings("user", { model: "a/b" }, undefined, user); }
  catch (e) { refused = e instanceof Error ? e.message : String(e); }
  assert.ok(refused && refused.includes("malformed"), refused);
  assert.equal(readFileSync(user, "utf8"), "{not json", "malformed file byte-preserved");
  rmSync(user, { force: true });
});

await test("dialog: session-only scope applies in memory, writes nothing", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx("on", "this session only", "test/other", "45");
  await pi.commands["commentary"].handler("", ctx);
  assert.ok(notifications.some((n) => n.msg.includes("session-only")), JSON.stringify(notifications));
  assert.ok(!existsSync(user), "session scope writes no file");
  await pi.commands["commentary"].handler("status", ctx);
  assert.ok(ctx.ui.notifications.some((n) => n.msg.includes("test/other") || n.msg.includes("test/m1")));
});

await test("dialog: Esc abandons without changes", async () => {
  useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx(undefined, undefined);
  await pi.commands["commentary"].handler("", ctx);
  assert.deepEqual(notifications.filter((n) => n.level === "warning"), []);
  assert.ok(!existsSync(SETTINGS_USER));
});

await test("dialog: user-scope persistence reflected in status", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx("on", `user (${user})`, "test/secondary", "90");
  await pi.commands["commentary"].handler("", ctx);
  const saved = JSON.parse(readFileSync(user, "utf8"));
  assert.equal(saved.enabled, true);
  assert.equal(saved.model, "test/secondary");
  assert.equal(saved.minIntervalSeconds, 90);
  await pi.commands["commentary"].handler("status", ctx);
  assert.ok(ctx.ui.notifications.some((n) => n.msg.includes("test/secondary")));
  rmSync(user, { force: true });
});

await test("dialog: bad interval input refused, nothing saved", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx("on", `user (${user})`, "", "-5");
  await pi.commands["commentary"].handler("", ctx);
  assert.ok(notifications.some((n) => n.msg.includes("nothing saved")), JSON.stringify(notifications));
  assert.ok(!existsSync(user));
});

await test("astra r1: session_start reloads files via ctx.cwd and clears session overrides", async () => {
  const proj = join(tmpdir(), `pi-commentary-lifetime-${process.pid}`);
  mkdirSync(join(proj, ".pi"), { recursive: true });
  writeFileSync(join(proj, ".pi", "pi-commentary.json"), JSON.stringify({ enabled: false, model: "proj/model" }));
  try {
    const pi = makePi();
    entryModule.default(pi);
    const { ctx: ctx1, notifications } = dialogCtx("on", "this session only", "test/other", "");
    await pi.commands["commentary"].handler("", ctx1);
    assert.ok(notifications.some((n) => n.msg.includes("session-only")));
    const ctx2 = makeCtx({ branch: [] }, { cwd: proj });
    await pi.handlers["session_start"]({}, ctx2);
    await pi.commands["commentary"].handler("status", ctx2);
    const status = ctx2.ui.notifications.map((n) => n.msg).join("\n");
    assert.ok(status.includes("proj/model"), status);
    assert.ok(status.includes("off"), status);
  } finally {
    rmSync(proj, { recursive: true, force: true });
  }
});

await test("astra r2: 30s throttles a successor episode; 0s removes an EXISTING throttle", async () => {
  stubState.calls = []; stubState.defer = null; stubState.text = undefined;
  useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const holder = { branch: makeBranch() };
  const setOverride = async (seconds) => {
    const { ctx } = dialogCtx("on", "this session only", "test/secondary", String(seconds));
    await pi.commands["commentary"].handler("", ctx);
  };
  await setOverride(30);
  await pi.handlers["turn_end"]({}, makeCtx(holder));
  await pi.handlers["agent_settled"]({}, makeCtx(holder));
  assert.ok(await waitFor(() => stubState.calls.length === 1, 300), "first episode must generate");
  // A successor inside the window is throttled by the EXISTING interval
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, makeCtx(holder));
  await pi.handlers["agent_settled"]({}, makeCtx(holder));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(stubState.calls.length, 1, "30s interval must throttle the successor episode");
  // 0s must REMOVE that existing throttle — not merely be unthrottled on a fresh first emission
  await setOverride(0);
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, makeCtx(holder));
  await pi.handlers["agent_settled"]({}, makeCtx(holder));
  assert.ok(await waitFor(() => stubState.calls.length === 2, 300), "0s interval must remove the existing throttle");
  await pi.handlers["session_shutdown"]({}, makeCtx(holder));
});

await test("astra r2: reset with OPPOSITE dialog choice reconciles to effective state", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  stubState.calls = []; stubState.defer = null; stubState.text = undefined;
  try {
    // Baseline: commentary actually generates (defaults on)
    const holderA = { branch: makeBranch() };
    await pi.handlers["turn_end"]({}, makeCtx(holderA));
    await pi.handlers["agent_settled"]({}, makeCtx(holderA));
    assert.ok(await waitFor(() => stubState.calls.length === 1, 300), "baseline episode must generate");
    // A live request in flight when the dialog turns commentary off is cancelled
    const holderB = { branch: makeBranch() };
    const ctxB = makeCtx(holderB);
    stubState.defer = new Promise(() => {}); // hold the request open
    await pi.handlers["turn_end"]({}, ctxB);
    await pi.handlers["agent_settled"]({}, ctxB);
    assert.ok(await waitFor(() => stubState.calls.length === 2, 300), "in-flight episode must launch");
    await pi.commands["commentary"].handler("", dialogCtx("off", "this session only").ctx);
    stubState.defer = null; // release; the aborted request resolves with stopReason "aborted"
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(!ctxB.ui.widgets["pi-commentary"], "aborted in-flight request must not show a widget");
    // Stale-choice disagreement: dialog picks "off" + reset while the effective
    // config is on. The pick must NOT disable commentary — post-reset effective
    // state wins, and generation actually resumes (not just the notification).
    // (The suite baseline already runs with a 0s interval, so a fresh episode
    // passes the interval check after reset without env manipulation.)
    const { ctx, notifications } = dialogCtx("off", "reset saved settings");
    await pi.commands["commentary"].handler("", ctx);
    assert.ok(notifications.some((n) => n.msg.includes("commentary is on")), JSON.stringify(notifications));
    holderB.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
    await pi.handlers["turn_end"]({}, ctxB);
    await pi.handlers["agent_settled"]({}, ctxB);
    assert.ok(await waitFor(() => stubState.calls.length === 3, 300), "reset must actually re-enable generation despite the opposite dialog choice");
  } finally {
    await pi.handlers["session_shutdown"]({}, makeCtx({ branch: [] }));
  }
});

await test("astra r1: invalid model spec refused before any save", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx("on", "this session only", "bad model", "");
  await pi.commands["commentary"].handler("", ctx);
  assert.ok(notifications.some((n) => n.msg.includes("not a valid model") && n.msg.includes("nothing saved")), JSON.stringify(notifications));
  assert.ok(!existsSync(user));
});

await test("astra r2: blank model means default; blank interval keeps the file value", async () => {
  const user = useIsolatedUserFile();
  writeFileSync(user, JSON.stringify({ model: "file/model", minIntervalSeconds: 75 }));
  const pi = makePi();
  entryModule.default(pi);
  stubState.calls = []; stubState.defer = null; stubState.text = undefined;
  const { ctx, notifications } = dialogCtx("on", "this session only", "", "");
  await pi.commands["commentary"].handler("", ctx);
  assert.ok(notifications.some((n) => n.msg.includes("session-only")));
  await pi.commands["commentary"].handler("status", ctx);
  const status = ctx.ui.notifications.map((n) => n.msg).join("\n");
  assert.ok(status.includes("test/m1"), "blank model override => session model: " + status);
  assert.ok(status.includes("75s"), "blank interval must retain the file value (75s): " + status);
  // Behaviorally: the retained 75s actually throttles a successor episode
  const holder = { branch: makeBranch() };
  await pi.handlers["turn_end"]({}, makeCtx(holder));
  await pi.handlers["agent_settled"]({}, makeCtx(holder));
  assert.ok(await waitFor(() => stubState.calls.length === 1, 300), "first episode must generate");
  holder.branch.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read" }] } });
  await pi.handlers["turn_end"]({}, makeCtx(holder));
  await pi.handlers["agent_settled"]({}, makeCtx(holder));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(stubState.calls.length, 1, "retained 75s interval must throttle the successor episode");
  rmSync(user, { force: true });
});

await test("astra r2: save creates missing settings parent dir without 2s contention retry", async () => {
  const { saveSettings } = await jiti.import("../src/settings.ts");
  const freshDir = join(tmpdir(), `pi-commentary-fresh-${process.pid}`);
  rmSync(freshDir, { recursive: true, force: true });
  try {
    const start = Date.now();
    const path = saveSettings("user", { enabled: false }, undefined, join(freshDir, "nested", "pi-commentary.json"));
    const elapsed = Date.now() - start;
    assert.ok(existsSync(path), "save must create the missing parent dir and file");
    assert.equal(JSON.parse(readFileSync(path, "utf8")).enabled, false);
    assert.ok(elapsed < 1000, `save took ${elapsed}ms — ENOENT misread as lock contention (2s retry)`);
  } finally {
    rmSync(freshDir, { recursive: true, force: true });
  }
  // a BARE RELATIVE filename resolves its parent to "." (dirname, not string slicing)
  const bareDir = join(tmpdir(), `pi-commentary-bare-${process.pid}`);
  mkdirSync(bareDir, { recursive: true });
  const oldCwd = process.cwd();
  process.chdir(bareDir);
  try {
    const p2 = saveSettings("user", { enabled: true }, undefined, "bare.json");
    assert.ok(existsSync(join(bareDir, "bare.json")), "relative path must land in cwd");
  } finally {
    process.chdir(oldCwd);
    rmSync(bareDir, { recursive: true, force: true });
  }
});

await test("astra r2: in-flight dialog is invalidated at the session boundary", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  let releaseSelect;
  const notifications = [];
  const ctx = makeCtx({ branch: [] }, { cwd: tmpdir(), ui: {
    widgets: {}, notifications,
    setWidget() {}, notify(m, l) { notifications.push({ msg: m, level: l }); },
    select: (t) => t.includes("Companion") ? new Promise((r) => { releaseSelect = r; }) : Promise.resolve("this session only"),
    input: async () => "",
  }});
  const dialogPromise = pi.commands["commentary"].handler("", ctx);
  assert.ok(await waitFor(() => typeof releaseSelect === "function", 500), "dialog must be awaiting the enabled pick");
  // Session boundary while the dialog is still waiting on user input
  await pi.handlers["session_start"]({}, makeCtx({ branch: [] }, { cwd: tmpdir() }));
  releaseSelect("on");
  await dialogPromise;
  assert.ok(!notifications.some((n) => n.msg.includes("saved") || n.msg.includes("applied") || n.msg.includes("reset")), JSON.stringify(notifications));
  assert.ok(!notifications.some((n) => n.msg.includes("error")), JSON.stringify(notifications));
  assert.ok(!existsSync(user), "stale dialog must not write settings");
});

await test("astra r3: dialog dies on shutdown and swallows a rejected stale pick", async () => {
  const user = useIsolatedUserFile();
  const pi = makePi();
  entryModule.default(pi);
  // (a) late resolution AFTER session_shutdown commits nothing
  let releaseA;
  const notifsA = [];
  const ctxA = makeCtx({ branch: [] }, { cwd: tmpdir(), ui: {
    widgets: {}, notifications: notifsA,
    setWidget() {}, notify(m, l) { notifsA.push({ msg: m, level: l }); },
    select: (t) => t.includes("Companion") ? new Promise((r) => { releaseA = r; }) : Promise.resolve("this session only"),
    input: async () => "",
  }});
  const pA = pi.commands["commentary"].handler("", ctxA);
  assert.ok(await waitFor(() => typeof releaseA === "function", 500), "dialog must await the enabled pick");
  await pi.handlers["session_shutdown"]({}, makeCtx({ branch: [] }, { cwd: tmpdir() }));
  releaseA("on");
  await pA;
  assert.ok(notifsA.length === 0, `stale dialog after shutdown must be silent: ${JSON.stringify(notifsA)}`);
  assert.ok(!existsSync(user), "stale dialog must not write settings after shutdown");
  // (b) a REJECTED pick after a session boundary is swallowed silently
  let rejectB;
  const notifsB = [];
  const ctxB = makeCtx({ branch: [] }, { cwd: tmpdir(), ui: {
    widgets: {}, notifications: notifsB,
    setWidget() {}, notify(m, l) { notifsB.push({ msg: m, level: l }); },
    select: (t) => t.includes("Companion") ? new Promise((_, rj) => { rejectB = rj; }) : Promise.resolve("this session only"),
    input: async () => "",
  }});
  const pB = pi.commands["commentary"].handler("", ctxB);
  assert.ok(await waitFor(() => typeof rejectB === "function", 500), "dialog must await the enabled pick");
  await pi.handlers["session_start"]({}, makeCtx({ branch: [] }, { cwd: tmpdir() }));
  rejectB(new Error("old dialog closed"));
  await pB;
  assert.ok(notifsB.length === 0, `rejected stale dialog must not notify: ${JSON.stringify(notifsB)}`);
});

await test("astra r3: nested registry model ids validate; empty segments still rejected", async () => {
  const { validateSettingsObject } = await jiti.import("../src/settings.ts");
  assert.equal(validateSettingsObject({ model: "openrouter/anthropic/claude-3-haiku" }).problems.length, 0, "nested ids must pass file validation");
  assert.ok(validateSettingsObject({ model: "a//b" }).problems.length > 0, "empty segment must be rejected");
  assert.ok(validateSettingsObject({ model: "/x" }).problems.length > 0, "missing provider must be rejected");
  const user = useIsolatedUserFile();
  writeFileSync(user, JSON.stringify({ model: "openrouter/anthropic/claude-3-haiku" }));
  const pi = makePi();
  entryModule.default(pi);
  const { ctx, notifications } = dialogCtx("on", "this session only", "openrouter/anthropic/claude-3-haiku", "");
  await pi.commands["commentary"].handler("", ctx);
  assert.ok(notifications.some((n) => n.msg.includes("session-only")), `dialog must accept a nested registry id: ${JSON.stringify(notifications)}`);
  rmSync(user, { force: true });
});

console.log(`\nALL tests passed (${passed} total)`);

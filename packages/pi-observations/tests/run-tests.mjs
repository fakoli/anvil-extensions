import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

await import("./vision.test.mjs");
await import("./images.test.mjs");

const agentDir = mkdtempSync(path.join(tmpdir(), "pi-observations-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
const configPath = path.join(agentDir, "pi-observations.json");
writeFileSync(configPath, JSON.stringify({ provider: "local", model: "vision" }), { mode: 0o600 });
const { default: extension } = await import("../index.ts");

let sessions = 0;
function harness(flag = true, initialEntries = [], session = `session-${++sessions}`) {
  const handlers = new Map(), tools = new Map(), entries = [...initialEntries];
  let activeTools = ["existing_tool"], projected = [];
  let stream = () => { throw new Error("vision must not run in this test"); };
  const pi = {
    registerFlag() {}, getFlag: () => flag, on: (name, handler) => handlers.set(name, handler), registerTool: (tool) => tools.set(tool.name, tool),
    getActiveTools: () => activeTools, setActiveTools: (names) => { activeTools = names; },
    appendEntry: (customType, data) => entries.push({ id: `entry-${entries.length}`, type: "custom", customType, data }),
  };
  const context = {
    signal: undefined, aborts: 0, abort() { this.aborts += 1; },
    sessionManager: {
      getHeader: () => ({ id: session }), getEntries: () => entries, getBranch: () => [], buildContextEntries: () => projected,
    },
    modelRegistry: {
      find: (provider, id) => provider === "local" && id === "vision" ? { provider, id, input: ["text", "image"] } : undefined,
      getProvider: () => ({ stream: (...args) => stream(...args) }),
      getApiKeyAndHeaders: async () => ({ ok: true }),
    },
  };
  extension(pi);
  return { handlers, tools, context, entries, session, activeTools: () => activeTools, setProjection: (value) => { projected = value; }, setStream: (value) => { stream = value; } };
}

test("fresh flag creates one sticky marker and runs exact empty context", async () => {
  const { handlers, context, entries } = harness();
  await handlers.get("session_start")({ reason: "new" }, context);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].customType, "pi-observations-marker/v1");
  assert.deepEqual(await handlers.get("context")({ messages: [] }, context), { messages: [] });
  assert.deepEqual(handlers.get("session_before_compact")({}, context), { cancel: true });
  assert.equal(context.aborts > 0, true);
  await handlers.get("session_shutdown")({}, context);
});

test("primary media is rejected after mediation and disabled sessions remain inert", async () => {
  const active = harness();
  await active.handlers.get("session_start")({ reason: "new" }, active.context);
  assert.throws(() => active.handlers.get("before_provider_request")({ payload: { type: "image", data: "x" } }, active.context));
  assert.equal(active.context.aborts > 0, true);
  const toolResult = await active.tools.get("observation_inspect").execute("tool-1", { observation_id: "observation-missing", question: "What is visible?" }, undefined, undefined, active.context);
  assert.match(toolResult.content[0].text, /access_denied/);
  const inert = harness(false);
  await inert.handlers.get("session_start")({ reason: "new" }, inert.context);
  assert.equal(inert.entries.length, 0);
  assert.doesNotThrow(() => inert.handlers.get("before_provider_request")({ payload: { type: "image", data: "x" } }, inert.context));
});

test("corrupt sticky state fails closed and refuses guarded lifecycle operations", async () => {
  const corrupt = harness(true, [{ id: "bad", type: "custom", customType: "pi-observations-marker/v1", data: {} }]);
  await assert.rejects(corrupt.handlers.get("session_start")({ reason: "resume" }, corrupt.context), /startup_failed/);
  assert.equal(corrupt.context.aborts > 0, true);
  assert.deepEqual(corrupt.handlers.get("session_before_compact")({}, corrupt.context), { cancel: true });
  assert.deepEqual(corrupt.handlers.get("session_before_fork")({}, corrupt.context), { cancel: true });
  assert.deepEqual(corrupt.handlers.get("session_before_tree")({}, corrupt.context), { cancel: true });
  await assert.doesNotReject(corrupt.handlers.get("session_shutdown")({}, corrupt.context));
});

test("disabled mode reads no config and preserves existing active tools", async () => {
  const parked = `${configPath}.parked`;
  renameSync(configPath, parked);
  try {
    const inert = harness(false);
    await inert.handlers.get("session_start")({ reason: "new" }, inert.context);
    assert.deepEqual(inert.activeTools(), ["existing_tool"]);
  } finally { renameSync(parked, configPath); }
});

test("duplicate marker and valid marker without durable owner state fail closed", async () => {
  const fresh = harness();
  await fresh.handlers.get("session_start")({ reason: "new" }, fresh.context);
  const marker = structuredClone(fresh.entries[0]);
  const duplicate = harness(false, [marker, { ...structuredClone(marker), id: "duplicate" }], fresh.session);
  await assert.rejects(duplicate.handlers.get("session_start")({ reason: "resume" }, duplicate.context), /startup_failed/);
  await fresh.handlers.get("session_shutdown")({}, fresh.context);
  rmSync(path.join(agentDir, "pi-observations"), { recursive: true, force: true });
  const missing = harness(false, [marker], fresh.session);
  await assert.rejects(missing.handlers.get("session_start")({ reason: "resume" }, missing.context), /startup_failed/);
});

test("unsupported projected history aborts before dispatch", async () => {
  const active = harness();
  await active.handlers.get("session_start")({ reason: "new" }, active.context);
  active.setProjection([{ type: "compaction" }]);
  await assert.rejects(active.handlers.get("context")({ messages: [{ role: "user", content: [{ type: "text", text: "mismatch" }] }] }, active.context), /unsupported_history/);
  assert.equal(active.context.aborts > 0, true);
  await active.handlers.get("session_shutdown")({}, active.context);
});

test("context cancellation reaches the automatic native inspector", async () => {
  const active = harness(), cancellation = new AbortController(); let received;
  await active.handlers.get("session_start")({ reason: "new" }, active.context);
  const message = { role: "user", content: [{ type: "text", text: "What is visible?" }, { type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGAAAAAHAALpEtlMAAAAAElFTkSuQmCC" }] };
  active.setProjection([{ id: "source-1", type: "message", message }]);
  active.context.signal = cancellation.signal;
  active.setStream((_model, _context, options) => ({ async *[Symbol.asyncIterator]() { received = options.signal; yield { type: "start" }; await new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true })); yield { type: "error", reason: "aborted" }; } }));
  setTimeout(() => cancellation.abort(), 5);
  const result = await active.handlers.get("context")({ messages: [message] }, active.context);
  assert.equal(received.aborted, true);
  assert.equal(JSON.stringify(result.messages).includes("data:image/"), false);
  await active.handlers.get("session_shutdown")({}, active.context);
});


test("text-only context transforms preserve text while image provenance stays exact", async () => {
  const active = harness(); await active.handlers.get("session_start")({ reason: "new" }, active.context);
  const plain = { role: "user", content: [{ type: "text", text: "inspect @example.jpg" }] };
  active.setProjection([{ id: "plain", type: "message", message: plain }]);
  const transformed = { ...plain, content: "inspect @example.jpg" };
  assert.deepEqual((await active.handlers.get("context")({ messages: [transformed] }, active.context)).messages, [transformed]);
  const original = { role: "toolResult", toolCallId: "tool-1", toolName: "read", content: [{ type: "image", mimeType: "image/svg+xml", data: "PHN2Zy8+" }] };
  active.setProjection([{ id: "plain", type: "message", message: plain }, { id: "image", type: "message", message: original }]);
  const result = await active.handlers.get("context")({ messages: [transformed, original] }, active.context);
  assert.match(JSON.stringify(result.messages), /unsupported_format/);
  assert.equal(JSON.stringify(result.messages).includes("PHN2Zy8+"), false);
  for (const omitted of [[], [transformed], [{ ...original, content: [] }]]) {
    await assert.rejects(active.handlers.get("context")({ messages: omitted }, active.context), /image_source_mismatch/);
  }
  for (const changed of [{ ...original, toolCallId: "forged" }, { ...original, content: [...original.content, { type: "text", text: "forged question" }] }]) {
    await assert.rejects(active.handlers.get("context")({ messages: [changed] }, active.context), /image_source_mismatch/);
  }
  active.setProjection([{ id: "one", type: "message", message: original }, { id: "two", type: "message", message: original }]);
  await assert.rejects(active.handlers.get("context")({ messages: [original] }, active.context), /image_source_mismatch/);
  await active.handlers.get("session_shutdown")({}, active.context);
});

test.after(() => rmSync(agentDir, { recursive: true, force: true }));

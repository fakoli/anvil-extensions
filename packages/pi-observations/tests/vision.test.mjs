import assert from "node:assert/strict";
import test from "node:test";
import { createVisionInspector, VisionError, parseVisionInspection } from "../src/vision.ts";

const message = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason });
const eventStream = (events, result) => ({
  async *[Symbol.asyncIterator]() { for (const event of events) yield event; },
  result: async () => result,
});
const observed = message([{ type: "thinking", thinking: "considering" }, { type: "text", text: '{"inspection_status":"observed","facts":[{"kind":"visible_text","text":"OK","uncertainty":"literal_unverified","region_ref":null}],"reason":""}' }]);

function fixture({ auth = { ok: true, apiKey: "synthetic-key", headers: { "x-test": "yes" }, env: { TEST: "1" }, baseUrl: "http://127.0.0.1:9000/v1" }, stream = eventStream([{ type: "start" }, { type: "thinking_delta", delta: "considering" }, { type: "text_delta", delta: "{}" }, { type: "done", reason: "stop", message: observed }], observed) } = {}) {
  const calls = { find: [], auth: 0, streams: [] };
  const model = { provider: "local", id: "vision", input: ["text", "image"], baseUrl: "http://static.invalid/v1" };
  return {
    calls,
    registry: {
      find(provider, id) { calls.find.push([provider, id]); return provider === "local" && id === "vision" ? model : undefined; },
      getApiKeyAndHeaders: async () => { calls.auth += 1; return auth; },
      getProvider: () => ({ stream(requestModel, context, options) { calls.streams.push({ requestModel, context, options }); return stream; } }),
    },
  };
}

const request = (signal = new AbortController().signal) => ({ image: { mimeType: "image/png", data: Buffer.from("png") }, question: "What literal text is visible?", signal });
const code = (expected) => (error) => error instanceof VisionError && error.code === expected;

test("uses the selected native provider once with resolved auth and only one image/question", async () => {
  const { registry, calls } = fixture();
  const inspect = createVisionInspector(registry, { provider: "local", model: "vision" });
  assert.deepEqual(await inspect(request()), { inspection_status: "observed", facts: [{ kind: "visible_text", text: "OK", uncertainty: "literal_unverified", region_ref: null }], reason: "" });
  assert.deepEqual(calls.find, [["local", "vision"]]);
  assert.equal(calls.auth, 1);
  assert.equal(calls.streams.length, 1);
  const call = calls.streams[0];
  assert.equal(call.requestModel.baseUrl, "http://127.0.0.1:9000/v1");
  assert.deepEqual(call.options, { apiKey: "synthetic-key", headers: { "x-test": "yes" }, env: { TEST: "1" }, signal: call.options.signal, timeoutMs: 30_000, maxRetries: 0, maxTokens: 1024 });
  assert.equal(call.context.messages.length, 1);
  assert.equal(call.context.messages[0].content.length, 2);
  assert.equal(call.context.messages[0].content[0].text, "What literal text is visible?");
  assert.deepEqual(call.context.messages[0].content[1], { type: "image", mimeType: "image/png", data: Buffer.from("png").toString("base64") });
  assert.equal(call.context.tools, undefined);
});

test("uses the terminal native event rather than a separately hanging result", async () => {
  const done = eventStream([{ type: "done", reason: "stop", message: observed }], observed);
  done.result = () => new Promise(() => {});
  const { registry } = fixture({ stream: done });
  assert.equal((await createVisionInspector(registry, { provider: "local", model: "vision" })(request())).inspection_status, "observed");
});

test("fails closed for missing selection, malformed output, and media-bearing output", async () => {
  assert.throws(() => createVisionInspector(fixture().registry, null), code("endpoint_unavailable"));
  const missing = fixture();
  await assert.rejects(createVisionInspector(missing.registry, { provider: "other", model: "none" })(request()), code("endpoint_unavailable"));
  const textOnly = fixture();
  textOnly.registry.find = () => ({ provider: "local", id: "vision", input: ["text"] });
  await assert.rejects(createVisionInspector(textOnly.registry, { provider: "local", model: "vision" })(request()), code("endpoint_unavailable"));
  assert.throws(() => parseVisionInspection({ inspection_status: "observed", facts: [], reason: "not empty" }), code("invalid_response"));
  assert.throws(() => parseVisionInspection({ inspection_status: "inconclusive", facts: [], reason: "data:image/png;base64,no" }), code("invalid_response"));
  const malformed = fixture({ stream: eventStream([{ type: "done", reason: "stop", message: message([{ type: "text", text: "not json" }]) }], message([{ type: "text", text: "not json" }])) });
  await assert.rejects(createVisionInspector(malformed.registry, { provider: "local", model: "vision" })(request()), code("invalid_response"));
  await assert.rejects(createVisionInspector(fixture().registry, { provider: "local", model: "vision" })({ ...request(), question: 7 }), code("question_required"));
  await assert.rejects(createVisionInspector(fixture().registry, { provider: "local", model: "vision" })({ ...request(), question: "é".repeat(257) }), code("question_required"));
  assert.throws(() => parseVisionInspection({ inspection_status: "observed", facts: [{ kind: "visible_text", text: "é".repeat(257), uncertainty: "literal_unverified", region_ref: null }], reason: "" }), code("invalid_response"));
  assert.throws(() => parseVisionInspection({ inspection_status: "inconclusive", facts: [], reason: "é".repeat(129) }), code("invalid_response"));
});

test("aborts tool, unknown, and combined thinking/text overflow events", async () => {
  let toolAborted;
  const tool = fixture({ stream: eventStream([{ type: "toolcall_start" }], observed) });
  const inspectTool = createVisionInspector(tool.registry, { provider: "local", model: "vision" });
  await assert.rejects(inspectTool(request()), code("invalid_response"));
  toolAborted = tool.calls.streams[0].options.signal.aborted;
  assert.equal(toolAborted, true);
  const huge = fixture({ stream: eventStream([{ type: "thinking_delta", delta: "x".repeat(32 * 1024) }, { type: "text_delta", delta: "x".repeat(32 * 1024 + 1) }], observed) });
  await assert.rejects(createVisionInspector(huge.registry, { provider: "local", model: "vision" })(request()), code("result_too_large"));
  assert.equal(huge.calls.streams[0].options.signal.aborted, true);
  const unknown = fixture({ stream: eventStream([{ type: "unexpected" }], observed) });
  await assert.rejects(createVisionInspector(unknown.registry, { provider: "local", model: "vision" })(request()), code("invalid_response"));
});

test("rejects contradictory terminal stops and terminal media", async () => {
  const length = message([{ type: "text", text: "{}" }], "length");
  const contradictory = fixture({ stream: eventStream([{ type: "done", reason: "stop", message: length }], length) });
  await assert.rejects(createVisionInspector(contradictory.registry, { provider: "local", model: "vision" })(request()), code("invalid_response"));
  const media = message([{ type: "image", data: "raw", mimeType: "image/png" }]);
  const terminalMedia = fixture({ stream: eventStream([{ type: "done", reason: "stop", message: media }], media) });
  await assert.rejects(createVisionInspector(terminalMedia.registry, { provider: "local", model: "vision" })(request()), code("invalid_response"));
});

test("bounds hung auth and ignores a late auth result after cancellation", async () => {
  let resolveAuth;
  let streamed = 0;
  const registry = {
    find: () => ({ provider: "local", id: "vision", input: ["image"] }),
    getApiKeyAndHeaders: () => new Promise((resolve) => { resolveAuth = resolve; }),
    getProvider: () => ({ stream: () => { streamed += 1; return eventStream([], observed); } }),
  };
  await assert.rejects(createVisionInspector(registry, { provider: "local", model: "vision", timeoutMs: 10 })(request()), code("deadline_exceeded"));
  const controller = new AbortController();
  const pending = createVisionInspector(registry, { provider: "local", model: "vision" })(request(controller.signal));
  controller.abort();
  await assert.rejects(pending, code("cancelled"));
  resolveAuth({ ok: true, apiKey: "late" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(streamed, 0);
});

test("cancellation maps to a typed error without exposing provider errors", async () => {
  const controller = new AbortController();
  const hanging = {
    async *[Symbol.asyncIterator]() { await new Promise((resolve) => controller.signal.addEventListener("abort", resolve, { once: true })); },
    result: async () => { throw new Error("synthetic credential must stay private"); },
  };
  const { registry } = fixture({ stream: hanging });
  const pending = createVisionInspector(registry, { provider: "local", model: "vision" })(request(controller.signal));
  controller.abort();
  await assert.rejects(pending, code("cancelled"));
});

test("bounds native streams that ignore abort while waiting for their next event", async () => {
  const never = {
    [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}), return: () => Promise.resolve({ done: true }) }; },
    result: () => new Promise(() => {}),
  };
  const timeout = fixture({ stream: never });
  await assert.rejects(createVisionInspector(timeout.registry, { provider: "local", model: "vision", timeoutMs: 10 })(request()), code("deadline_exceeded"));
  const controller = new AbortController();
  const cancel = fixture({ stream: never });
  const pending = createVisionInspector(cancel.registry, { provider: "local", model: "vision" })(request(controller.signal));
  controller.abort();
  await assert.rejects(pending, code("cancelled"));
});

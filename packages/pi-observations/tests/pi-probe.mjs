import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePng } from "@anvil-serving/observations/png";

const pi = process.env.PI_BINARY || "pi";
const animatedGifNotice = "Animated GIF: only the first frame is available for inspection; motion and later frames are not included.";
const timeout = 12_000;
const childTimeout = 20_000;
const maxBodyBytes = 2 * 1024 * 1024, maxRequests = 32, maxStdoutBytes = 2 * 1024 * 1024, maxStderrBytes = 64 * 1024;
const image = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGAAAAAHAALpEtlMAAAAAElFTkSuQmCC" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hasMedia = (value) => Array.isArray(value) ? value.some(hasMedia) : value && typeof value === "object" ? value.type === "image" || value.type === "image_url" || value.type === "input_image" || Object.values(value).some(hasMedia) : typeof value === "string" && value.includes("data:image/");

function settleExtensionUi(runner) {
  runner.respondedUi ??= new Set();
  for (const event of runner.events.filter((event) => event.type === "extension_ui_request" && !runner.respondedUi.has(event.id))) {
    if (!event.id || event.method !== "select" || !Array.isArray(event.options) || !event.options.includes("Yes")) continue;
    runner.respondedUi.add(event.id);
    runner.child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event.id, value: "Yes" })}\n`);
  }
}
async function waitFor(predicate, label, runner) { const start = Date.now(); while (!predicate()) { runner?.settleUi?.(); if (runner?.failure()) throw runner.failure(); if (Date.now() - start > timeout) throw new Error(`${label} timed out`); await sleep(20); } }
function event(delta, finish = null) { return `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`; }
function reply(response, delta, finish = "stop") { response.writeHead(200, { "content-type": "text/event-stream" }); response.write(event(delta)); response.write(event({}, finish)); response.end("data: [DONE]\n\n"); }

async function startProvider() {
  const primary = [], vision = [];
  let toolInspectionIssued = false, builtInReadIssued = false, builtInReadTarget = null, failNextVision = false, holdNextVision = false;
  const heldResponses = new Set(); let requestCount = 0, failure;
  const server = createServer(async (request, response) => {
    try {
      if (++requestCount > maxRequests) throw new Error(`fixture request count exceeds ${maxRequests}`);
      const chunks = []; let bytes = 0;
      for await (const part of request) { bytes += part.length; if (bytes > maxBodyBytes) throw new Error(`fixture body exceeds ${maxBodyBytes} bytes`); chunks.push(part); }
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") return response.writeHead(404).end();
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (body.model === "vision") {
        vision.push(body);
        if (failNextVision) { failNextVision = false; return response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "fixture vision failure" } })); }
        if (holdNextVision) { holdNextVision = false; heldResponses.add(response); request.once("close", () => heldResponses.delete(response)); return; }
        return reply(response, { role: "assistant", content: JSON.stringify({ inspection_status: "observed", facts: [{ kind: "visual_fact", text: "fixture", uncertainty: "unverified_interpretation", region_ref: null }], reason: "" }) });
      }
      primary.push(body);
      const transcript = JSON.stringify(body.messages);
      if (transcript.includes("[tool-image]") && !transcript.includes("question_required")) return reply(response, { role: "assistant", tool_calls: [{ index: 0, id: "fixture-image", type: "function", function: { name: "fixture_image", arguments: "{}" } }] }, "tool_calls");
      if (builtInReadTarget && transcript.includes("[builtin-read]") && !builtInReadIssued) { builtInReadIssued = true; return reply(response, { role: "assistant", tool_calls: [{ index: 0, id: "builtin-read", type: "function", function: { name: "read", arguments: JSON.stringify({ path: builtInReadTarget }) } }] }, "tool_calls"); }
      const textBlocks = body.messages.flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part?.type === "text").map((part) => part.text) : typeof message.content === "string" ? [message.content] : []);
      const pending = [...textBlocks].reverse().flatMap((text) => String(text).split(/\r?\n/)).map((text) => { try { return JSON.parse(text); } catch { return null; } }).find((value) => value?.schema === "observation-mediation/v1" && value.status === "question_required");
      if (pending && !toolInspectionIssued) {
        toolInspectionIssued = true;
        const observation = pending.observation_id;
        return reply(response, { role: "assistant", tool_calls: [{ index: 0, id: "inspect", type: "function", function: { name: "observation_inspect", arguments: JSON.stringify({ observation_id: observation, question: "What is in the fixture?" }) } }] }, "tool_calls");
      }
      return reply(response, { role: "assistant", content: "primary fixture answer" });
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error(String(error));
      if (!response.headersSent) response.writeHead(413, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "fixture request rejected" } }));
    }
  });
  server.on("error", (error) => { failure ??= error; });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, primary, vision,
    failNextVision: () => { failNextVision = true; }, holdNextVision: () => { holdNextVision = true; }, queueBuiltinRead: (path) => { assert.equal(typeof path, "string"); builtInReadTarget = path; },
    assertHealthy: () => { if (failure) throw failure; },
    close: async () => { for (const response of heldResponses) response.destroy(); server.closeAllConnections(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}

function fixtureExtension(toolImage = image) { return `import { Type } from "typebox";
let offset = 0; const realNow = Date.now; Date.now = () => realNow() + offset;
export default (pi) => {
  pi.registerProvider("fixture", { name: "fixture", baseUrl: process.env.PI_OBSERVATION_FIXTURE_URL, apiKey: "fixture", api: "openai-completions", models: [
    { id: "primary", name: "primary", reasoning: false, input: process.env.PI_OBSERVATION_PRIMARY_IMAGE === "1" ? ["text", "image"] : ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 256 },
    { id: "vision", name: "vision", reasoning: false, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 256 }
  ] });
  pi.registerCommand("fixture_expire", { description: "advance isolated fixture clock", async handler() { offset = 3_600_001; } });
  pi.registerTool({ name: "fixture_image", description: "fixture", parameters: Type.Object({}), async execute() { return { content: [{ type: "image", mimeType: "${toolImage.mimeType}", data: "${toolImage.data}" }] }; } });
};`; }
function priorContextTransform() { return `export default (pi) => {
  pi.on("context", (event) => ({ messages: event.messages.map((message) => message?.role === "user" && Array.isArray(message.content) && message.content.every((part) => part?.type === "text") ? { ...message, content: message.content.map((part) => part.text).join("\\n") } : message) }));
};`; }

async function startPi(home, provider, primaryImageCapable, enableObservation = true, transformContext = false, bundle = false, toolImage = image) {
  await mkdir(join(home, "agent"), { recursive: true, mode: 0o700 });
  await writeFile(join(home, "fixture.ts"), fixtureExtension(toolImage), { mode: 0o600 });
  if (transformContext) await writeFile(join(home, "prior-context.ts"), priorContextTransform(), { mode: 0o600 });
  await writeFile(join(home, "agent", "pi-observations.json"), JSON.stringify({ provider: "fixture", model: "vision", profile: "fixture" }), { mode: 0o600 });
  if (bundle) {
    const root = JSON.parse(await readFile(resolve("package.json"), "utf8"));
    const extensions = root.pi?.extensions?.map((entry) => entry.replace(/^\.\//, ""));
    assert.ok(Array.isArray(extensions) && extensions.includes("packages/pi-observations/index.ts"), "full bundle must select the registered observations extension");
    await writeFile(join(home, "agent", "settings.json"), JSON.stringify({ packages: [{ source: resolve("."), extensions, skills: [], prompts: [], themes: [] }] }), { mode: 0o600 });
  }
  const args = ["--mode", "rpc", ...(bundle ? [] : ["--no-extensions"]), "--no-skills", "--no-prompt-templates", "--no-context-files", "--extension", join(home, "fixture.ts"), ...(transformContext ? ["--extension", join(home, "prior-context.ts")] : []), ...(bundle ? [] : ["--extension", resolve("packages/pi-observations/index.ts")]), "--provider", "fixture", "--model", "primary", "--session-dir", join(home, "sessions"), ...(enableObservation ? ["--observation"] : [])];
  const child = spawn(pi, args, { cwd: process.cwd(), env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(home, "agent"), PI_CODING_AGENT_SESSION_DIR: join(home, "sessions"), PI_OFFLINE: "1", PI_OBSERVATION_FIXTURE_URL: provider.baseUrl, PI_OBSERVATION_PRIMARY_IMAGE: primaryImageCapable ? "1" : "0" }, stdio: ["pipe", "pipe", "pipe"] });
  const events = []; let buffer = "", stderr = "", stdoutBytes = 0, stderrBytes = 0, failure;
  const fail = (error) => { failure ??= error instanceof Error ? error : new Error(String(error)); if (child.exitCode === null) child.kill("SIGTERM"); };
  const killTimer = setTimeout(() => { fail(new Error(`Pi child exceeded ${childTimeout}ms`)); setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 1_000).unref(); }, childTimeout);
  child.once("close", () => clearTimeout(killTimer)); child.once("error", fail);
  child.stdout.setEncoding("utf8"); child.stdout.on("data", (data) => {
    stdoutBytes += Buffer.byteLength(data); if (stdoutBytes > maxStdoutBytes) return fail(new Error(`Pi stdout exceeds ${maxStdoutBytes} bytes`));
    buffer += data; const lines = buffer.split("\n"); buffer = lines.pop();
    try { for (const line of lines) if (line) events.push(JSON.parse(line)); } catch (error) { fail(error); }
  });
  child.stderr.setEncoding("utf8"); child.stderr.on("data", (data) => { stderrBytes += Buffer.byteLength(data); if (stderrBytes > maxStderrBytes) return fail(new Error(`Pi stderr exceeds ${maxStderrBytes} bytes`)); stderr += data; });
  const diagnostics = () => {
    const counts = {}, errors = [];
    for (const item of events) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
      if (item.type === "response" && item.success === false) errors.push({ id: item.id, error: String(item.error ?? "response_failed").slice(0, 256) });
      if (item.type === "error") errors.push({ error: String(item.error ?? "event_error").slice(0, 256) });
      if (item.type === "message_end" && item.message?.stopReason === "error") errors.push({ error: String(item.message.errorMessage ?? "model_error").slice(0, 256) });
    }
    return { counts, errors: errors.slice(-8), messageEnds: events.filter((item) => item.type === "message_end").slice(-8).map((item) => ({ role: item.message?.role, stopReason: item.message?.stopReason, contentTypes: Array.isArray(item.message?.content) ? item.message.content.map((part) => part?.type) : typeof item.message?.content })), stderr: stderr.slice(-1024) };
  };
  await once(child, "spawn"); return { child, events, stderr: () => stderr, failure: () => failure, diagnostics };
}
async function rpc(runner, command) { if (runner.failure()) throw runner.failure(); runner.child.stdin.write(`${JSON.stringify(command)}\n`); await waitFor(() => runner.events.some((item) => item.id === command.id && item.type === "response"), command.type, runner); const response = runner.events.find((item) => item.id === command.id && item.type === "response"); assert.equal(response.success, true, JSON.stringify(response)); return response.data; }
async function prompt(runner, command) { const completed = runner.events.filter((item) => item.type === "agent_end").length; await rpc(runner, command); await waitFor(() => runner.events.filter((item) => item.type === "agent_end").length > completed, `${command.id} agent_end`, runner); }
async function stop(child) { if (!child || child.exitCode !== null || child.signalCode !== null) return; const done = once(child, "close"); child.kill("SIGTERM"); await Promise.race([done, sleep(2_000).then(() => { child.kill("SIGKILL"); return done; })]); }
async function generatedImage(mimeType, animated = false) {
  const sharp = (await import("sharp")).default;
  if (animated) {
    const raw = Buffer.from([255, 0, 0, 0, 0, 255]);
    return { mimeType, animated: true, data: (await sharp(raw, { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ loop: 0, delay: [100, 100] }).toBuffer()).toString("base64") };
  }
  const source = sharp({ create: { width: 2, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } });
  const output = mimeType === "image/jpeg" ? source.jpeg() : mimeType === "image/webp" ? source.webp() : source.gif();
  return { mimeType, animated: false, data: (await output.toBuffer()).toString("base64") };
}
function assertedVisionPng(request) {
  const parts = request.messages.find((message) => message.role === "user").content;
  const imagePart = parts.find((part) => part.type === "image_url" || part.type === "image");
  const url = imagePart.image_url?.url;
  const match = typeof url === "string" && /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  assert.ok(match, "vision request is not canonical PNG");
  validatePng(match[1]);
  return match[1];
}

async function main() {
  const version = spawnSync(pi, ["--version"], { encoding: "utf8", timeout }); assert.equal(version.status, 0, "Pi 0.85.1 executable is required"); assert.equal(version.stdout.trim(), "0.85.1", "installed Pi version changed");
  const home = await mkdtemp(join(tmpdir(), "pi-observations-probe-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, process.argv.includes("--primary-image"));
    await prompt(runner, { id: "automatic", type: "prompt", message: "What is in this image?", images: [{ type: "image", ...image }] });
    await waitFor(() => provider.primary.length >= 1 && provider.vision.length === 1, "automatic mediation", runner);
    assert.equal(hasMedia(provider.primary[0]), false, "primary received original media");
    const visionParts = provider.vision[0].messages.find((message) => message.role === "user").content;
    assert.equal(visionParts.filter((part) => part.type === "image_url" || part.type === "image").length, 1, "vision request image count");
    assert.equal(visionParts.find((part) => part.type === "text").text, "What is in this image?", "vision question changed");
    const state = await rpc(runner, { id: "state", type: "get_state" });
    const entries = await rpc(runner, { id: "entries", type: "get_entries" }); assert.equal(JSON.stringify(entries.entries).includes(image.data), true, "saved PNG changed");
    await stop(runner.child); runner = await startPi(home, provider, process.argv.includes("--primary-image"), false);
    await rpc(runner, { id: "resume", type: "switch_session", sessionPath: state.sessionFile });
    const beforeResume = provider.vision.length;
    await prompt(runner, { id: "cached", type: "prompt", message: "Use the retained image." });
    await waitFor(() => provider.primary.length >= 2, "cached resume", runner);
    assert.equal(provider.vision.length, beforeResume, "clean resume reinspected cached image");
    await prompt(runner, { id: "tool", type: "prompt", message: "[tool-image]" });
    await waitFor(() => provider.vision.length === 2 && provider.primary.length >= 3, "tool mediation", runner);
    assert.equal(provider.primary.every((request) => !hasMedia(request)), true, "primary payload contains media");
    const malformedBefore = { primary: provider.primary.length, vision: provider.vision.length };
    await prompt(runner, { id: "malformed", type: "prompt", message: "refuse malformed", images: [{ type: "image", mimeType: "image/png", data: "not-base64" }] });
    await waitFor(() => provider.primary.length >= malformedBefore.primary + 1, "malformed refusal primary response", runner);
    assert.equal(provider.vision.length, malformedBefore.vision, "malformed PNG reached vision");
    assert.equal(hasMedia(provider.primary.at(-1)), false, "malformed PNG leaked to primary");
    const failedBefore = { primary: provider.primary.length, vision: provider.vision.length };
    provider.failNextVision();
    await prompt(runner, { id: "failed-vision", type: "prompt", message: "continue without media", images: [{ type: "image", ...image }] });
    await waitFor(() => provider.primary.length >= failedBefore.primary + 1 && provider.vision.length >= failedBefore.vision + 1, "failed vision text-only continuation", runner);
    assert.equal(hasMedia(provider.primary.at(-1)), false, "failed vision leaked raw media to primary");
    const heldBefore = { primary: provider.primary.length, vision: provider.vision.length };
    provider.holdNextVision();
    await rpc(runner, { id: "held-vision", type: "prompt", message: "cancel held inspection", images: [{ type: "image", ...image }] });
    await waitFor(() => provider.vision.length >= heldBefore.vision + 1, "held vision request", runner);
    await sleep(100);
    assert.equal(provider.primary.length, heldBefore.primary, "primary dispatched while vision was held");
    await stop(runner.child); runner = undefined;
    assert.equal(provider.primary.length, heldBefore.primary, "cancelling held vision dispatched primary");
    runner = await startPi(home, provider, process.argv.includes("--primary-image"), false);
    await rpc(runner, { id: "resume-after-cancel", type: "switch_session", sessionPath: state.sessionFile });
    for (const id of ["budget-first", "budget-second"]) {
      const beforeAttempt = { primary: provider.primary.length, vision: provider.vision.length };
      provider.failNextVision();
      await prompt(runner, { id, type: "prompt", message: id, images: [{ type: "image", ...image }] });
      await waitFor(() => provider.primary.length >= beforeAttempt.primary + 1 && provider.vision.length >= beforeAttempt.vision + 1, `${id} reserved attempt`, runner);
      assert.equal(hasMedia(provider.primary.at(-1)), false, `${id} leaked raw media to primary`);
    }
    const budgetBefore = { primary: provider.primary.length, vision: provider.vision.length };
    await prompt(runner, { id: "budget-exhausted", type: "prompt", message: "budget exhausted", images: [{ type: "image", ...image }] });
    await waitFor(() => provider.primary.length >= budgetBefore.primary + 1, "budget exhaustion continuation", runner);
    assert.equal(provider.vision.length, budgetBefore.vision, "budget exhausted request reached vision");
    assert.equal(hasMedia(provider.primary.at(-1)), false, "budget exhaustion leaked raw media to primary");
    assert.equal(JSON.stringify(provider.primary.at(-1).messages).includes("budget_exhausted"), true, "budget exhaustion envelope missing");
    await rpc(runner, { id: "expire-clock", type: "prompt", message: "/fixture_expire" });
    const expiryBefore = { primary: provider.primary.length, vision: provider.vision.length };
    await prompt(runner, { id: "expired-observation", type: "prompt", message: "use the retained observation" });
    await waitFor(() => provider.primary.length >= expiryBefore.primary + 1, "expired observation continuation", runner);
    assert.equal(provider.vision.length, expiryBefore.vision, "expired observation reached vision");
    assert.equal(hasMedia(provider.primary.at(-1)), false, "expired observation leaked raw media to primary");
    assert.equal(JSON.stringify(provider.primary.at(-1).messages).includes("expired_observation"), true, "expired observation envelope missing");
    await sleep(200);
    const before = { primary: provider.primary.length, vision: provider.vision.length };
    runner.child.stdin.write('{"id":"compact","type":"compact"}\n'); await waitFor(() => runner.events.some((item) => item.id === "compact" && item.type === "response"), "compaction", runner);
    assert.equal(runner.events.find((item) => item.id === "compact" && item.type === "response").success, false, "enabled compaction was allowed"); assert.deepEqual({ primary: provider.primary.length, vision: provider.vision.length }, before, "compaction made a provider request");
    provider.assertHealthy();
    process.stdout.write(`pi observations probe: ok (${version.stdout.trim()}; primary=${provider.primary.length}; vision=${provider.vision.length})\n`);
  } catch (error) {
    console.error(`pi observations diagnostic: ${JSON.stringify(runner?.diagnostics?.() ?? { error: String(error).slice(0, 256) })}`);
    throw error;
  } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
}
async function transformedTextContextRegression() {
  const home = await mkdtemp(join(tmpdir(), "pi-observations-transform-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, false, true, true);
    const before = { primary: provider.primary.length, vision: provider.vision.length };
    await prompt(runner, { id: "path-reference", type: "prompt", message: "@Downloads/example.jpg" });
    await waitFor(() => provider.primary.length >= before.primary + 1, "transformed text context reached primary", runner);
    assert.equal(provider.vision.length, before.vision, "text-only path reference reached vision");
    assert.equal(provider.primary.every((request) => !hasMedia(request)), true, "transformed text context leaked media");
    provider.assertHealthy();
    process.stdout.write("pi observations transformed text context: ok\n");
  } catch (error) {
    console.error(`pi observations transform diagnostic: ${JSON.stringify(runner?.diagnostics?.() ?? { error: String(error).slice(0, 256) })}`);
    throw error;
  } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
}
async function registeredBundleRegression() {
  const home = await mkdtemp(join(tmpdir(), "pi-observations-bundle-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, false, true, false, true);
    await prompt(runner, { id: "bundle-image", type: "prompt", message: "What is in this image?", images: [{ type: "image", ...image }] });
    await waitFor(() => provider.primary.length >= 1 && provider.vision.length === 1, "registered bundle image mediation", runner);
    assert.equal(provider.primary.every((request) => !hasMedia(request)), true, "registered bundle primary received media");
    const visionParts = provider.vision[0].messages.find((message) => message.role === "user").content;
    const visionImage = visionParts.find((part) => part.type === "image_url" || part.type === "image");
    assert.match(visionImage.image_url?.url ?? visionImage.mimeType ?? "", /^data:image\/png;base64,|^image\/png$/, "registered bundle vision image is not canonical PNG");
    provider.assertHealthy();
    process.stdout.write("pi observations registered bundle: ok\n");
  } catch (error) {
    console.error(`pi observations bundle diagnostic: ${JSON.stringify(runner?.diagnostics?.() ?? { error: String(error).slice(0, 256) })}`);
    throw error;
  } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
}

async function fullBundleBuiltinReadRegression() {
  const home = await mkdtemp(join(tmpdir(), "pi-observations-builtin-read-")), provider = await startProvider(); let runner;
  try {
    const source = await generatedImage("image/jpeg"), sourcePath = join(home, "fixture-read.jpeg");
    await writeFile(sourcePath, Buffer.from(source.data, "base64"), { mode: 0o600 });
    runner = await startPi(home, provider, false, true, false, true);
    runner.settleUi = () => settleExtensionUi(runner);
    await prompt(runner, { id: "bundle-plain-path", type: "prompt", message: "/synthetic/plain-path.jpeg" });
    await waitFor(() => provider.primary.length === 1, "full bundle plain path primary dispatch", runner);
    const catalog = new Set(provider.primary[0].tools?.map((tool) => tool.function?.name ?? tool.name));
    for (const name of ["read", "image_edit", "image_remix", "subagent_supervisor", "intercom", "observation_inspect"]) assert.equal(catalog.has(name), true, `full bundle omitted ${name}`);
    assert.equal(provider.vision.length, 0, "plain path reached vision");
    assert.equal(hasMedia(provider.primary[0]), false, "plain path primary payload contains media");
    assert.equal(JSON.stringify(provider.primary[0].messages).includes("/synthetic/plain-path.jpeg"), true, "plain path did not reach primary");
    provider.queueBuiltinRead(sourcePath);
    await prompt(runner, { id: "bundle-builtin-read", type: "prompt", message: "[builtin-read]" });
    await waitFor(() => runner.events.some((event) => event.type === "tool_execution_end" && event.toolName === "read"), "built-in read completion", runner);
    const read = runner.events.find((event) => event.type === "tool_execution_end" && event.toolName === "read");
    assert.equal(read.isError, false, "built-in read rejected the synthetic JPEG");
    await waitFor(() => provider.vision.length === 1 && provider.primary.length >= 3, "built-in JPEG mediation", runner);
    assertedVisionPng(provider.vision[0]);
    assert.deepEqual([...new Set(runner.events.filter((event) => event.type === "tool_execution_end").map((event) => event.toolName))].sort(), ["observation_inspect", "read"], "full bundle executed an unexpected tool");
    assert.equal(provider.primary.every((request) => !hasMedia(request)), true, "built-in read leaked media to primary");
    const entries = await rpc(runner, { id: "entries-builtin-read", type: "get_entries" });
    assert.equal(JSON.stringify(entries.entries).includes(source.data), true, "built-in read source bytes were not retained");
    provider.assertHealthy();
    process.stdout.write("pi observations full bundle built-in read: ok\n");
  } catch (error) {
    console.error(`pi observations built-in read diagnostic: ${JSON.stringify(runner?.diagnostics?.() ?? { error: String(error).slice(0, 256) })}`);
    throw error;
  } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
}

async function nativeFormatRegression() {
  const formats = [await generatedImage("image/jpeg"), await generatedImage("image/webp"), await generatedImage("image/gif"), await generatedImage("image/gif", true)];
  for (const source of formats) {
    const home = await mkdtemp(join(tmpdir(), "pi-observations-format-")), provider = await startProvider(); let runner;
    try {
      runner = await startPi(home, provider, false);
      await prompt(runner, { id: `attachment-${source.mimeType}`, type: "prompt", message: "What is in this image?", images: [{ type: "image", ...source }] });
      await waitFor(() => provider.primary.length >= 1 && provider.vision.length === 1, `${source.mimeType} attachment mediation`, runner);
      const normalized = assertedVisionPng(provider.vision[0]);
      assert.notEqual(normalized, source.data, `${source.mimeType} reached vision without normalization`);
      assert.equal(provider.primary.every((request) => !hasMedia(request)), true, `${source.mimeType} leaked to primary`);
      const entries = await rpc(runner, { id: `entries-${source.mimeType}`, type: "get_entries" });
      assert.equal(JSON.stringify(entries.entries).includes(source.data), true, `${source.mimeType} original was not retained`);
      assert.equal(JSON.stringify(provider.primary.at(-1).messages).includes(animatedGifNotice), source.animated, `${source.animated ? "animated" : "static"} GIF notice mismatch`);
      provider.assertHealthy();
    } catch (error) {
      console.error(`pi observations format diagnostic: ${source.mimeType} ${JSON.stringify(runner?.diagnostics?.() ?? { error: String(error).slice(0, 256) })}`);
      throw error;
    } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
  }
  const toolSource = await generatedImage("image/jpeg");
  const home = await mkdtemp(join(tmpdir(), "pi-observations-tool-format-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, false, true, false, false, toolSource);
    await prompt(runner, { id: "jpeg-tool", type: "prompt", message: "[tool-image]" });
    await waitFor(() => provider.vision.length === 1 && provider.primary.length >= 2, "JPEG tool mediation", runner);
    assertedVisionPng(provider.vision[0]);
    assert.equal(provider.primary.every((request) => !hasMedia(request)), true, "JPEG tool leaked to primary");
    const entries = await rpc(runner, { id: "entries-jpeg-tool", type: "get_entries" });
    assert.equal(JSON.stringify(entries.entries).includes(toolSource.data), true, "JPEG tool original was not retained");
    provider.assertHealthy();
  } finally { await stop(runner?.child); await provider.close(); await rm(home, { recursive: true, force: true }); }
  process.stdout.write("pi observations native formats: ok\n");
}
async function suite() {
  if (process.argv.includes("--single")) return main();
  for (const mode of ["--primary-image", "--primary-text-only"]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--single", mode], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    process.stdout.write(child.stdout);
  }
  await registeredBundleRegression();
  await fullBundleBuiltinReadRegression();
  await transformedTextContextRegression();
  await nativeFormatRegression();
}
suite().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

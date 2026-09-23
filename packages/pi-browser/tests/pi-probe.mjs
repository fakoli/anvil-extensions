import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pi = process.env.PI_BINARY || "pi";
const toolNames = ["browser_capture", "browser_resolve", "browser_release", "browser_jev_resolve"];
const observationId = "00000000-0000-0000-0000-000000000001";
const timeout = 12_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hasMedia = (value) => Array.isArray(value) ? value.some(hasMedia) : value && typeof value === "object" ? value.type === "image" || value.type === "image_url" || value.type === "input_image" || Object.hasOwn(value, "image_url") || Object.values(value).some(hasMedia) : typeof value === "string" && /^data:image\//i.test(value);

if (!process.argv.includes("--single")) {
  for (const imageMode of ["0", "1"]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--single"], { cwd: process.cwd(), env: { ...process.env, PI_BROWSER_IMAGE_CAPABLE: imageMode }, encoding: "utf8", timeout: 45_000, killSignal: "SIGKILL" });
    assert.equal(result.error?.code, undefined, `image mode ${imageMode} timed out: ${result.error?.message ?? "unknown"}`);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    process.stdout.write(result.stdout);
  }
  process.stdout.write("pi browser probe: ok (Pi 0.85.1; image modes 0,1)\n");
  process.exit(0);
}

const version = spawnSync(pi, ["--version"], { encoding: "utf8", timeout: 5_000 });
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), "0.85.1", "installed Pi version changed");

function wrapper() {
  const index = JSON.stringify(resolve("packages/pi-browser/index.ts"));
  return `import { createBrowserExtension } from ${index};
const observation = ${JSON.stringify(observationId)};
const emit = (type, value) => console.error("PI_BROWSER_FIXTURE:" + JSON.stringify({type,...value}));
const result = (operation, piSessionId, body) => ({schema:"browser-owner-adapter/v1",status:"ok",operation,binding:{pi_session_id:piSessionId,owner_session_id:"owner-fixture"},page_id:"home",result:body});
export default (pi) => {
  pi.registerProvider("fixture-browser", {name:"fixture-browser",baseUrl:process.env.PI_BROWSER_FIXTURE_URL,apiKey:"fixture",api:"openai-completions",models:[{id:"fixture-browser",name:"fixture-browser",reasoning:false,input:process.env.PI_BROWSER_IMAGE_CAPABLE === "1" ? ["text","image"] : ["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:4096,maxTokens:64}]});
  let captureSession;
  createBrowserExtension(pi, ({piSessionId}) => {
    emit("client", {session:piSessionId});
    return { async execute(request) {
      emit("execute", {session:piSessionId, request});
      if (request.operation === "capture") { captureSession = piSessionId; return result("capture", piSessionId, {observation_id:observation,coverage:{complete:true,omitted_count:0},entities:[{id:"e-1",text:"fixture",source:"dom"}]}); }
      if (request.operation === "resolve") return request.observation_id === observation && piSessionId === captureSession ? result("resolve", piSessionId, {entity_id:request.entity_id,matched:true}) : {schema:"browser-owner-adapter/v1",status:"refused",code:"unknown_observation"};
      if (request.operation === "jev_resolve") return request.observation_id === observation && piSessionId === captureSession ? result("jev_resolve", piSessionId, {outcome:"no_match_inconclusive"}) : {schema:"browser-owner-adapter/v1",status:"refused",code:"unknown_observation"};
      return request.observation_id === observation && piSessionId === captureSession ? result("release", piSessionId, {observation_id:observation,released:true}) : {schema:"browser-owner-adapter/v1",status:"refused",code:"unknown_observation"};
    }, async close() { emit("close", {session:piSessionId}); } };
  });
  pi.on("session_start", (event, ctx) => {
    const browserTools = ["browser_capture","browser_resolve","browser_release","browser_jev_resolve"];
    if (pi.getFlag("browser") && !browserTools.every((name) => pi.getActiveTools().includes(name))) throw new Error("fixture_browser_tools_not_active");
    if (pi.getFlag("browser")) pi.setActiveTools(browserTools);
    emit("active", {reason:event.reason, session:ctx.sessionManager.getHeader()?.id, tools:pi.getActiveTools().sort()});
  });
  pi.registerCommand("fixture_browser_reload", {description:"fixture only", async handler(_args, ctx) { await ctx.reload(); }});
};`;
}

async function startProvider() {
  const requests = []; let flow = 0;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(body);
    const browserRequest = Array.isArray(body.tools) && body.tools.some((tool) => tool?.function?.name === "browser_capture");
    const name = browserRequest ? (flow < 4 ? ["browser_capture", "browser_resolve", "browser_release", "browser_jev_resolve"][flow] : flow === 5 ? "browser_resolve" : undefined) : undefined;
    if (browserRequest) flow += 1;
    const argumentsByTool = {
      browser_capture: { page_id: "home", request: { schema: "widget-resolution/v1", request_id: "fixture-request", target: { description: "fixture browser control", qualifiers: ["fixture"] }, predicates: ["exists", "enabled"], scope: { kind: "document", root: "document" }, require_unique: true, entity_offset: 0 } },
      browser_resolve: { observation_id: observationId, entity_id: "e-1" }, browser_jev_resolve: { observation_id: observationId }, browser_release: { observation_id: observationId },
    };
    const toolCall = name ? { index: 0, id: `fixture-${name}`, type: "function", function: { name, arguments: JSON.stringify(argumentsByTool[name]) } } : undefined;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: toolCall ? { role: "assistant", tool_calls: [toolCall] } : { role: "assistant", content: "fixture complete" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: toolCall ? "tool_calls" : "stop" }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  return { requests, url: `http://127.0.0.1:${server.address().port}/v1`, close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

async function startPi(home, provider, active) {
  const root = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const candidate = "packages/pi-browser/index.ts";
  const extensions = root.pi.extensions.map((entry) => entry.replace(/^\.\//, "")).filter((entry) => entry !== candidate);
  assert.equal(new Set([...extensions, candidate]).size, 14, "full bundle plus candidate must have fourteen unique entries");
  await mkdir(join(home, "agent"), { recursive: true, mode: 0o700 });
  await writeFile(join(home, "agent", "settings.json"), JSON.stringify({ packages: [{ source: resolve("."), extensions, skills: [], prompts: [], themes: [] }] }), { mode: 0o600 });
  await writeFile(join(home, "agent", "pi-browser.json"), JSON.stringify({ browser_executable: "/bin/true", pages: [{ id: "home", url: "https://example.test/" }], jev: { enabled: false }, timeout_ms: 15_000 }), { mode: 0o600 });
  const extension = join(home, "fixture-browser.ts"); await writeFile(extension, wrapper(), { mode: 0o600 });
  const child = spawn(pi, ["--mode", "rpc", "--no-skills", "--no-prompt-templates", "--no-context-files", "--extension", extension, "--provider", "fixture-browser", "--model", "fixture-browser", "--session-dir", join(home, "sessions"), ...(active ? ["--browser"] : [])], { cwd: process.cwd(), env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(home, "agent"), PI_CODING_AGENT_SESSION_DIR: join(home, "sessions"), PI_OFFLINE: "1", PI_BROWSER_FIXTURE_URL: provider.url }, stdio: ["pipe", "pipe", "pipe"] });
  const events = [], fixture = []; let stdout = "", stderr = "", fixtureLines = "", failed;
  const fail = (error) => { failed ??= error instanceof Error ? error : new Error(String(error)); if (child.exitCode === null) child.kill("SIGTERM"); };
  child.once("error", fail); child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; const lines = stdout.split("\n"); stdout = lines.pop(); try { for (const line of lines) if (line) { const event = JSON.parse(line); events.push(event); if (event.type === "extension_error") fail(new Error(`Pi extension error: ${JSON.stringify(event)}`)); } } catch (error) { fail(error); } });
  child.stderr.on("data", (chunk) => { stderr += chunk; fixtureLines += chunk; const lines = fixtureLines.split("\n"); fixtureLines = lines.pop(); for (const line of lines) if (line.startsWith("PI_BROWSER_FIXTURE:")) fixture.push(JSON.parse(line.slice("PI_BROWSER_FIXTURE:".length))); });
  await once(child, "spawn");
  const answered = new Set();
  const settleUi = () => {
    for (const event of events.filter((event) => event.type === "extension_ui_request" && !answered.has(event.id))) {
      const value = event.method === "select" && event.options?.includes("Yes") ? "Yes" : event.method === "confirm" ? true : undefined;
      if (value === undefined) continue;
      answered.add(event.id); child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event.id, value })}\n`);
    }
  };
  const wait = async (predicate, label) => { const stop = Date.now() + timeout; while (!predicate()) { settleUi(); if (failed) throw failed; if (Date.now() > stop) throw new Error(`${label}: ${JSON.stringify({ stderr: stderr.slice(-1000), events: events.slice(-12).map((event) => event.type), ui: events.filter((event) => event.type === "extension_ui_request").slice(-3) })}`); await pause(20); } };
  const rpc = async (id, type, extra = {}) => { child.stdin.write(`${JSON.stringify({ id, type, ...extra })}\n`); await wait(() => events.some((event) => event.id === id && event.type === "response"), type); const response = events.find((event) => event.id === id && event.type === "response"); assert.equal(response.success, true, JSON.stringify(response)); return response.data; };
  const prompt = async (id, message) => { const completed = events.filter((event) => event.type === "agent_end").length; await rpc(id, "prompt", { message }); await wait(() => events.filter((event) => event.type === "agent_end").length > completed, `${id} agent_end`); };
  const stop = async () => { if (child.exitCode !== null) return; const done = once(child, "close"); child.kill("SIGTERM"); await Promise.race([done, pause(2_000)]); if (child.exitCode === null) child.kill("SIGKILL"); };
  return { child, events, fixture, provider, rpc, prompt, stop, wait };
}

async function inactiveProbe() {
  const home = await mkdtemp(join(tmpdir(), "pi-browser-inert-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, false); await runner.wait(() => runner.fixture.some((entry) => entry.type === "active"), "inactive startup");
    const catalog = runner.fixture.find((entry) => entry.type === "active").tools;
    for (const name of toolNames) assert.equal(catalog.includes(name), false, `${name} advertised without --browser`);
    assert.equal(runner.fixture.some((entry) => entry.type === "client"), false, "inactive session created a browser client");
  } finally { await runner?.stop(); await provider.close(); await rm(home, { recursive: true, force: true }); }
}

async function activeProbe() {
  const home = await mkdtemp(join(tmpdir(), "pi-browser-active-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, true); await runner.wait(() => runner.fixture.some((entry) => entry.type === "active"), "active startup"); const state = await runner.rpc("state", "get_state");
    await runner.prompt("flow", "fixture");
    const starts = runner.events.filter((event) => event.type === "tool_execution_start").map((event) => event.toolName).filter((name) => toolNames.includes(name));
    assert.deepEqual(starts, toolNames, "Pi tool order changed");
    const results = runner.events.filter((event) => event.type === "message_end" && event.message?.role === "toolResult" && toolNames.includes(event.message.toolName));
    assert.equal(results.length, 4, "Pi did not persist all tool results");
    for (const result of results) { assert.equal(result.message.content.length, 1); assert.equal(result.message.content[0].type, "text"); assert.ok(Buffer.byteLength(result.message.content[0].text, "utf8") <= 16 * 1024); assert.equal(hasMedia(result.message), false); const receipt = JSON.parse(result.message.content[0].text); assert.equal(receipt.binding?.pi_session_id, state.sessionId); }
    assert.equal(provider.requests.some(hasMedia), false, "provider received browser media");
    const guidance = provider.requests.find((request) => request.tools?.some((tool) => tool?.function?.name === "browser_capture"))?.messages?.find((message) => message.role === "system")?.content;
    assert.match(guidance, /Available page_id values: home/); assert.doesNotMatch(guidance, /example\.test/);
    const calls = runner.fixture.filter((entry) => entry.type === "execute"); assert.deepEqual(calls.map((entry) => entry.request.operation), ["capture", "resolve", "release", "jev_resolve"]); assert.ok(calls.every((entry) => entry.session === state.sessionId), "client used a different Pi session");
    await runner.rpc("new", "new_session"); await runner.wait(() => runner.fixture.filter((entry) => entry.type === "close" && entry.session === state.sessionId).length === 1, "old client cleanup");
    const replacement = await runner.rpc("replacement", "get_state"); assert.notEqual(replacement.sessionId, state.sessionId); await runner.wait(() => runner.fixture.some((entry) => entry.type === "client" && entry.session === replacement.sessionId), "replacement client"); const staleStart = runner.events.length; await runner.prompt("stale", "fixture");
    const staleResult = runner.events.slice(staleStart).find((event) => event.type === "message_end" && event.message?.role === "toolResult" && event.message.toolName === "browser_resolve"); assert.ok(staleResult, JSON.stringify({ requests: provider.requests.length, fixture: runner.fixture.slice(-8), events: runner.events.slice(staleStart).map((event) => event.type) })); assert.deepEqual(JSON.parse(staleResult.message.content[0].text), { schema: "browser-owner-adapter/v1", status: "refused", code: "unknown_observation" }, "old observation was accepted after a new session");
    const beforeFork = runner.fixture.filter((entry) => entry.type === "close").length;
    const entries = await runner.rpc("entries", "get_entries"); const entry = entries.entries.find((item) => item.type === "message" && item.message?.role === "user"); assert.ok(entry?.id, "fixture has no fork point"); const fork = await runner.rpc("fork", "fork", { entryId: entry.id }); assert.equal(fork.cancelled, true, "browser session allowed a fork"); await runner.wait(() => runner.fixture.filter((item) => item.type === "close").length > beforeFork, "fork cleanup");
  } finally { await runner?.stop(); await provider.close(); await rm(home, { recursive: true, force: true }); }
}

async function reloadProbe() {
  const home = await mkdtemp(join(tmpdir(), "pi-browser-reload-")), provider = await startProvider(); let runner;
  try {
    runner = await startPi(home, provider, true); await runner.wait(() => runner.fixture.some((entry) => entry.type === "client"), "reload client");
    const beforeReload = runner.fixture.filter((entry) => entry.type === "close").length;
    await runner.rpc("reload", "prompt", { message: "/fixture_browser_reload" });
    await runner.wait(() => runner.fixture.filter((entry) => entry.type === "close").length > beforeReload, "reload cleanup");
  } finally { await runner?.stop(); await provider.close(); await rm(home, { recursive: true, force: true }); }
}

await inactiveProbe();
await activeProbe();
await reloadProbe();
process.stdout.write(`pi browser native mode ${process.env.PI_BROWSER_IMAGE_CAPABLE}: ok\n`);

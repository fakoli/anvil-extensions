import assert from "node:assert/strict";
import { spawn, spawn as nodeSpawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createBrowserClient, BrowserClientError } from "../client.ts";

const config = Object.freeze({ browser_executable: "/synthetic/chrome", pages: [{ id: "projects", url: "https://example.test/projects" }], jev: { enabled: false }, timeout_ms: 250 });
const code = (value) => (error) => error instanceof BrowserClientError && error.code === value;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function fixture(mode, descendantPath = "") {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-worker-")), path = join(directory, "worker.mjs");
  await writeFile(path, `
const mode = ${JSON.stringify(mode)}, descendantPath = ${JSON.stringify(descendantPath)}; let buffer = "", requestCount = 0, sessionId = "", termCount = 0;
if (mode === "second-term") process.on("SIGTERM", async () => { termCount += 1; await (await import("node:fs/promises")).writeFile(descendantPath, String(termCount)); if (termCount === 2) process.exit(0); });
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (part) => { buffer += part; const lines = buffer.split("\\n"); buffer = lines.pop(); for (const line of lines) { if (!line) continue; const value = JSON.parse(line);
  if (value.type === "init") {
    sessionId = value.session_id;
    if (mode === "leader-exits") { const { spawn } = await import("node:child_process"); const { writeFileSync } = await import("node:fs"); const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio:"ignore" }); writeFileSync(descendantPath, String(descendant.pid)); process.stdout.write(JSON.stringify({type:"ready",version:1,session_id:value.session_id})+"\\n"); process.exit(0); }
    else if (mode === "bad-ready") process.stdout.write('{"type":"ready","version":1}\\n');
    else if (mode === "duplicate-ready") process.stdout.write(JSON.stringify({type:"ready",version:1,session_id:value.session_id})+"\\n"+JSON.stringify({type:"ready",version:1,session_id:value.session_id})+"\\n");
    else if (mode === "partial") process.stdout.write('{"type":"ready","version":1,"session_id":"'+value.session_id+'","extra":true}\\n');
    else if (mode === "raw-overflow") process.stdout.write("x".repeat(17000));
    else if (mode === "start-hang") {}
    else if (mode === "broken-stdin") { process.stdout.write(JSON.stringify({type:"ready",version:1,session_id:value.session_id})+"\\n"); process.stdin.destroy(); setInterval(() => {}, 1000); }
    else process.stdout.write(JSON.stringify({type:"ready",version:1,session_id:value.session_id})+"\\n");
  } else { requestCount += 1; if (mode === "malformed") process.stdout.write("not-json\\n");
  else if (mode === "oversized") process.stdout.write(JSON.stringify({type:"result",id:value.id,result:{x:"x".repeat(16000)}})+"\\n");
  else if (mode === "wrong-result") process.stdout.write(JSON.stringify({type:"result",id:value.id,result:{schema:"browser-owner-adapter/v1",status:"ok",operation:"release",binding:{pi_session_id:"other",owner_session_id:"owner"},page_id:"projects",result:{}}})+"\\n");
  else if (mode === "switched-owner") process.stdout.write(JSON.stringify({type:"result",id:value.id,result:{schema:"browser-owner-adapter/v1",status:"ok",operation:value.request.operation,binding:{pi_session_id:sessionId,owner_session_id:requestCount === 1 ? "owner-a" : "owner-b"},page_id:"projects",result:{}}})+"\\n");
  else if (mode === "late") setTimeout(() => process.stdout.write(JSON.stringify({type:"result",id:value.id,result:{schema:"browser-owner-adapter/v1",status:"ok",operation:value.request.operation,binding:{pi_session_id:value.session_id,owner_session_id:"owner"},page_id:"projects",result:{}}})+"\\n"), 500);
  else if (mode === "hang" || mode === "leader-exits") {}
  else process.stdout.write(JSON.stringify({type:"result",id:value.id,result:{schema:"browser-owner-adapter/v1",status:"ok",operation:value.request.operation,binding:{pi_session_id:"session-1",owner_session_id:"owner"},page_id:"projects",result:{}}})+"\\n"); }
} });
`);
  return { directory, path };
}
async function withClient(mode, run) {
  const worker = await fixture(mode), client = createBrowserClient({ piSessionId: "session-1", trustedConfig: config, workerPath: worker.path });
  try { await run(client); } finally { await client.close(); await rm(worker.directory, { recursive: true, force: true }); }
}
async function runWorker(input, end = false) {
  const child = spawn("node", [resolve("worker.mjs")], { cwd: resolve(".."), stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", (part) => { output += part; });
  child.stdin.write(input); if (end) child.stdin.end(); const [exit] = await once(child, "close"); child.stdin.end(); return { exit, output };
}

test("uses external Node default and one bounded request at a time", async () => {
  await withClient("ok", async (client) => {
    assert.equal((await client.execute({ operation: "release", observation_id: "00000000-0000-0000-0000-000000000000" })).status, "ok");
    assert.equal((await client.execute({ operation: "release", observation_id: "00000000-0000-0000-0000-000000000001" })).binding.pi_session_id, "session-1");
  });
});

test("binds ready frames to the Pi session and rejects duplicate or malformed protocol frames", async () => {
  for (const mode of ["bad-ready", "partial", "duplicate-ready", "raw-overflow", "malformed", "oversized", "wrong-result"]) {
    await withClient(mode, async (client) => { await assert.rejects(client.execute({ operation: "release", observation_id: "o-1" }), code("worker_protocol")); });
  }
});

test("rejects a changed owner binding after the first successful owner result", async () => {
  await withClient("switched-owner", async (client) => {
    await client.execute({ operation: "release", observation_id: "o-1" });
    await assert.rejects(client.execute({ operation: "release", observation_id: "o-2" }), code("worker_protocol"));
  });
});

test("a broken worker stdin fails closed and completes teardown", async () => {
  const worker = await fixture("ok"), client = createBrowserClient({ piSessionId: "session-1", trustedConfig: config, workerPath: worker.path, spawn: (...args) => { const child = nodeSpawn(...args); child.stdin.destroy(); return child; } });
  try { await assert.rejects(client.execute({ operation: "release", observation_id: "o-1" }), code("worker_protocol")); await client.close(); }
  finally { await client.close(); await rm(worker.directory, { recursive: true, force: true }); }
});

test("cancellation, startup cancellation, deadline, and close reject without accepting late work", async () => {
  await withClient("late", async (client) => {
    const controller = new AbortController(), pending = client.execute({ operation: "release", observation_id: "o-1" }, { signal: controller.signal }); setTimeout(() => controller.abort(), 30);
    await assert.rejects(pending, code("cancelled")); await wait(550);
  });
  await withClient("start-hang", async (client) => {
    const controller = new AbortController(), pending = client.execute({ operation: "release", observation_id: "o-1" }, { signal: controller.signal }); controller.abort();
    await assert.rejects(pending, code("cancelled"));
  });
  await withClient("hang", async (client) => {
    const pending = client.execute({ operation: "release", observation_id: "o-1" });
    await assert.rejects(client.execute({ operation: "release", observation_id: "o-1" }), code("worker_protocol")); await assert.rejects(pending, code("deadline_exceeded"));
  });
});

test("close reaps a detached worker group after its leader exits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-group-")), pidPath = join(directory, "descendant.pid"), worker = await fixture("leader-exits", pidPath);
  const client = createBrowserClient({ piSessionId: "session-1", trustedConfig: config, workerPath: worker.path });
  try {
    await assert.rejects(client.execute({ operation: "release", observation_id: "o-1" }), code("worker_unavailable"));
    await client.close();
    const pid = Number((await (await import("node:fs/promises")).readFile(pidPath, "utf8")).trim());
    await wait(50); assert.throws(() => process.kill(pid, 0));
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); await rm(worker.directory, { recursive: true, force: true }); }
});

test("close sends a second TERM before the retained worker-group KILL fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-browser-second-term-")), termPath = join(directory, "terms"), worker = await fixture("second-term", termPath);
  const client = createBrowserClient({ piSessionId: "session-1", trustedConfig: config, workerPath: worker.path });
  try {
    await client.execute({ operation: "release", observation_id: "o-1" });
    await client.close();
    assert.equal((await readFile(termPath, "utf8")).trim(), "2");
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); await rm(worker.directory, { recursive: true, force: true }); }
});

test("real worker rejects partial, oversized, and extra initialization frames before imports", async () => {
  for (const line of ["{}\n", `${"x".repeat(17000)}\n`, '{"type":"init","version":1,"session_id":"s","config":{},"extra":true}\n']) {
    const result = await runWorker(line); assert.equal(result.exit, 64); assert.equal(result.output, "");
  }
});

test("real worker rejects a partial EOF frame", async () => {
  const result = await runWorker('{"type":"init"', true); assert.equal(result.exit, 64); assert.equal(result.output, "");
});

test("rejects untrusted configuration before launch", () => {
  assert.throws(() => createBrowserClient({ piSessionId: "bad session", trustedConfig: config }), code("invalid_config"));
  assert.throws(() => createBrowserClient({ piSessionId: "session", trustedConfig: { ...config, browser_executable: "chrome" } }), code("invalid_config"));
  assert.throws(() => createBrowserClient({ piSessionId: "session", trustedConfig: { ...config, extra: true } }), code("invalid_config"));
});

import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const servingSource = process.env.PI_BROWSER_SERVING_SOURCE;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capture = (page_id, request_id) => ({ operation: "capture", page_id, request: { schema: "widget-resolution/v1", request_id, target: { description: "fixture control", qualifiers: [] }, predicates: ["exists", "enabled"], scope: { kind: "document", root: "document" }, require_unique: false, entity_offset: 0 } });
const fixtureHtml = "<!doctype html><main><button aria-label=fixture-control>Fixture control</button></main>";
const require = createRequire(import.meta.url);

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
async function readable(path) { await access(path, constants.R_OK); return path; }
async function executable(path) { await access(path, constants.X_OK); return path; }
async function chromePath() {
  for (const path of [process.env.PI_BROWSER_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium"]) if (typeof path === "string") try { return await executable(path); } catch {}
  throw new Error("Chrome or Chromium executable is required for chromium-cleanup.mjs");
}
async function proc(pid) {
  try {
    const [stat, cmdline] = await Promise.all([readFile(`/proc/${pid}/stat`, "utf8"), readFile(`/proc/${pid}/cmdline`)]);
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/);
    return { pid, state: fields[0], ppid: Number(fields[1]), start: fields[19], cmd: cmdline.toString("utf8").replaceAll("\0", " ").trim() };
  } catch { return undefined; }
}
async function table() { return (await Promise.all((await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map((name) => proc(Number(name))))).filter(Boolean); }
function descendants(rows, parent) {
  const children = new Map(), found = new Map();
  for (const row of rows) { const list = children.get(row.ppid) ?? []; list.push(row); children.set(row.ppid, list); }
  const visit = (pid) => { for (const row of children.get(pid) ?? []) if (!found.has(row.pid)) { found.set(row.pid, row); visit(row.pid); } };
  visit(parent); return [...found.values()];
}
async function alive(identity) { const current = await proc(identity.pid); return Boolean(current && current.start === identity.start); }
async function survivors(identities) { const result = []; for (const identity of identities) if (await alive(identity)) result.push(identity); return result; }
async function waitGone(identities, timeout = 5_000) {
  const end = Date.now() + timeout;
  do { const remaining = await survivors(identities); if (!remaining.length) return []; await pause(25); } while (Date.now() < end);
  return survivors(identities);
}
async function signal(identity, name) { if (await alive(identity)) try { process.kill(identity.pid, name); } catch {} }
async function cleanup(identities) {
  // The stopped-browser assertion must happen before this recovery path resumes it.
  for (const identity of identities) await signal(identity, "SIGCONT");
  for (const identity of identities) await signal(identity, "SIGTERM");
  if ((await waitGone(identities, 1_000)).length) for (const identity of identities) await signal(identity, "SIGKILL");
  await waitGone(identities, 1_000);
}
function sourceFiles() {
  if (servingSource) {
    if (!servingSource.startsWith("/")) throw new Error("PI_BROWSER_SERVING_SOURCE must be an absolute path");
    const root = resolve(servingSource);
    return { adapter: join(root, "browser_owner", "live_adapter.mjs"), transport: join(root, "browser_owner", "live_transport.mjs"), playwright: join(root, "browser_owner", "node_modules", "playwright") };
  }
  const adapter = require.resolve("@anvil-serving/observations/browser");
  return { adapter, transport: join(dirname(adapter), "live_transport.mjs"), playwright: dirname(require.resolve("playwright/package.json")) };
}
async function isolatedHarness() {
  const files = sourceFiles();
  const client = join(packageDirectory, "client.ts"), worker = join(packageDirectory, "worker.mjs");
  await Promise.all([readable(files.adapter), readable(files.transport), readable(join(files.playwright, "package.json"))]);
  const version = JSON.parse(await readFile(join(files.playwright, "package.json"), "utf8")).version;
  assert.equal(version, "1.63.0", "the cleanup regression requires pinned Playwright 1.63.0");
  let directory;
  try {
  directory = await mkdtemp(join(tmpdir(), "pi-browser-chromium-cleanup-"));
  const copied = join(directory, "package");
  const nodeModules = join(directory, "node_modules");
  await mkdir(copied, { recursive: true });
  await Promise.all([copyFile(client, join(copied, "client.ts")), copyFile(worker, join(copied, "worker.mjs"))]);
  for (const name of ["client.ts", "worker.mjs"]) assert.equal(digest(await readFile(join(packageDirectory, name))), digest(await readFile(join(copied, name))), `copied ${name} diverged from production`);
  await mkdir(join(nodeModules, "@anvil-serving"), { recursive: true });
  await symlink(files.playwright, join(nodeModules, "playwright"), "dir");
  await symlink(join(dirname(files.playwright), "playwright-core"), join(nodeModules, "playwright-core"), "dir");
  const observations = join(nodeModules, "@anvil-serving", "observations");
  await mkdir(observations);
  await writeFile(join(observations, "package.json"), JSON.stringify({ name: "@anvil-serving/observations", private: true, type: "module", exports: { "./browser": "./browser.mjs" } }) + "\n");
  await writeFile(join(observations, "browser.mjs"), `import { EventEmitter } from "node:events";
import { createLiveObservationAdapter as productionAdapter } from ${JSON.stringify(pathToFileURL(files.adapter).href)};
import { createLiveBufferedTransport } from ${JSON.stringify(pathToFileURL(files.transport).href)};
const html = ${JSON.stringify(fixtureHtml)};
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
function response() { const value = new EventEmitter(); value.statusCode = 200; value.headers = { "content-type": "text/html" }; value.rawHeaders = ["content-type", "text/html"]; value.destroyed = false; value.destroy = () => { value.destroyed = true; }; queueMicrotask(() => { if (!value.destroyed) { value.emit("data", Buffer.from(html)); value.emit("end"); } }); return value; }
async function transportFactory({ documentUrls }) { return createLiveBufferedTransport({ documentUrls, lookup, request: (url, options, callback) => { const outgoing = new EventEmitter(); outgoing.destroyed = false; outgoing.destroy = () => { outgoing.destroyed = true; }; outgoing.end = () => { if (url.pathname === "/slow") setTimeout(() => { if (!outgoing.destroyed) callback(response()); }, 5_000); else if (!outgoing.destroyed) callback(response()); }; return outgoing; } }); }
export async function createLiveObservationAdapter(config) { return productionAdapter(config, { transportFactory }); }
`);
  const clientModule = await import(pathToFileURL(join(copied, "client.ts")).href);
  return { directory, clientModule, worker: join(copied, "worker.mjs"), playwright: version };
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

assert.equal(process.platform, "linux", "chromium cleanup is a Linux regression");
assert.equal(Number(process.versions.node.split(".")[0]), 24, "chromium cleanup requires Node 24");
const chrome = await chromePath();
const harness = await isolatedHarness();
const { createBrowserClient, BrowserClientError } = harness.clientModule;
const pages = Object.freeze([{ id: "home", url: "https://fixture.example/" }, { id: "slow", url: "https://fixture.example/slow" }]);
const config = Object.freeze({ browser_executable: chrome, pages, jev: Object.freeze({ enabled: false }), timeout_ms: 5_000 });
const results = [];
const identities = [];
let activeWorker;
function remember(entries) {
  for (const entry of entries) if (!identities.some((known) => known.pid === entry.pid && known.start === entry.start)) identities.push(entry);
}
const watchdog = setTimeout(() => { void (async () => {
  if (activeWorker) { const worker = await activeWorker; if (worker) remember([worker]); }
  await cleanup(identities);
  process.exit(1);
})(); }, 45_000);
watchdog.unref();

try {
  async function client(label) {
    let workerIdentity;
    const value = createBrowserClient({ piSessionId: `cleanup-${label}`, trustedConfig: config, workerPath: harness.worker, spawn: (...args) => {
      const child = nodeSpawn(...args);
      workerIdentity = proc(child.pid); // Bind the exact test worker before it can spawn Chromium.
      activeWorker = workerIdentity.then((identity) => { if (identity) remember([identity]); return identity; });
      return child;
    } });
    return { value, worker: async () => { assert.ok(workerIdentity, "test worker was not spawned"); const identity = await workerIdentity; assert.ok(identity, "test worker exited before its identity was bound"); assert.equal(await alive(identity), true, "test worker identity changed before descendant traversal"); return identity; } };
  }
  async function warm(value, page = "home") { return value.execute(capture(page, `request-${page}`)); }
  function assertWarm(result) { assert.equal(result.status, "ok"); assert.equal(result.operation, "capture"); assert.equal(result.result.entities[0]?.text, "Fixture control"); }
  async function snapshot(worker) {
    assert.equal(await alive(worker), true, "test worker identity changed before descendant traversal");
    const rows = await table(), owned = [worker, ...descendants(rows, worker.pid)];
    const browser = owned.find((entry) => entry.cmd.includes("--remote-debugging-pipe") && !entry.cmd.includes("--type="));
    assert.ok(browser, "the captured worker did not launch Chromium");
    remember(owned);
    return { browser, owned };
  }
  async function run(name, body) {
    try { await body(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); throw error; }
  }
  await run("normal_close", async () => {
    const { value, worker } = await client("normal");
    try { const result = await warm(value); const owned = await snapshot(await worker()); assertWarm(result); await value.close(); assert.deepEqual(await waitGone(owned.owned), []); } finally { await value.close().catch(() => {}); }
  });
  await run("cancelled_capture", async () => {
    const { value, worker } = await client("cancel");
    try { const result = await warm(value); const owned = await snapshot(await worker()); assertWarm(result); await assert.rejects(value.execute(capture("slow", "request-slow"), { signal: AbortSignal.timeout(100) }), (error) => error instanceof BrowserClientError && error.code === "cancelled"); assert.deepEqual(await waitGone(owned.owned), []); } finally { await value.close().catch(() => {}); }
  });
  await run("raw_worker_sigkill", async () => {
    const { value, worker } = await client("sigkill");
    try { const result = await warm(value); const owned = await snapshot(await worker()); assertWarm(result); await signal(await worker(), "SIGKILL"); assert.deepEqual(await waitGone(owned.owned), []); } finally { await value.close().catch(() => {}); }
  });
  await run("stopped_browser_second_term", async () => {
    const { value, worker } = await client("stopped");
    try {
      const result = await warm(value); const owned = await snapshot(await worker()); assertWarm(result);
      await signal(owned.browser, "SIGSTOP"); await pause(50); assert.equal((await proc(owned.browser.pid))?.state, "T");
      await value.close();
      // This must pass before finally invokes SIGCONT for any failed cleanup.
      assert.deepEqual(await waitGone(owned.owned, 1_000), []);
    } finally { await value.close().catch(() => {}); }
  });
  process.stdout.write(`${JSON.stringify({ chromium_cleanup: "ok", node: process.version, platform: process.platform, configured_chrome: chrome, pinned_playwright: harness.playwright, cases: results })}\n`);
} finally {
  clearTimeout(watchdog);
  await cleanup(identities);
  await rm(harness.directory, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { access, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createBrowserClient, BrowserClientError } from "../client.ts";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(packageDirectory, "../..");
const nodeModules = join(workspaceDirectory, "node_modules");
const observationsLink = join(nodeModules, "@anvil-serving", "observations");
const servingSource = process.env.PI_BROWSER_SERVING_SOURCE;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capture = (page_id, request_id) => ({ operation: "capture", page_id, request: { schema: "widget-resolution/v1", request_id, target: { description: "fixture control", qualifiers: [] }, predicates: ["exists", "enabled"], scope: { kind: "document", root: "document" }, require_unique: false, entity_offset: 0 } });
const fixtureHtml = "<!doctype html><main><button aria-label=fixture-control>Fixture control</button></main>";
let shimDirectory;
let shimLinkCreated = false;

async function exists(path) { try { await lstat(path); return true; } catch { return false; } }
async function chromePath() {
  for (const path of [process.env.PI_BROWSER_CHROME, "/usr/bin/google-chrome", "/usr/bin/chromium"]) if (typeof path === "string") try { await access(path, constants.X_OK); return path; } catch {}
  throw new Error("Chrome or Chromium executable is required for chromium-cleanup.mjs");
}
async function installSourceShim() {
  try { createRequire(import.meta.url).resolve("playwright"); }
  catch { throw new Error("the pinned Playwright dependency is required for chromium-cleanup.mjs"); }
  if (!servingSource) {
    try { createRequire(import.meta.url).resolve("@anvil-serving/observations/browser"); return; }
    catch { throw new Error("set PI_BROWSER_SERVING_SOURCE to a reviewed Serving source before its package pin is installed"); }
  }
  if (!servingSource.startsWith("/")) throw new Error("PI_BROWSER_SERVING_SOURCE must be an absolute path");
  if (!await exists(nodeModules)) throw new Error("a temporary or installed node_modules directory is required for the test-only Serving source");
  if (await exists(observationsLink)) throw new Error("refusing to replace an installed observations package");
  const adapter = join(resolve(servingSource), "browser_owner", "live_adapter.mjs");
  const transport = join(resolve(servingSource), "browser_owner", "live_transport.mjs");
  await Promise.all([access(adapter, constants.R_OK), access(transport, constants.R_OK)]);
  shimDirectory = await mkdtemp(join(tmpdir(), "pi-browser-serving-shim-"));
  await writeFile(join(shimDirectory, "package.json"), JSON.stringify({ name: "@anvil-serving/observations", private: true, type: "module", exports: { "./browser": "./browser.mjs" } }) + "\n");
  await writeFile(join(shimDirectory, "browser.mjs"), `import { EventEmitter } from "node:events";
import { createLiveObservationAdapter as productionAdapter } from ${JSON.stringify(pathToFileURL(adapter).href)};
import { createLiveBufferedTransport } from ${JSON.stringify(pathToFileURL(transport).href)};
const html = ${JSON.stringify(fixtureHtml)};
const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
function response() { const value = new EventEmitter(); value.statusCode = 200; value.headers = { "content-type": "text/html" }; value.rawHeaders = ["content-type", "text/html"]; value.destroyed = false; value.destroy = () => { value.destroyed = true; }; queueMicrotask(() => { if (!value.destroyed) { value.emit("data", Buffer.from(html)); value.emit("end"); } }); return value; }
async function transportFactory({ documentUrls }) { return createLiveBufferedTransport({ documentUrls, lookup, request: (url, options, callback) => { const outgoing = new EventEmitter(); outgoing.destroyed = false; outgoing.destroy = () => { outgoing.destroyed = true; }; outgoing.end = () => { if (url.pathname === "/slow") setTimeout(() => { if (!outgoing.destroyed) callback(response()); }, 5_000); else if (!outgoing.destroyed) callback(response()); }; return outgoing; } }); }
export async function createLiveObservationAdapter(config) { return productionAdapter(config, { transportFactory }); }
`);
  await mkdir(dirname(observationsLink), { recursive: true });
  const { symlink } = await import("node:fs/promises");
  await symlink(shimDirectory, observationsLink, "dir");
  shimLinkCreated = true;
}
async function removeSourceShim() {
  if (shimLinkCreated) await rm(observationsLink, { recursive: true, force: true });
  if (shimDirectory) await rm(shimDirectory, { recursive: true, force: true });
}
async function proc(pid) {
  try {
    const [stat, cmdline] = await Promise.all([readFile(`/proc/${pid}/stat`, "utf8"), readFile(`/proc/${pid}/cmdline`)]);
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/);
    return { pid: Number(pid), state: fields[0], ppid: Number(fields[1]), pgid: Number(fields[2]), start: fields[19], cmd: cmdline.toString("utf8").replaceAll("\0", " ").trim() };
  } catch { return undefined; }
}
async function table() { return (await Promise.all((await readdir("/proc")).filter((name) => /^\d+$/.test(name)).map(proc))).filter(Boolean); }
function descendants(rows, parent) {
  const children = new Map();
  for (const row of rows) { const list = children.get(row.ppid) ?? []; list.push(row); children.set(row.ppid, list); }
  const seen = new Map();
  const visit = (pid) => { for (const row of children.get(pid) ?? []) if (!seen.has(row.pid)) { seen.set(row.pid, row); visit(row.pid); } };
  visit(parent); return [...seen.values()];
}
async function alive(identity) { const current = await proc(identity.pid); return Boolean(current && current.start === identity.start); }
async function survivors(identities) { const result = []; for (const identity of identities) if (await alive(identity)) result.push(identity); return result; }
async function waitGone(identities, timeout = 5_000) {
  const end = Date.now() + timeout;
  let remaining;
  do { remaining = await survivors(identities); if (!remaining.length) return remaining; await pause(25); } while (Date.now() < end);
  return remaining;
}
async function signal(identity, name) { if (await alive(identity)) try { process.kill(identity.pid, name); } catch {} }
async function cleanup(identities) {
  for (const identity of identities) await signal(identity, "SIGCONT");
  for (const identity of identities) await signal(identity, "SIGTERM");
  if ((await waitGone(identities, 1_000)).length) for (const identity of identities) await signal(identity, "SIGKILL");
  await waitGone(identities, 1_000);
}
async function ownedWorkerAndBrowser(workerPath, timeout = 5_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const rows = await table();
    const worker = rows.find((row) => row.cmd.includes(workerPath));
    if (worker) {
      const owned = descendants(rows, worker.pid);
      const browser = owned.find((row) => row.cmd.includes("--remote-debugging-pipe") && !row.cmd.includes("--type="));
      if (browser) return { worker, browser, owned: [worker, ...owned] };
    }
    await pause(25);
  }
  throw new Error("production worker and Chromium process were not found");
}

const results = [];
try {
  await installSourceShim();
  const chrome = await chromePath();
  const pages = Object.freeze([{ id: "home", url: "https://fixture.example/" }, { id: "slow", url: "https://fixture.example/slow" }]);
  const config = Object.freeze({ browser_executable: chrome, pages, jev: Object.freeze({ enabled: false }), timeout_ms: 5_000 });
  const workerPath = resolve(packageDirectory, "worker.mjs");
  async function run(name, body) {
    let identities = [];
    try { await body((value) => { identities = value; }); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) }); throw error; }
    finally { await cleanup(identities); }
  }
  async function client(label) { return createBrowserClient({ piSessionId: `cleanup-${label}`, trustedConfig: config }); }
  async function warm(value, page = "home") {
    const result = await value.execute(capture(page, `request-${page}`));
    assert.equal(result.status, "ok"); assert.equal(result.operation, "capture"); assert.equal(result.result.entities[0]?.text, "Fixture control");
  }
  await run("normal_close", async (setIdentities) => {
    const value = await client("normal");
    try { await warm(value); const snapshot = await ownedWorkerAndBrowser(workerPath); setIdentities(snapshot.owned); await value.close(); assert.equal((await waitGone(snapshot.owned)).length, 0); } finally { await value.close().catch(() => {}); }
  });
  await run("cancelled_capture", async (setIdentities) => {
    const value = await client("cancel");
    try { await warm(value); const snapshot = await ownedWorkerAndBrowser(workerPath); setIdentities(snapshot.owned); await assert.rejects(value.execute(capture("slow", "request-slow"), { signal: AbortSignal.timeout(100) }), (error) => error instanceof BrowserClientError && error.code === "cancelled"); assert.equal((await waitGone(snapshot.owned)).length, 0); } finally { await value.close().catch(() => {}); }
  });
  await run("raw_worker_sigkill", async (setIdentities) => {
    const value = await client("sigkill");
    try { await warm(value); const snapshot = await ownedWorkerAndBrowser(workerPath); setIdentities(snapshot.owned); await signal(snapshot.worker, "SIGKILL"); assert.equal((await waitGone(snapshot.owned)).length, 0); } finally { await value.close().catch(() => {}); }
  });
  await run("stopped_browser_second_term", async (setIdentities) => {
    const value = await client("stopped");
    try {
      await warm(value); const snapshot = await ownedWorkerAndBrowser(workerPath); setIdentities(snapshot.owned);
      await signal(snapshot.browser, "SIGSTOP"); await pause(50); assert.equal((await proc(snapshot.browser.pid))?.state, "T");
      await value.close();
      // This assertion deliberately precedes the finally-block SIGCONT cleanup.
      assert.equal((await waitGone(snapshot.owned, 1_000)).length, 0);
    } finally { await value.close().catch(() => {}); }
  });
  process.stdout.write(`${JSON.stringify({ chromium_cleanup: "ok", cases: results.map(({ name, ok }) => ({ name, ok })) })}\n`);
} finally { await removeSourceShim(); }

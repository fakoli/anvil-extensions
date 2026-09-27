// pi-anvil-pulse tests. Plain node + jiti (bundle convention).
// Covers: the ESM server (spawned with a fake `anvil` shim + fixture events),
// the process-management port (start/check/stop + PID identity guards), and
// the extension factory's tool/command registration.
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? (() => {
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

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(fileURLToPath(new URL("../index.ts", import.meta.url)), {
  moduleCache: false,
  interopDefault: true,
  alias: {
    typebox: `${PI_INSTALL_DIR}/node_modules/typebox/build/index.mjs`,
    "@earendil-works/pi-coding-agent": PI_INSTALL_DIR,
  },
});

const SERVER = join(PKG_ROOT, "src", "server.mjs");
const { startPulse, checkPulse, stopPulse, isOurServer, readPid, SERVER_PATH } =
  await jiti.import("./src/process.ts");

let passed = 0;
let failed = 0;
function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok - ${name}`);
    })
    .catch((e) => {
      failed++;
      console.error(`  FAIL - ${name}: ${e.message}`);
    });
}

// ---------- fixtures ---------------------------------------------------------

function makeFakeAnvilProject() {
  const dir = mkdtempSync(join(tmpdir(), "pulse-proj-"));
  // fake `anvil` CLI: emits a fixed status envelope for any args
  mkdirSync(join(dir, "bin"), { recursive: true });
  const shim = join(dir, "bin", "anvil");
  writeFileSync(
    shim,
    `#!/bin/sh
cat <<'EOF'
{"ok":true,"data":{"tasks":{"ready":2,"in_progress":3,"needs_review":1,"blocked":0,"done":5},"claims":[
 {"task_id":"T001","actor":"agent-a","phase":"executing","elapsed_seconds":120,"lease_expires_in_seconds":300},
 {"task_id":"T002","actor":"agent-b","phase":"verifying","elapsed_seconds":90,"lease_expires_in_seconds":60},
 {"task_id":"T003","actor":"agent-c","phase":"executing","elapsed_seconds":60,"lease_expires_in_seconds":-5}
]}}
EOF
`,
    { mode: 0o755 },
  );
  // explicit state dir with a recent event for T001 and a stale one for T002
  const stateDir = join(dir, "state");
  mkdirSync(stateDir, { recursive: true });
  const now = new Date();
  const recent = new Date(now.getTime() - 30_000).toISOString();
  const stale = new Date(now.getTime() - 600_000).toISOString();
  writeFileSync(
    join(stateDir, "events.jsonl"),
    // append-only chronological order, as real anvil writes it:
    // stale T002 event first, recent T001 event last
    [
      JSON.stringify({ timestamp: stale, action: "progress.noted", actor: "agent-b", target_id: "T002", payload_json: { phase: "verifying" } }),
      JSON.stringify({ timestamp: recent, action: "progress.noted", actor: "agent-a", target_id: "T001", payload_json: { phase: "executing", detail: "running tests" } }),
    ].join("\n") + "\n",
  );
  return { dir, stateDir, shim };
}

function startServer(env, readyLines = 1) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER, "--pulse-project", env.PULSE_PROJECT_DIR], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let buf = "";
    let lines = 0;
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const nl = buf.lastIndexOf("\n");
      if (nl >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.includes("server-started")) {
          lines++;
          if (lines >= readyLines) resolve({ child, started: JSON.parse(line) });
        }
      }
    });
    child.on("error", reject);
    setTimeout(() => reject(new Error("server did not start within 5s")), 5000).unref();
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await sleep(300);
  if (child.exitCode === null) child.kill("SIGKILL");
}

// ---------- server behavior ---------------------------------------------------

{
  const { dir, stateDir, shim } = makeFakeAnvilProject();
  console.log("# server");
  const { child, started } = await startServer({
    PULSE_PROJECT_DIR: dir,
    PULSE_STATE_DIR: stateDir,
    PULSE_ANVIL_BIN: shim,
    PULSE_HOST: "127.0.0.1",
    PULSE_PORT: "0",
    PATH: join(dir, "bin") + ":" + process.env.PATH,
  });
  const base = `http://localhost:${started.port}`;

  await ok("serves the dashboard page", async () => {
    const res = await fetch(base + "/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const html = await res.text();
    assert.match(html.toLowerCase(), /pulse/, "dashboard html names the pulse dashboard");
  });

  await ok("healthz reports ok", async () => {
    const res = await fetch(base + "/healthz");
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  await ok("pulse api classifies claim staleness from events + lease", async () => {
    const res = await fetch(base + "/api/pulse");
    const body = await res.json();
    assert.equal(body.status_ok, true);
    assert.equal(body.active_claims, 3);
    const byTask = Object.fromEntries(body.claims.map((c) => [c.task_id, c]));
    assert.equal(byTask.T001.staleness, "healthy", "recent event → healthy");
    assert.equal(byTask.T002.staleness, "quiet", "10m silent → quiet");
    assert.equal(byTask.T003.staleness, "lease-expired", "negative lease → lease-expired");
    assert.equal(byTask.T001.last_activity_seconds, 30);
    assert.ok(body.events.length >= 2, "events included");
    assert.equal(body.events[0].target_id, "T001", "newest first");
  });

  await ok("per-request threshold retuning works", async () => {
    const res = await fetch(base + "/api/pulse?quiet_seconds=10&wedged_seconds=60");
    const body = await res.json();
    const byTask = Object.fromEntries(body.claims.map((c) => [c.task_id, c]));
    assert.equal(byTask.T001.staleness, "quiet", "30s > 10s quiet threshold");
  });

  await ok("unknown paths 404, non-GET 405", async () => {
    assert.equal((await fetch(base + "/nope")).status, 404);
    assert.equal((await fetch(base + "/healthz", { method: "POST" })).status, 405);
  });

  await stopServer(child);
  rmSync(dir, { recursive: true, force: true });
}

{
  // no events.jsonl → warning, feed disabled
  const { dir, shim } = makeFakeAnvilProject();
  rmSync(join(dir, "state"), { recursive: true, force: true });
  console.log("# server (no events)");
  const { child, started } = await startServer({
    PULSE_PROJECT_DIR: dir,
    PULSE_ANVIL_BIN: shim,
    PULSE_HOST: "127.0.0.1",
    PULSE_PORT: "0",
    PATH: join(dir, "bin") + ":" + process.env.PATH,
  });
  const base = `http://localhost:${started.port}`;
  await ok("missing events.jsonl degrades with a warning", async () => {
    const body = await (await fetch(base + "/api/pulse")).json();
    assert.equal(body.active_claims, 3);
    assert.equal(body.events.length, 0);
    assert.ok(body.warnings.some((w) => w.includes("events.jsonl not found")));
    // no event evidence → staleness falls back to claim age
    const byTask = Object.fromEntries(body.claims.map((c) => [c.task_id, c]));
    assert.equal(byTask.T001.staleness, "healthy", "young claim age → healthy");
  });
  await stopServer(child);
  rmSync(dir, { recursive: true, force: true });
}

// ---------- process management (start/check/stop port) ------------------------

console.log("# process management");
{
  const { dir, stateDir, shim } = makeFakeAnvilProject();
  const env = { PULSE_ANVIL_BIN: shim, PULSE_STATE_DIR: stateDir };
  // startPulse spawns the real server with env; point it at our fixture
  const started = await startPulse({ project: dir }).catch(() => null);
  // startPulse uses the default `anvil` on PATH unless PULSE_ANVIL_BIN is set;
  // the server tolerates a missing anvil (status error warning), so this works.
  assert.ok(started, "startPulse should succeed without an anvil CLI (degraded)");
  const result = started;

  await ok("startPulse writes pid file and returns url", async () => {
    assert.match(result.url, /^http:\/\/localhost:\d+\/$/);
    assert.ok(existsSync(join(dir, ".anvil-pulse", "server.pid")));
  });

  await ok("checkPulse reports running with url", async () => {
    const c = await checkPulse(dir);
    assert.equal(c.running, true);
    assert.equal(c.url, result.url);
  });

  await ok("isOurServer verifies our pid, rejects self pid 1", async () => {
    assert.equal(isOurServer(result.pid, dir), true);
    assert.equal(isOurServer(1, dir), false);
    assert.equal(isOurServer(0, dir), false);
  });

  await ok("stopPulse stops the verified server and cleans the pid file", async () => {
    const s = await stopPulse(dir);
    assert.equal(s.pid, result.pid);
    assert.equal(existsSync(join(dir, ".anvil-pulse", "server.pid")), false);
    await sleep(200);
    assert.equal(isOurServer(result.pid, dir), false);
  });

  await ok("checkPulse after stop reports not running", async () => {
    const c = await checkPulse(dir);
    assert.equal(c.running, false);
  });

  await ok("restart reports the NEW server's URL, not the previous one", async () => {
    // Regression: the log used to be appended, so readStartedLine returned the
    // first (stale) server-started line after a stop→start cycle.
    const restarted = await startPulse({ project: dir });
    try {
      assert.notEqual(restarted.url, result.url);
      const c = await checkPulse(dir);
      assert.equal(c.running, true);
      assert.equal(c.url, restarted.url);
      assert.equal(c.pid, restarted.pid);
    } finally {
      await stopPulse(dir);
    }
  });

  await ok("stale/foreign pid file is reported unverified and cleaned, never signalled", async () => {
    // our own test process pid in the file: not a pulse server → unverified
    writeFileSync(join(dir, ".anvil-pulse", "server.pid"), String(process.pid) + "\n");
    const c = await checkPulse(dir);
    assert.equal(c.running, false);
    assert.match(c.note ?? "", /unverified|stale/);
    const s = await stopPulse(dir);
    assert.match(s.note ?? "", /unverified|stale/);
    assert.equal(existsSync(join(dir, ".anvil-pulse", "server.pid")), false);
    // our own test process must still be alive (never signalled)
    assert.equal(process.pid > 0, true);
  });

  rmSync(dir, { recursive: true, force: true });
}

// ---------- extension factory -------------------------------------------------

console.log("# extension factory");
{
  const factory = (await jiti.import("../index.ts")).default;
  const tools = new Map();
  const commands = new Map();
  const handlers = [];
  const fakePi = {
    registerTool: (def) => tools.set(def.name, def),
    registerCommand: (name, def) => commands.set(name, def),
    on: (name, h) => handlers.push([name, h]),
  };
  factory(fakePi);

  await ok("registers the four pulse tools", async () => {
    for (const n of ["anvil_pulse_start", "anvil_pulse_check", "anvil_pulse_stop", "anvil_pulse_read"]) {
      assert.ok(tools.has(n), n);
    }
  });

  await ok("registers /pulse command and session lifecycle handlers", async () => {
    assert.ok(commands.has("pulse"));
    const names = handlers.map(([n]) => n);
    assert.ok(names.includes("session_start"));
    assert.ok(names.includes("session_shutdown"));
  });

  await ok("anvil_pulse_check tool executes against a live project", async () => {
    const { dir, shim } = makeFakeAnvilProject();
    try {
      const started = await startPulse({ project: dir, anvilBin: shim });
      const out = await tools.get("anvil_pulse_check").execute("t1", { project: dir }, new AbortController().signal, undefined, { cwd: dir });
      assert.match(out.content[0].text, /running: http/);
      const read = await tools.get("anvil_pulse_read").execute("t2", { project: dir }, new AbortController().signal, undefined, { cwd: dir });
      assert.match(read.content[0].text, /claim: T001/);
      const stop = await tools.get("anvil_pulse_stop").execute("t3", { project: dir }, new AbortController().signal, undefined, { cwd: dir });
      assert.match(stop.content[0].text, /stopped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await ok("anvil_pulse_read without a running dashboard degrades cleanly", async () => {
    const { dir } = makeFakeAnvilProject();
    try {
      const out = await tools.get("anvil_pulse_read").execute("t4", { project: dir }, new AbortController().signal, undefined, { cwd: dir });
      assert.match(out.content[0].text, /not running/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

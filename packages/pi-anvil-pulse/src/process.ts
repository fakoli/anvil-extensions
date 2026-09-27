// pi-anvil-pulse — dashboard process management.
//
// TypeScript port of the anvil-pulse plugin's bash toolkit
// (start-server.sh / check-server.sh / stop-server.sh / process-identity.sh,
// MIT). The server itself is src/server.mjs (ESM port of the original
// server.cjs). One dashboard per project: the PID file lives under
// <project>/.anvil-pulse/ and every stop/check verifies the recorded PID
// still looks like OUR server for THIS project before signalling it —
// a crashed server leaves a stale pid the OS may reassign.

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
export const SERVER_PATH = join(SRC_DIR, "server.mjs");

export interface PulseStartOptions {
  project: string;
  port?: number;
  stateDir?: string;
  host?: string;
  urlHost?: string;
  anvilBin?: string;
}

export interface PulseStartResult {
  url: string;
  host: string;
  port: number;
  pid: number;
  projectDir: string;
  logFile: string;
}

export interface PulseCheckResult {
  running: boolean;
  note?: string;
  url?: string;
  pid?: number;
  projectDir: string;
}

export interface PulseStopResult {
  event: "server-stopped";
  pid?: number;
  note?: string;
}

function pulseHome(project: string): string {
  return join(project, ".anvil-pulse");
}

function pidFileOf(project: string): string {
  return join(pulseHome(project), "server.pid");
}

function logFileOf(project: string): string {
  return join(pulseHome(project), "server.log");
}

function readPid(project: string): number | null {
  const f = pidFileOf(project);
  if (!existsSync(f)) return null;
  const raw = readFileSync(f, "utf8").trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 1 ? pid : null;
}

function resolveProject(project: string): string {
  return resolve(project);
}

// Shared by start/check/stop. A bare PID or any node process is insufficient:
// the command line must contain both the server file and the exact
// --pulse-project marker, so a recycled PID of an unrelated node process is
// never signalled.
export function isOurServer(pid: number, project: string): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  if (process.platform === "win32") {
    // `ps` is unavailable on native Windows; the original plugin relied on
    // Git Bash. Refuse to verify (and therefore refuse to signal) rather
    // than guess — a stale pid file is cleaned, the process is left alone.
    return false;
  }
  let args: string;
  try {
    args = execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return false; // process gone
  }
  return (
    args.includes(SERVER_PATH) &&
    args.includes(`--pulse-project ${resolveProject(project)}`)
  );
}

function readStartedLine(project: string): string | null {
  const log = logFileOf(project);
  if (!existsSync(log)) return null;
  for (const line of readFileSync(log, "utf8").split("\n")) {
    if (line.includes("server-started")) return line;
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startPulse(opts: PulseStartOptions): Promise<PulseStartResult> {
  const project = resolveProject(opts.project);
  if (!existsSync(project)) throw new Error(`project directory does not exist: ${project}`);
  const stateDir = opts.stateDir ? resolveProject(opts.stateDir) : undefined;
  if (stateDir && !existsSync(stateDir)) throw new Error(`state directory does not exist: ${stateDir}`);

  const home = pulseHome(project);
  const pidFile = pidFileOf(project);
  const logFile = logFileOf(project);
  mkdirSync(home, { recursive: true });

  // One dashboard per project: stop any existing verified server first.
  const oldPid = readPid(project);
  if (oldPid !== null && isOurServer(oldPid, project)) {
    try { process.kill(oldPid, "SIGTERM"); } catch { /* already gone */ }
    for (let i = 0; i < 20; i++) {
      if (!isOurServer(oldPid, project)) break;
      await sleep(100);
    }
  }
  rmSync(pidFile, { force: true });

  const bindHost = opts.host ?? "127.0.0.1";
  const urlHost = opts.urlHost ?? (bindHost === "127.0.0.1" || bindHost === "localhost" ? "localhost" : bindHost);

  const env: Record<string, string> = {
    PULSE_PROJECT_DIR: project,
    PULSE_HOST: bindHost,
    PULSE_URL_HOST: urlHost,
  };
  if (stateDir) env.PULSE_STATE_DIR = stateDir;
  if (opts.port) env.PULSE_PORT = String(opts.port);
  if (opts.anvilBin) env.PULSE_ANVIL_BIN = opts.anvilBin;

  // Foreground-less: detached so the dashboard outlives the pi session.
  // stdout goes to the log file via an open fd (stdio array entries do not
  // accept "file:" strings); stderr stays on the caller's stderr so a crash
  // is visible where the session ran.
  // Truncate first (the original start-server.sh used `> "$LOG_FILE"`): the
  // first `server-started` line in the log must be THIS start's, otherwise a
  // restart on a new port would report the previous server's URL.
  writeFileSync(logFile, "", { flag: "w" });
  const logFd = openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [SERVER_PATH, "--pulse-project", project],
    {
      detached: true,
      stdio: ["ignore", logFd, "inherit"],
      env: { ...process.env, ...env },
    },
  );
  // (the child keeps its own dup of the fd; closing ours in the parent is
  // safe and keeps the parent fd table clean)
  closeSync(logFd);
  const pid = child.pid;
  if (!pid) throw new Error("failed to spawn the pulse server");
  writeFileSync(pidFile, String(pid) + "\n", { mode: 0o600 });
  child.unref();

  // Wait for the server-started line (up to 5 seconds), then verify the
  // server survived a short window (catches process reapers). On native
  // Windows `ps` is unavailable, so identity verification degrades to a
  // liveness check (signal 0) — the server is our own detached child, so
  // survival is the strongest claim we can make there.
  const alive = (p: number): boolean => {
    try {
      process.kill(p, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 50; i++) {
    const line = readStartedLine(project);
    if (line) {
      for (let j = 0; j < 20; j++) {
        const ok =
          process.platform === "win32" ? alive(pid) : isOurServer(pid, project);
        if (!ok) {
          rmSync(pidFile, { force: true });
          throw new Error(
            "server started but was killed; retry in a persistent terminal " +
              `(node ${SERVER_PATH} with PULSE_PROJECT_DIR=${project} in the foreground)`,
          );
        }
        await sleep(100);
      }
      const started = JSON.parse(line) as { url: string; port: number };
      return {
        url: started.url,
        host: bindHost,
        port: started.port,
        pid,
        projectDir: project,
        logFile,
      };
    }
    await sleep(100);
  }
  rmSync(pidFile, { force: true });
  throw new Error("server failed to start within 5 seconds (see " + logFile + ")");
}

export async function checkPulse(project: string): Promise<PulseCheckResult> {
  const resolved = resolveProject(project);
  const pid = readPid(resolved);
  if (pid === null) {
    return { running: false, note: "no pid file", projectDir: resolved };
  }
  if (!isOurServer(pid, resolved)) {
    return { running: false, note: "unverified or stale pid file", projectDir: resolved };
  }
  const line = readStartedLine(resolved);
  if (line) {
    const started = JSON.parse(line) as { url: string; port: number };
    return { running: true, url: started.url, pid, projectDir: resolved };
  }
  return { running: true, pid, projectDir: resolved, note: "no server-started line in log (foreground mode?)" };
}

export async function stopPulse(project: string): Promise<PulseStopResult> {
  const resolved = resolveProject(project);
  const pidFile = pidFileOf(resolved);
  const pid = readPid(resolved);
  if (pid === null) {
    return { event: "server-stopped", note: "no pid file; nothing to stop" };
  }
  if (!isOurServer(pid, resolved)) {
    rmSync(pidFile, { force: true });
    return { event: "server-stopped", note: "unverified or stale PID; no process signalled" };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    rmSync(pidFile, { force: true });
    return { event: "server-stopped", note: `process ${pid} was not running; cleaned pid file` };
  }
  // Give it a moment to exit cleanly, then force (only while still ours).
  for (let i = 0; i < 20; i++) {
    if (!isOurServer(pid, resolved)) break;
    await sleep(100);
  }
  if (isOurServer(pid, resolved)) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  rmSync(pidFile, { force: true });
  return { event: "server-stopped", pid };
}

export function pulsePaths(project: string): { home: string; pidFile: string; logFile: string } {
  const home = pulseHome(project);
  return { home, pidFile: pidFileOf(project), logFile: logFileOf(project) };
}

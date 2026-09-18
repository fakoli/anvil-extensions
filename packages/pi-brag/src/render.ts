// Runner for the video-engine CLI (`npx hyperframes ...`).
//
// Long renders are the failure mode this tool exists for: we stream stdout
// tails through onUpdate, enforce a timeout, and honor the abort signal.
// All execution is injectable for offline tests.

import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import { childEnv } from "./paths.js";

export const RENDER_SUBCOMMANDS = ["check", "render", "snapshot", "beats", "preview", "tts", "doctor"] as const;
export type RenderSubcommand = (typeof RENDER_SUBCOMMANDS)[number];

export const DEFAULT_TIMEOUT_SECONDS: Record<RenderSubcommand, number> = {
  check: 120,
  render: 1200,
  snapshot: 120,
  beats: 120,
  preview: 1200,
  tts: 300,
  doctor: 120,
};

const STDOUT_TAIL_CHARS = 1200;
const UPDATE_INTERVAL_MS = 2000;
const MAX_STREAM_BUFFER = 64 * 1024;
/** Grace period after a kill before we stop waiting on a close event. */
const SETTLE_GRACE_MS = 10_000;

export interface BuildArgsInput {
  subcommand: RenderSubcommand;
  quality?: "draft" | "high";
  /** Output path for `render` (default: ../brag.mp4 relative to cwd). */
  output?: string;
  /** Extra CLI args passed through verbatim. */
  args?: string[];
}

export function buildHyperframesArgs(input: BuildArgsInput): string[] {
  const argv = ["hyperframes", input.subcommand];
  if (input.subcommand === "render") {
    argv.push("--output", input.output ?? "../brag.mp4");
    if (input.quality) argv.push("--quality", input.quality);
  }
  if (input.args) argv.push(...input.args);
  return argv;
}

export function validateCwd(cwd: string): void {
  let st;
  try {
    st = statSync(cwd);
  } catch (err) {
    throw new Error(`cwd does not exist: ${cwd} (${(err as Error).message})`);
  }
  if (!st.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
}

export interface RunHyperframesInput {
  subcommand: RenderSubcommand;
  cwd: string;
  quality?: "draft" | "high";
  output?: string;
  args?: string[];
  timeoutSeconds?: number;
}

export interface RunHyperframesResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  command: string;
  stdoutTail: string;
  stderrTail: string;
  durationMs: number;
}

export interface SpawnDeps {
  spawnFn?: typeof spawn;
  now?: () => number;
  /** Overrides SETTLE_GRACE_MS (tests). */
  settleGraceMs?: number;
  /** Pass-through to childEnv's augmentPath (tests: plant a fake home). */
  childEnvOpts?: { home?: string; exists?: (p: string) => boolean; delimiter?: string };
}

function tail(s: string, maxChars = STDOUT_TAIL_CHARS): string {
  const trimmed = s.length > maxChars ? s.slice(s.length - maxChars) : s;
  return trimmed.trim();
}

/** Append a chunk to a stream buffer, keeping only the last `max` characters. */
export function appendBounded(current: string, chunk: string, max: number = MAX_STREAM_BUFFER): string {
  const next = current + chunk;
  return next.length > max ? next.slice(-max) : next;
}

/**
 * Run `npx hyperframes <subcommand>` in `cwd`.
 *
 * Streams a throttled stdout/stderr tail through `onUpdate`, kills the child
 * on timeout or abort, and resolves with a structured result (never throws
 * for non-zero exits — the caller decides).
 */
export async function runHyperframes(
  input: RunHyperframesInput,
  onUpdate?: (update: { text: string }) => void,
  signal?: AbortSignal,
  deps: SpawnDeps = {},
): Promise<RunHyperframesResult> {
  validateCwd(input.cwd);
  const spawnFn = deps.spawnFn ?? spawn;
  const now = deps.now ?? Date.now;
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS[input.subcommand];
  const argv = buildHyperframesArgs(input);
  const command = `npx ${argv.join(" ")}`;
  const started = now();

  if (signal?.aborted) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      timedOut: false,
      aborted: true,
      command,
      stdoutTail: "",
      stderrTail: "aborted before spawn",
      durationMs: 0,
    };
  }

  return await new Promise<RunHyperframesResult>((resolvePromise) => {
    let child: ChildProcess;
    const isWindows = process.platform === "win32";
    try {
      // detached on POSIX gives the engine its own process group so we can
      // kill the whole tree (npx → hyperframes → chromium/ffmpeg), not just
      // the launcher. PATH is augmented so ffmpeg installs in user-bin dirs
      // (~/.pi/agent/bin, ~/.local/bin) are visible to the engine.
      child = spawnFn("npx", argv, {
        cwd: input.cwd,
        shell: isWindows,
        detached: !isWindows,
        env: childEnv(undefined, deps.childEnvOpts),
      });
    } catch (err) {
      resolvePromise({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        aborted: false,
        command,
        stdoutTail: "",
        stderrTail: `failed to spawn: ${(err as Error).message}`,
        durationMs: now() - started,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    // Keep only the last MAX_STREAM_BUFFER chars per stream: renders can run
    // for many minutes and a chatty engine would otherwise balloon memory.
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let lastUpdate = 0;

    const pushUpdate = (force = false) => {
      if (!onUpdate) return;
      if (!force) {
        const t = now();
        if (t - lastUpdate < UPDATE_INTERVAL_MS) return;
        lastUpdate = t;
      }
      const text = [stdout, stderr].filter(Boolean).join("\n---\n");
      onUpdate({ text: tail(text) || "(no output yet)" });
    };

    /**
     * Kill the whole process tree. On POSIX the child runs detached in its
     * own group, so a negative pid signals every descendant; fall back to
     * child.kill when the group is already gone (or on Windows, where the
     * detached flag is not set).
     */
    const kill = () => {
      if (child.exitCode !== null || child.signalCode) return;
      const pid = child.pid;
      let signaled = false;
      if (pid && !isWindows) {
        try {
          process.kill(-pid, "SIGTERM");
          signaled = true;
        } catch {
          // group already gone — fall through to child.kill
        }
      }
      if (!signaled) child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode !== null || child.signalCode) return;
        if (pid && !isWindows) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        } else {
          child.kill("SIGKILL");
        }
      }, 5000).unref();
      // Descendants can inherit our stdio pipes and outlive the launcher, so
      // 'close' may never fire. Give the tree a grace period to settle, then
      // finish with what we have rather than hanging the tool forever.
      // NOT unref'd: this timer must keep the loop alive until it fires.
      const settleGraceMs = deps.settleGraceMs ?? SETTLE_GRACE_MS;
      setTimeout(() => {
        if (!settled) finish(child.exitCode, child.signalCode ?? "SIGKILL");
      }, settleGraceMs);
    };

    const onAbort = () => {
      aborted = true;
      kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutSeconds * 1000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString());
      pushUpdate();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString());
      pushUpdate();
    });

    const finish = (exitCode: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);
      resolvePromise({
        ok: !timedOut && !aborted && exitCode === 0,
        exitCode,
        signal: sig,
        timedOut,
        aborted,
        command,
        stdoutTail: tail(stdout),
        stderrTail: tail(stderr),
        durationMs: now() - started,
      });
    };

    child.on("error", (err) => {
      stderr = appendBounded(stderr, `\nspawn error: ${err.message}`);
      finish(null, null);
    });
    child.on("close", (code, sig) => finish(code, sig));

    // Kick a first update so the caller sees the command started.
    setTimeout(() => pushUpdate(true), 0).unref();
  });
}

/** One-line human summary used in the tool's text output. */
export function summarizeRun(result: RunHyperframesResult, timeoutSeconds?: number): string {
  const seconds = (result.durationMs / 1000).toFixed(1);
  if (result.ok) return `${result.command} — ok (exit 0, ${seconds}s)`;
  if (result.timedOut)
    return `${result.command} — TIMED OUT after ${timeoutSeconds ? `${timeoutSeconds}s` : "the configured limit"} (${seconds}s elapsed)`;
  if (result.aborted) return `${result.command} — aborted (${seconds}s elapsed)`;
  return `${result.command} — failed (exit ${result.exitCode ?? `signal ${result.signal ?? "?"}`}, ${seconds}s)`;
}
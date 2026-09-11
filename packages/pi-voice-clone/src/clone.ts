// Thin wrapper around the style-clone plugin's clone.py (prompt assembly).
//
// clone.py is stdlib-only and does the retrieval + assembly work; this module
// just shells out to it. Output goes to stdout when --out is omitted. The
// assembled prompt contains private corpus text — treat results as local-only
// (session files; they intentionally flow to the configured LLM as drafting
// context and nowhere else).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface VoicePromptParams {
  register: string;
  task?: string;
  context?: string;
  audience?: string;
  n?: number;
  examples?: string[];
  facts?: string;
  listRegisters?: boolean;
}

export class ClonePyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClonePyError";
  }
}

function run(args: string[], timeoutMs: number, signal?: AbortSignal): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        fn();
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new ClonePyError(`clone.py timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    const onAbort = () => {
      child.kill("SIGTERM");
      settle(() => reject(new ClonePyError("clone.py aborted by tool-call signal")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => settle(() => reject(new ClonePyError(`failed to spawn python3: ${err.message}`))));
    child.on("close", (code) => settle(() => resolve({ code: code ?? -1, stdout, stderr })));
  });
}

/**
 * Assemble a voice prompt. When params.facts is provided it is written to a
 * 0600 temp file and passed as --facts-file (clone.py only accepts inline
 * evidence through a file), then removed.
 */
export async function assemblePrompt(
  clonePy: string,
  params: VoicePromptParams,
  timeoutMs = 30_000,
  signal?: AbortSignal
): Promise<string> {
  const args: string[] = [clonePy];
  if (params.listRegisters) {
    args.push("--list-registers");
  } else {
    if (!params.register) throw new ClonePyError("register is required");
    args.push("--register", params.register);
    if (params.task) args.push("--task", params.task);
    if (params.context) args.push("--context", params.context);
    if (params.audience) args.push("--audience", params.audience);
    if (params.n !== undefined) args.push("--n", String(params.n));
    for (const ex of params.examples ?? []) args.push("--example", ex);
  }

  if (params.facts?.trim()) {
    const dir = mkdtempSync(join(tmpdir(), "voice-clone-"), { mode: 0o700 });
    const factsPath = join(dir, "current-facts.md");
    let res: { code: number; stdout: string; stderr: string };
    try {
      writeFileSync(factsPath, params.facts, { mode: 0o600 });
      args.push("--facts-file", factsPath);
      res = await run(args, timeoutMs, signal);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return finish(res);
  }
  const res = await run(args, timeoutMs, signal);
  return finish(res);
}

function finish(res: { code: number; stdout: string; stderr: string }): string {
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim().split("\n").slice(-4).join("\n");
    throw new ClonePyError(`clone.py exited ${res.code}: ${detail}`);
  }
  const text = res.stdout.trim();
  if (!text) throw new ClonePyError("clone.py produced no output");
  return text;
}
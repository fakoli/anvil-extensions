// Environment checks for the brag pipeline ("doctor").
//
// All process execution is injectable so the suite runs fully offline.

import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { DEFAULT_ASSETS_DIR, findDomainSkill, inventoryAssets, type AssetInventory } from "./paths.js";

export const MIN_NODE_MAJOR = 22;
export const MIN_NODE_MINOR = 19;

export interface ExecOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  /** ENOENT-style failure to spawn the binary at all. */
  error?: string;
}

export type ExecFn = (cmd: string, args: string[], timeoutMs: number) => Promise<ExecOutcome>;

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

export interface DoctorDeps {
  exec?: ExecFn;
  home?: string;
  cwd?: string;
  assetsDir?: string;
  nodeVersion?: string;
  /** Skip the (network-touching) engine CLI probe, e.g. in tests. */
  skipEngineProbe?: boolean;
}

export interface DoctorReport {
  checks: CheckResult[];
  ok: boolean;
  okCount: number;
  total: number;
}

export const DEFAULT_EXEC: ExecFn = (cmd, args, timeoutMs) =>
  new Promise((resolvePromise) => {
    execFile(cmd, args, { timeout: timeoutMs, encoding: "utf8", windowsHide: true }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        resolvePromise({ code: null, stdout: "", stderr: "", error: `not found: ${cmd}` });
        return;
      }
      // execFile reports non-zero exits via err; stdout/stderr are still populated.
      const code = err && typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code as number) : err ? -1 : 0;
      resolvePromise({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });

function parseNodeVersion(version: string): { major: number; minor: number } | null {
  const match = /^v?(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function checkNode(nodeVersion: string): CheckResult {
  const parsed = parseNodeVersion(nodeVersion);
  if (!parsed) {
    return { name: "node", ok: false, detail: `unparseable version: ${nodeVersion}` };
  }
  const ok = parsed.major > MIN_NODE_MAJOR || (parsed.major === MIN_NODE_MAJOR && parsed.minor >= MIN_NODE_MINOR);
  return {
    name: "node",
    ok,
    detail: `${nodeVersion.trim()} — ${ok ? "ok" : `needs >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`}`,
    hint: ok ? undefined : "upgrade Node.js (https://nodejs.org) to at least v22.19",
  };
}

async function checkFfmpeg(exec: ExecFn): Promise<CheckResult> {
  const ffmpeg = await exec("ffmpeg", ["-version"], 10_000);
  if (ffmpeg.error) {
    return {
      name: "ffmpeg",
      ok: false,
      detail: "ffmpeg not on PATH — required for render, poster extraction, and frame-0 bake",
      hint: "install ffmpeg (e.g. `sudo apt install ffmpeg`, `brew install ffmpeg`, or a static build on PATH)",
    };
  }
  if (ffmpeg.code !== 0) {
    return {
      name: "ffmpeg",
      ok: false,
      detail: `ffmpeg present but broken (exit ${ffmpeg.code}): ${ffmpeg.stderr.slice(-200) || "no stderr"}`,
      hint: "reinstall ffmpeg — a binary that cannot print its version will not render",
    };
  }
  const ffprobe = await exec("ffprobe", ["-version"], 10_000);
  const probeOk = !ffprobe.error && ffprobe.code === 0;
  const versionLine = ffmpeg.stdout.split("\n")[0]?.trim() ?? "present";
  return {
    name: "ffmpeg",
    ok: probeOk,
    detail: probeOk ? versionLine : "ffmpeg present but ffprobe missing or broken",
    hint: probeOk ? undefined : "install a full ffmpeg build that includes a working ffprobe",
  };
}

async function checkEngine(exec: ExecFn): Promise<CheckResult> {
  const probe = await exec("npx", ["--no-install", "hyperframes", "--version"], 20_000);
  if (!probe.error && probe.code === 0) {
    const version = probe.stdout.trim().split("\n")[0] ?? "present";
    return { name: "engine CLI", ok: true, detail: version };
  }
  return {
    name: "engine CLI",
    ok: false,
    detail: "hyperframes CLI not installed locally",
    hint: "the first `npx hyperframes ...` run downloads the CLI (network required); verify afterwards with `npx hyperframes doctor`",
  };
}

function checkAssets(assetsDir: string, inv: AssetInventory): CheckResult {
  if (!inv.present) {
    return {
      name: "skill assets",
      ok: false,
      detail: `${assetsDir} does not exist`,
      hint: "run the brag_fetch_assets tool once to download music/SFX from the upstream repo, or plan the video with --no-music --no-sfx",
    };
  }
  const hasMusic = inv.music.length > 0;
  const hasSfx = inv.sfxFiles > 0;
  if (hasMusic && hasSfx) {
    return {
      name: "skill assets",
      ok: true,
      detail: `${inv.music.length} music track(s), ${inv.sfxFiles} SFX in ${inv.sfxDirs.length} set(s), ${inv.cues.length} cue file(s) — ${inv.assetsDir}`,
    };
  }
  const missing: string[] = [];
  if (!hasMusic) missing.push("music");
  if (!hasSfx) missing.push("sfx");
  return {
    name: "skill assets",
    ok: false,
    detail: `assets dir present but missing: ${missing.join(", ")}`,
    hint: "run the brag_fetch_assets tool once, or plan with --no-music/--no-sfx",
  };
}

function checkDomainSkills(home: string, cwd: string): CheckResult {
  const core = findDomainSkill("hyperframes-core", home, cwd);
  if (core) {
    return { name: "engine domain skills", ok: true, detail: `hyperframes-core at ${core}` };
  }
  return {
    name: "engine domain skills",
    ok: false,
    detail: "hyperframes-core not found in standard skill directories",
    hint: "domain skills ship with the engine ecosystem — run `npx hyperframes doctor` and follow its setup; the core composition skill is what the brag workflow reads",
  };
}

export async function runDoctor(deps: DoctorDeps = {}): Promise<DoctorReport> {
  const exec = deps.exec ?? DEFAULT_EXEC;
  const home = deps.home ?? homedir();
  const cwd = deps.cwd ?? process.cwd();
  const assetsDir = deps.assetsDir ?? DEFAULT_ASSETS_DIR;
  const nodeVersion = deps.nodeVersion ?? process.version;

  const checks: CheckResult[] = [checkNode(nodeVersion), await checkFfmpeg(exec)];
  if (!deps.skipEngineProbe) checks.push(await checkEngine(exec));
  checks.push(checkAssets(assetsDir, inventoryAssets(assetsDir)));
  checks.push(checkDomainSkills(home, cwd));

  const okCount = checks.filter((c) => c.ok).length;
  return { checks, ok: okCount === checks.length, okCount, total: checks.length };
}

export function formatReport(report: DoctorReport): string {
  const lines: string[] = [`brag doctor: ${report.okCount}/${report.total} checks ok`];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`);
    if (check.hint) lines.push(`     hint: ${check.hint}`);
  }
  if (!report.ok) {
    lines.push("Fix the FAIL lines before rendering; the pipeline degrades without music/SFX but not without ffmpeg.");
  }
  return lines.join("\n");
}
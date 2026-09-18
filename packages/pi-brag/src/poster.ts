// Poster-frame extraction + frame-0 bake (step-4 delivery gate).
//
// Upstream recipe, unchanged in spirit:
//   1. ffmpeg -ss <t> -i video -frames:v 1 -q:v 2 poster.jpg
//   2. overlay poster onto frame 0 of the video, re-encode, atomic rename
// Frame 0 is what most platforms use as the thumbnail, so baking the chosen
// poster there controls how the share looks before playback starts.
//
// Process execution is injectable for offline tests. The abort signal is
// honored between and after each ffmpeg step: a canceled bake never replaces
// the rendered video.

import { execFile } from "node:child_process";
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { childEnv } from "./paths.js";

export interface ExecOutcome {
  code: number | null;
  stderr: string;
  error?: string;
}

export type RunFn = (args: string[], signal?: AbortSignal) => Promise<ExecOutcome>;

export interface PosterDeps {
  run?: RunFn;
  exists?: (path: string) => boolean;
  rename?: (from: string, to: string) => void;
  unlink?: (path: string) => void;
}

export const DEFAULT_RUN: RunFn = (args, signal) =>
  new Promise((resolvePromise) => {
    execFile("ffmpeg", args, { encoding: "utf8", windowsHide: true, signal, env: childEnv() }, (err, _stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        resolvePromise({ code: null, stderr: "", error: "not found: ffmpeg" });
        return;
      }
      const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? -1 : 0;
      resolvePromise({ code, stderr: stderr ?? "" });
    });
  });

/** Extract a single frame at `timestamp` seconds as the poster jpg. */
export function buildExtractArgs(video: string, timestamp: number, out: string): string[] {
  return ["-y", "-ss", String(timestamp), "-i", video, "-frames:v", "1", "-q:v", "2", out];
}

/** Re-encode the video with the poster overlaid on frame 0 only. */
export function buildBakeArgs(video: string, poster: string, tmpOut: string): string[] {
  return [
    "-y",
    "-i",
    video,
    "-i",
    poster,
    "-filter_complex",
    "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]",
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    tmpOut,
  ];
}

export function defaultPosterPath(video: string): string {
  return join(dirname(video), "brag.jpg");
}

export interface PosterInput {
  /** Path to the rendered mp4 (absolute or relative to cwd). */
  video: string;
  /** Seconds into the video of the strongest settled beat. */
  timestamp: number;
  /** Poster jpg path (default: brag.jpg beside the video). */
  out?: string;
  /** Bake the poster as frame 0 of the video (default true). */
  bake?: boolean;
  /** Abort signal — checked before each ffmpeg step and before publication. */
  signal?: AbortSignal;
}

export interface PosterResult {
  poster: string;
  video: string;
  baked: boolean;
  bakeError?: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("poster generation aborted");
}

export async function makePoster(input: PosterInput, deps: PosterDeps = {}): Promise<PosterResult> {
  const run = deps.run ?? DEFAULT_RUN;
  const exists = deps.exists ?? existsSync;
  const rename = deps.rename ?? renameSync;
  const unlink = deps.unlink ?? unlinkSync;

  if (!Number.isFinite(input.timestamp) || input.timestamp < 0) {
    throw new Error(`timestamp must be a finite number >= 0, got ${input.timestamp}`);
  }
  throwIfAborted(input.signal);
  const video = isAbsolute(input.video) ? input.video : resolve(input.video);
  if (!exists(video)) throw new Error(`video not found: ${video}`);
  const poster = input.out ? (isAbsolute(input.out) ? input.out : resolve(input.out)) : defaultPosterPath(video);

  const extract = await run(buildExtractArgs(video, input.timestamp, poster), input.signal);
  if (extract.error) throw new Error(`ffmpeg unavailable: ${extract.error}`);
  if (extract.code !== 0) {
    throw new Error(`poster extraction failed (exit ${extract.code}): ${extract.stderr.slice(-800)}`);
  }
  // ffmpeg -ss past EOF exits 0 but writes no file — verify before claiming success.
  if (!exists(poster)) {
    throw new Error(
      `poster extraction produced no file at ${poster} — timestamp ${input.timestamp}s may be past the end of the video`,
    );
  }

  const bake = input.bake !== false;
  if (!bake) return { poster, video, baked: false };

  throwIfAborted(input.signal);
  const tmpOut = join(dirname(video), `.${basename(video, ".mp4")}.bake.mp4`);
  const cleanupTmp = () => {
    try {
      unlink(tmpOut);
    } catch {
      // tmp file never appeared or is already gone
    }
  };
  let bakeRun: ExecOutcome;
  try {
    bakeRun = await run(buildBakeArgs(video, poster, tmpOut), input.signal);
  } catch (err) {
    cleanupTmp();
    throw err;
  }
  if (bakeRun.error) {
    cleanupTmp();
    throw new Error(`ffmpeg unavailable: ${bakeRun.error}`);
  }
  if (bakeRun.code !== 0) {
    cleanupTmp();
    return {
      poster,
      video,
      baked: false,
      bakeError: `frame-0 bake failed (exit ${bakeRun.code}); poster extracted, video untouched. stderr: ${bakeRun.stderr.slice(-800)}`,
    };
  }
  // Never publish after cancellation: the tmp re-encode may be complete, but
  // the caller no longer wants the video replaced.
  try {
    throwIfAborted(input.signal);
  } catch (err) {
    cleanupTmp();
    throw err;
  }
  rename(tmpOut, video);
  return { poster, video, baked: true };
}

/** Human-readable summary for tool output. */
export function summarizePoster(result: PosterResult): string {
  const lines = [`poster: ${result.poster}`];
  if (result.baked) {
    lines.push(`frame-0 bake: done — ${result.video} now opens on the chosen poster`);
  } else if (result.bakeError) {
    lines.push(`frame-0 bake: ${result.bakeError}`);
  } else {
    lines.push("frame-0 bake: skipped (bake=false)");
  }
  return lines.join("\n");
}
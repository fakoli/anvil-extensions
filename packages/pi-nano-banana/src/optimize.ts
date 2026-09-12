// Local image optimization: bounded shrink loop to a size/width limit.
// Port of optimize.py from Pillow to sharp (LANCZOS3 resize, same presets,
// same halving-ish 0.8 shrink step, same 64-iteration bound).

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { atomicWrite, encodeImage, decodeImage, sniffImage, validateOutputPath } from "./image-io.js";
import { roundHalfEven } from "./models.js";

export const PRESETS: Record<string, { max_size_kb: number; max_width: number }> = {
  github: { max_size_kb: 500, max_width: 1280 },
  slack: { max_size_kb: 128, max_width: 800 },
  web: { max_size_kb: 200, max_width: 1200 },
  thumbnail: { max_size_kb: 50, max_width: 400 },
};

/** Parse a positive byte/KB/MB size ("500KB", "2MB", "1024"); powers of 1024. */
export function parseSize(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB)?$/i);
  if (!match) {
    throw new Error("Size must be positive bytes, KB, or MB (for example 500KB)");
  }
  const multiplier = match[2] === undefined ? 1 : { B: 1, KB: 1024, MB: 1024 ** 2 }[match[2].toUpperCase()];
  const size = Math.trunc(parseFloat(match[1]) * multiplier);
  if (size < 1) {
    throw new Error("Size must be at least one byte");
  }
  return size;
}

export interface OptimizeResult {
  outputBytes: number;
  originalBytes: number;
  width: number;
  height: number;
  iterations: number;
}

/**
 * Shrink until the encoded output fits maxBytes (None = no size constraint),
 * applying the width constraint first, preserving aspect ratio. Bounded at 64
 * iterations; never writes a partial or oversized output.
 */
export async function optimize(
  srcPath: string,
  dstPath: string,
  maxBytes: number | null,
  maxWidth: number | null,
  overwrite = false,
): Promise<OptimizeResult> {
  validateOutputPath(dstPath, overwrite);
  if ((maxBytes !== null && maxBytes < 1) || (maxWidth !== null && maxWidth < 1)) {
    throw new Error("Size and width constraints must be positive");
  }
  const data = readFileSync(srcPath);
  const originalBytes = data.length;
  await sniffImage(data); // static PNG/JPEG/WebP only — animation is rejected
  const original = decodeImage(data);
  const meta = await original.metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;
  if (!originalWidth || !originalHeight) {
    throw new Error("Input must be a static PNG, JPEG, or WebP image");
  }
  let width = Math.min(originalWidth, maxWidth ?? originalWidth);
  let iterations = 0;
  for (let guard = 0; guard < 64; guard += 1) {
    iterations += 1;
    const height = Math.max(1, roundHalfEven(originalHeight * width / originalWidth));
    const resized = width === originalWidth && height === originalHeight ? original : original.resize(width, height, { kernel: "lanczos3" });
    const data = await encodeImage(resized, suffixOf(dstPath));
    if (maxBytes === null || data.length <= maxBytes) {
      atomicWrite(data, dstPath, overwrite);
      return { outputBytes: data.length, originalBytes, width, height, iterations };
    }
    if (width === 1) break;
    width = Math.max(1, Math.min(width - 1, Math.trunc(width * 0.8)));
  }
  throw new Error(`Cannot meet ${maxBytes}-byte limit in ${suffixOf(dstPath)} format; no output written`);
}

function suffixOf(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot);
}

/** Default output path: <stem>-optimized.png beside the source. */
export function defaultOptimizeOut(srcPath: string): string {
  const base = basename(srcPath);
  const dot = base.lastIndexOf(".");
  const stem = dot < 0 ? base : base.slice(0, dot);
  const slash = srcPath.lastIndexOf("/");
  const dir = slash < 0 ? "" : srcPath.slice(0, slash + 1);
  return `${dir}${stem}-optimized.png`;
}
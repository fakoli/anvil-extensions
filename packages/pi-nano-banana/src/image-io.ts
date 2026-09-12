// Image sniffing, encoding, and atomic publication.
// Port of image_io.py from Pillow to sharp, with byte-identical semantics:
// static PNG/JPEG/WebP inputs only, encode-to-match-extension outputs, JPEG
// transparency flattened onto white, quality 90, atomic no-clobber writes.

import { createRequire } from "node:module";
import { existsSync, linkSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Sharp } from "sharp";

export const OUTPUT_FORMATS: Record<string, "png" | "jpeg" | "webp"> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
};

export const INPUT_MIMES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export function validateOutputPath(path: string, overwrite = false): void {
  const suffix = suffixOf(path);
  if (!(suffix.toLowerCase() in OUTPUT_FORMATS)) {
    throw new Error("Output must end in .png, .jpg, .jpeg, or .webp");
  }
  if (existsSync(path)) {
    if (statSync(path).isDirectory()) throw new Error(`Output path is a directory: ${path}`);
    if (!overwrite) {
      throw new Error(`Output already exists: ${path}; choose another path or enable overwrite`);
    }
  }
}

function suffixOf(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot);
}

let sharpModule: typeof import("sharp") | null = null;

/** Lazily load sharp so config/dry paths never pay the native-module cost. */
export function getSharp(): typeof import("sharp") {
  if (!sharpModule) {
    try {
      const require = createRequire(import.meta.url);
      sharpModule = require("sharp") as typeof import("sharp");
    } catch (error) {
      throw new Error(
        `sharp is unavailable (${error instanceof Error ? error.message : String(error)}); image processing requires the sharp dependency`,
      );
    }
  }
  return sharpModule;
}

export interface Sniffed {
  mime: string;
  format: string;
}

/**
 * Sniff an image from its bytes: must be a static (single-frame) PNG, JPEG,
 * or WebP. Rejects HTML/other data masquerading as an image, and animated
 * inputs. Mirrors image_mime().
 */
export async function sniffImage(data: Buffer): Promise<Sniffed> {
  const sharp = getSharp();
  let meta: import("sharp").Metadata;
  try {
    meta = await sharp(data).metadata();
  } catch {
    throw new Error("Input must be a static PNG, JPEG, or WebP image");
  }
  const format = (meta.format ?? "").toLowerCase();
  const mime = INPUT_MIMES[format];
  if (!mime) {
    throw new Error("Input must be a static PNG, JPEG, or WebP image");
  }
  const frames = meta.pages ?? 1;
  if (frames !== 1 || meta.isAnimation === true) {
    throw new Error("Input must be a static PNG, JPEG, or WebP image");
  }
  return { mime, format };
}

/**
 * Read a file as an inline upload part payload: 12 MiB cap, sniffed from the
 * actual bytes. Returns { mimeType, base64 }.
 */
export async function fileToInlinePartPayload(path: string): Promise<{ mimeType: string; base64: string }> {
  const { readFile } = await import("node:fs/promises");
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch (error) {
    throw new Error(`Cannot read input image: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (data.length > MAX_INPUT_BYTES) {
    throw new Error("Input image exceeds the 12 MiB inline upload limit");
  }
  const { mime } = await sniffImage(data);
  return { mimeType: mime, base64: data.toString("base64") };
}

/**
 * Decode returned image bytes with EXIF auto-orientation applied (parity:
 * ImageOps.exif_transpose), rejecting animation.
 */
export function decodeImage(data: Buffer): Sharp {
  const sharp = getSharp();
  return sharp(data).rotate(); // .rotate() with no args applies EXIF orientation
}

/**
 * Encode a sharp pipeline to match the output extension. JPEG gets a white
 * flatten (parity with the Pillow paste-over-white path); PNG/WebP keep
 * alpha. Quality 90 for JPEG/WebP, PNG compression 9 (Pillow optimize).
 */
export async function encodeImage(image: Sharp, suffix: string): Promise<Buffer> {
  const fmt = OUTPUT_FORMATS[suffix.toLowerCase()];
  if (!fmt) throw new Error("Output must end in .png, .jpg, .jpeg, or .webp");
  let pipeline = image;
  if (fmt === "jpeg") {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: false });
  } else if (fmt === "webp") {
    pipeline = pipeline.webp({ quality: 90 });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
  }
  return pipeline.toBuffer();
}

/**
 * Encode arbitrary bytes to the output format (used by optimize): decode
 * (with EXIF orientation), then encode by extension.
 */
export async function encodeBytes(data: Buffer, suffix: string): Promise<Buffer> {
  return encodeImage(decodeImage(data), suffix);
}

/**
 * Publish a complete file atomically; never clobbers an existing path unless
 * overwrite. Parity: hard-link for create (fails if the target now exists —
 * race-safe), rename for overwrite.
 */
export function atomicWrite(data: Buffer | string, path: string, overwrite = false): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temp = `${dir}/.${basename(path)}-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    writeFileSync(temp, data);
    if (overwrite) {
      renameSync(temp, path);
    } else {
      linkSync(temp, path); // EEXIST if the target appeared meanwhile
    }
  } finally {
    try { unlinkSync(temp); } catch { /* renamed away */ }
  }
}
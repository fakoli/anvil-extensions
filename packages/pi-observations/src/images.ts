import { validatePng } from "@anvil-serving/observations/png";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type ImageErrorCode = "unsupported_format" | "input_too_large" | "pixel_limit" | "cancelled" | "animated_image";

const messages: Record<ImageErrorCode, string> = {
  unsupported_format: "Use a PNG, JPEG, WebP, or GIF image with matching MIME type.",
  input_too_large: "Image input or normalized output exceeds the 8 MiB limit.",
  pixel_limit: "Image exceeds the 8 million pixel limit.",
  cancelled: "Image normalization was cancelled.",
  animated_image: "Animated or multi-page images are not supported for this format.",
};

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) { super(messages[code]); this.code = code; }
}

type ImageInput = { mimeType: string; data: string };
type NormalizedImage = { mimeType: "image/png"; data: string; notice?: string };
const GIF_NOTICE = "Animated GIF: only the first frame was inspected; motion and later frames were not analyzed.";

const fail = (code: ImageErrorCode): never => { throw new ImageError(code); };

function canonicalBase64(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let index = 0; index < value.length - padding; index += 1) if (!/[A-Za-z0-9+/]/.test(value[index])) return false;
  for (let index = value.length - padding; index < value.length; index += 1) if (value[index] !== "=") return false;
  return true;
}

function expectedFormat(mimeType: unknown): "jpeg" | "png" | "webp" | "gif" {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return fail("unsupported_format");
}

/** Counts GIF image descriptors without asking the decoder to render later frames. */
function animatedGif(input: Buffer): boolean {
  if (input.length < 13 || (input.subarray(0, 6).toString("ascii") !== "GIF87a" && input.subarray(0, 6).toString("ascii") !== "GIF89a")) return false;
  let offset = 13;
  const globalTable = input[10];
  if (globalTable & 0x80) offset += 3 * (1 << ((globalTable & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = (): boolean => {
    while (offset < input.length) {
      const size = input[offset++];
      if (size === 0) return true;
      if (offset + size > input.length) return false;
      offset += size;
    }
    return false;
  };
  while (offset < input.length) {
    const marker = input[offset++];
    if (marker === 0x3b) return false;
    if (marker === 0x21) {
      if (offset >= input.length) return false;
      offset += 1;
      if (!skipSubBlocks()) return false;
      continue;
    }
    if (marker !== 0x2c || offset + 9 > input.length) return false;
    const packed = input[offset + 8];
    offset += 9;
    if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
    if (offset >= input.length) return false;
    offset += 1; // LZW minimum code size
    if (!skipSubBlocks()) return false;
    frames += 1;
    if (frames > 1) return true;
  }
  return false;
}

async function bounded<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) fail("cancelled");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remove: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    if (!signal) return;
    const abort = () => reject(new ImageError("cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    remove = () => signal.removeEventListener("abort", abort);
  });
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ImageError("unsupported_format")), TIMEOUT_MS); });
  try { return await Promise.race([work, cancelled, deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); remove?.(); }
}

function strictPng(output: Buffer): Buffer {
  if (output.length < PNG_SIGNATURE.length || !output.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) fail("unsupported_format");
  const chunks: Buffer[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  while (offset < output.length) {
    if (output.length - offset < 12) fail("unsupported_format");
    const length = output.readUInt32BE(offset), end = offset + 12 + length;
    if (end > output.length) fail("unsupported_format");
    const type = output.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IHDR" || type === "IDAT" || type === "IEND") chunks.push(output.subarray(offset, end));
    offset = end;
  }
  const result = Buffer.concat(chunks);
  try { validatePng(result.toString("base64")); }
  catch { fail("unsupported_format"); }
  return result;
}

/** Converts one declared image into the owner's strict PNG form without retaining it. */
export async function normalizeImage(input: ImageInput, signal?: AbortSignal): Promise<NormalizedImage> {
  const format = expectedFormat(input?.mimeType);
  if (!input || typeof input !== "object" || !canonicalBase64(input.data)) fail("unsupported_format");
  if (input.data.length > 4 * Math.ceil(MAX_BYTES / 3)) fail("input_too_large");
  const encoded = Buffer.from(input.data, "base64");
  if (encoded.length > MAX_BYTES) fail("input_too_large");
  if (encoded.toString("base64") !== input.data) fail("unsupported_format");
  if (signal?.aborted) fail("cancelled");
  if (format === "png") {
    try { validatePng(input.data); return Object.freeze({ mimeType: "image/png", data: input.data }); }
    catch { /* Metadata-bearing PNGs continue through Sharp for normalization. */ }
  }
  try {
    const sharp = (await bounded(import("sharp"), signal)).default;
    const gifFirstFrame = format === "gif" && animatedGif(encoded);
    const source = sharp(encoded, { pages: format === "gif" ? 1 : -1, failOn: "error", limitInputPixels: false, sequentialRead: true }).timeout({ seconds: 5 });
    const metadata = await bounded(source.metadata(), signal);
    if (metadata.format !== format || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 1 || metadata.height < 1) fail("unsupported_format");
    if (format !== "gif" && metadata.pages !== undefined && metadata.pages > 1) fail("animated_image");
    if (metadata.width > Math.floor(MAX_PIXELS / metadata.height)) fail("pixel_limit");
    const output = await bounded(source.rotate().toColourspace("srgb").png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer(), signal);
    if (output.length > MAX_BYTES) fail("input_too_large");
    return Object.freeze({ mimeType: "image/png", data: strictPng(output).toString("base64"), ...(gifFirstFrame ? { notice: GIF_NOTICE } : {}) });
  } catch (error) {
    if (error instanceof ImageError) throw error;
    fail("unsupported_format");
  }
}

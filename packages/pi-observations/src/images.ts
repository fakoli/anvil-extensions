import { validatePng } from "@anvil-serving/observations/png";
import { spawn } from "node:child_process";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 8_000_000;
const TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_CHILD_STDOUT = 4 * Math.ceil(MAX_BYTES / 3) + 512;

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
const GIF_NOTICE = "Animated GIF: only the first frame is available for inspection; motion and later frames are not included.";

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

function runningInBun(): boolean {
  return typeof (process.versions as { bun?: unknown }).bun === "string";
}

async function bounded<T>(work: Promise<T>, signal: AbortSignal | undefined, stop: { code?: ImageErrorCode }, destroy: () => void | Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remove: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const interrupt = (code: ImageErrorCode) => {
      if (stop.code) return;
      stop.code = code;
      Promise.resolve().then(destroy).catch(() => undefined).finally(() => reject(new ImageError(code)));
    };
    if (signal?.aborted) interrupt("cancelled");
    else if (signal) {
      const abort = () => interrupt("cancelled");
      signal.addEventListener("abort", abort, { once: true });
      remove = () => signal.removeEventListener("abort", abort);
    }
    timer = setTimeout(() => interrupt("unsupported_format"), TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([work, interrupted]);
    if (stop.code) throw new ImageError(stop.code);
    return result;
  }
  catch (error) {
    if (stop.code) throw new ImageError(stop.code);
    throw error;
  }
  finally { if (timer !== undefined) clearTimeout(timer); remove?.(); }
}

const nodeChildScript = `
import { ImageError, normalizeImage } from ${JSON.stringify(import.meta.url)};
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(JSON.stringify({ ok: true, result: await normalizeImage(input) }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error instanceof ImageError ? error.code : "unsupported_format" }));
  }
});
`;

function childResult(value: unknown): NormalizedImage {
  if (!value || typeof value !== "object") fail("unsupported_format");
  const result = value as { mimeType?: unknown; data?: unknown; notice?: unknown };
  if (result.mimeType !== "image/png" || !canonicalBase64(result.data) || Buffer.from(result.data, "base64").length > MAX_BYTES || (result.notice !== undefined && result.notice !== GIF_NOTICE)) fail("unsupported_format");
  try { validatePng(result.data); } catch { fail("unsupported_format"); }
  return Object.freeze({ mimeType: "image/png", data: result.data, ...(result.notice === GIF_NOTICE ? { notice: GIF_NOTICE } : {}) });
}

function startNodeDecoder(input: ImageInput): { work: Promise<NormalizedImage>; destroy: () => Promise<void> } {
  const child = spawn("node", ["--input-type=module", "--eval", nodeChildScript], {
    env: { PATH: process.env.PATH ?? "" }, stdio: ["pipe", "pipe", "ignore"],
  });
  let output = "";
  let outputBytes = 0;
  let closed = false;
  let resolveClose: (() => void) | undefined;
  const closedPromise = new Promise<void>((resolve) => { resolveClose = resolve; });
  const work = new Promise<NormalizedImage>((resolve, reject) => {
    child.once("error", () => reject(new ImageError("unsupported_format")));
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_CHILD_STDOUT) { output = ""; child.kill("SIGTERM"); return; }
      output += chunk.toString("utf8");
    });
    child.once("close", (status) => {
      closed = true; resolveClose?.();
      if (status !== 0 || outputBytes > MAX_CHILD_STDOUT) return reject(new ImageError("unsupported_format"));
      try {
        const response = JSON.parse(output) as { ok?: unknown; code?: unknown; result?: unknown };
        if (response.ok === true) return resolve(childResult(response.result));
        if (response.ok === false && (response.code === "unsupported_format" || response.code === "input_too_large" || response.code === "pixel_limit" || response.code === "cancelled" || response.code === "animated_image")) return reject(new ImageError(response.code));
      } catch { /* Invalid child output is not exposed. */ }
      reject(new ImageError("unsupported_format"));
    });
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(JSON.stringify({ mimeType: input.mimeType, data: input.data }));
  return {
    work,
    destroy: async () => {
      if (!closed) child.kill("SIGTERM");
      const force = setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, 100);
      await closedPromise;
      clearTimeout(force);
    },
  };
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
  if (!input || typeof input !== "object" || typeof input.data !== "string") fail("unsupported_format");
  if (input.data.length > 4 * Math.ceil(MAX_BYTES / 3)) fail("input_too_large");
  if (!canonicalBase64(input.data)) fail("unsupported_format");
  const encoded = Buffer.from(input.data, "base64");
  if (encoded.length > MAX_BYTES) fail("input_too_large");
  if (encoded.toString("base64") !== input.data) fail("unsupported_format");
  if (signal?.aborted) fail("cancelled");
  if (format === "png") {
    try { validatePng(input.data); return Object.freeze({ mimeType: "image/png", data: input.data }); }
    catch { /* Metadata-bearing PNGs continue through Sharp for normalization. */ }
  }
  try {
    if (runningInBun()) {
      const stop: { code?: ImageErrorCode } = {};
      const child = startNodeDecoder(input);
      return await bounded(child.work, signal, stop, child.destroy);
    }
    const stop: { code?: ImageErrorCode } = {};
    let destroy = () => {};
    return await bounded((async () => {
      const module = await import("sharp");
      const sharp = ((module as { default?: typeof import("sharp") }).default ?? module) as typeof import("sharp");
      if (stop.code) fail(stop.code);
      const source = sharp(encoded, { pages: format === "gif" ? 1 : -1, failOn: "error", limitInputPixels: false, sequentialRead: true }).timeout({ seconds: 5 });
      destroy = () => { source.destroy(); };
      const metadata = await source.metadata();
      if (stop.code) fail(stop.code);
      if (metadata.format !== format || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width < 1 || metadata.height < 1) fail("unsupported_format");
      const animated = metadata.pages !== undefined && metadata.pages > 1;
      if (format !== "gif" && animated) fail("animated_image");
      if (metadata.width > Math.floor(MAX_PIXELS / metadata.height)) fail("pixel_limit");
      const output = await source.rotate().toColourspace("srgb").png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
      if (stop.code) fail(stop.code);
      if (output.length > MAX_BYTES) fail("input_too_large");
      return Object.freeze({ mimeType: "image/png", data: strictPng(output).toString("base64"), ...(format === "gif" && animated ? { notice: GIF_NOTICE } : {}) });
    })(), signal, stop, () => destroy());
  } catch (error) {
    if (error instanceof ImageError) throw error;
    fail("unsupported_format");
  }
}

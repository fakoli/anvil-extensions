import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { validatePng } from "@anvil-serving/observations/png";
import { ImageError, normalizeImage } from "../src/images.ts";

const code = (expected) => (error) => error instanceof ImageError && error.code === expected;
const image = async (format, options = {}) => sharp({ create: { width: 2, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } })[format](options).toBuffer();
const input = async (mimeType, format, options) => ({ mimeType, data: (await image(format, options)).toString("base64") });
async function asBun(run) {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "bun");
  Object.defineProperty(process.versions, "bun", { value: "fixture", configurable: true });
  try { await run(); }
  finally {
    if (descriptor) Object.defineProperty(process.versions, "bun", descriptor);
    else delete process.versions.bun;
  }
}

test("normalizes static JPEG, WebP, GIF, and metadata-bearing PNG to strict deterministic PNG", async () => {
  for (const [mimeType, format] of [["image/jpeg", "jpeg"], ["image/webp", "webp"], ["image/gif", "gif"], ["image/png", "png"]]) {
    const source = await input(mimeType, format, format === "png" ? { compressionLevel: 9 } : undefined);
    const first = await normalizeImage(source);
    const second = await normalizeImage(source);
    assert.deepEqual(second, first);
    assert.equal(first.mimeType, "image/png");
    assert.equal(first.notice, undefined);
    assert.doesNotThrow(() => validatePng(first.data));
  }
  const metadata = await sharp({ create: { width: 2, height: 1, channels: 3, background: "red" } }).withMetadata({ density: 300 }).png().toBuffer();
  const converted = await normalizeImage({ mimeType: "image/png", data: metadata.toString("base64") });
  const normalizedMetadata = await sharp(Buffer.from(converted.data, "base64")).metadata();
  assert.equal(normalizedMetadata.exif, undefined);
});

test("normalizes only the first animated GIF frame and reports the fixed notice", async () => {
  const animated = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).gif({ loop: 0, delay: [100, 100] }).toBuffer();
  const source = { mimeType: "image/gif", data: animated.toString("base64") };
  const first = await normalizeImage(source);
  const second = await normalizeImage(source);
  assert.deepEqual(second, first);
  assert.equal(first.notice, "Animated GIF: only the first frame is available for inspection; motion and later frames are not included.");
  assert.doesNotThrow(() => validatePng(first.data));
  const firstFrame = await sharp(Buffer.from(first.data, "base64")).raw().toBuffer();
  assert.deepEqual([...firstFrame.subarray(0, 3)], [255, 0, 0]);
});

test("respects JPEG orientation before producing strict PNG", async () => {
  const source = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 2, height: 1, channels: 3 } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await normalizeImage({ mimeType: "image/jpeg", data: source.toString("base64") });
  const metadata = await sharp(Buffer.from(result.data, "base64")).metadata();
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 2);
  assert.doesNotThrow(() => validatePng(result.data));
});

test("rejects malformed, mismatched, animated, oversized, and too-large-pixel inputs", async () => {
  await assert.rejects(normalizeImage({ mimeType: "image/svg+xml", data: "PHN2Zy8+" }), code("unsupported_format"));
  await assert.rejects(normalizeImage({ mimeType: "image/png", data: "not-base64" }), code("unsupported_format"));
  const jpeg = await input("image/jpeg", "jpeg");
  await assert.rejects(normalizeImage({ mimeType: "image/png", data: jpeg.data }), code("unsupported_format"));
  const animated = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), { raw: { width: 1, height: 2, channels: 3, pageHeight: 1 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await assert.rejects(normalizeImage({ mimeType: "image/webp", data: animated.toString("base64") }), code("animated_image"));
  await assert.rejects(normalizeImage({ mimeType: "image/jpeg", data: Buffer.alloc(8 * 1024 * 1024 + 1).toString("base64") }), code("input_too_large"));
  const pixels = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: "black" } }).jpeg().toBuffer();
  await assert.rejects(normalizeImage({ mimeType: "image/jpeg", data: pixels.toString("base64") }), code("pixel_limit"));
});

test("rejects a cancelled normalization before decoder work", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(normalizeImage(await input("image/png", "png"), controller.signal), code("cancelled"));
});

test("uses the bounded Node decoder under Bun and terminates it on cancellation", async () => {
  const jpeg = await input("image/jpeg", "jpeg");
  await asBun(async () => {
    const normalized = await normalizeImage(jpeg);
    assert.equal(normalized.mimeType, "image/png");
    assert.doesNotThrow(() => validatePng(normalized.data));
    const controller = new AbortController();
    const cancelled = normalizeImage(jpeg, controller.signal);
    queueMicrotask(() => controller.abort());
    await assert.rejects(cancelled, code("cancelled"));
  });
});

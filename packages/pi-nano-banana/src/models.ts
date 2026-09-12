// Model aliases, aspect/size validation, and endpoint resolution.
// Port of nanobanana.py MODEL_MAP / ASPECTS / build_request validation.
// Alias table verified against Google's model pages 2026-09-05 and re-checked
// 2026-09-12 (gemini-3-pro-image stable, gemini-3.1-flash-image).

export const MODEL_MAP: Record<string, string> = {
  pro: "gemini-3-pro-image",
  flash: "gemini-3.1-flash-image",
};

export const DEFAULTS = {
  default_model: "pro",
  default_aspect: "1:1",
  default_size: "",
  output_dir: "./.nanobanana/out",
  max_remix_images: 2,
} as const;

export const ASPECTS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
] as const;

export const FLASH_ASPECTS = ["1:4", "4:1", "1:8", "8:1"] as const;

export const ALL_ASPECTS = [...ASPECTS, ...FLASH_ASPECTS] as const;

/** REST sizes; the legacy "512px" alias is accepted on input and mapped to "512". */
export const SIZES = ["512", "1K", "2K", "4K"] as const;

export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
export const MAX_REQUEST_BYTES = 20_000_000;
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;

const MODEL_RE = /^gemini-[a-zA-Z0-9._-]+$/;

/** Resolve an alias (pro/flash) or explicit ID to a raw model ID (no "models/" prefix). */
export function resolveModel(name: string): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("Model must be pro, flash, or an explicit Gemini model ID");
  }
  const model = MODEL_MAP[name] ?? name.replace(/^models\//, "");
  if (!MODEL_RE.test(model)) {
    throw new Error("Model must be pro, flash, or an explicit Gemini model ID");
  }
  return model;
}

/** v1beta for preview IDs, v1 for everything else. */
export function getEndpoint(modelName: string): string {
  const model = resolveModel(modelName);
  const version = model.includes("preview") ? "v1beta" : "v1";
  return `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface BuiltRequest {
  body: Record<string, unknown>;
  bytes: number;
}

/**
 * Build the generateContent request with documented ImageConfig fields.
 * Throws (before any API call) for known-incompatible parameter/model pairs.
 */
export function buildRequest(
  parts: GeminiPart[],
  aspect: string,
  size: string | null,
  useSearch: boolean,
  model: string,
): BuiltRequest {
  const modelId = resolveModel(model);
  if (!ALL_ASPECTS.includes(aspect as (typeof ALL_ASPECTS)[number])) {
    throw new Error("Unsupported aspect ratio");
  }
  if (size && !["512", "512px", "1K", "2K", "4K"].includes(size)) {
    throw new Error("Size must be 512, 1K, 2K, or 4K");
  }
  if (
    (modelId === "gemini-3-pro-image" || modelId === "gemini-3-pro-image-preview") &&
    (size === "512" || size === "512px" || FLASH_ASPECTS.includes(aspect as (typeof FLASH_ASPECTS)[number]))
  ) {
    throw new Error("512 and extreme aspect ratios require the flash model");
  }
  if (modelId === "gemini-2.5-flash-image" && (size || useSearch || FLASH_ASPECTS.includes(aspect as (typeof FLASH_ASPECTS)[number]))) {
    throw new Error("Gemini 2.5 Flash Image does not support size tiers, search, or extreme aspect ratios");
  }
  const imageConfig: Record<string, string> = { aspectRatio: aspect };
  if (size) imageConfig.imageSize = size === "512px" ? "512" : size;
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig },
  };
  if (useSearch) body.tools = [{ google_search: {} }];
  const json = JSON.stringify(body);
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_REQUEST_BYTES) {
    throw new Error("Request exceeds 20 MB; reduce reference image sizes or count");
  }
  return { body, bytes };
}

/** python round() parity: round-half-to-even. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}
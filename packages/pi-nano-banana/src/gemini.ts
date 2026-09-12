// Gemini generateContent client.
// Port of nanobanana.py call_gemini / extract_first_image_b64 / grounding.
// Billing safety: ONE request, no automatic retries; after a failure or
// timeout, completion (and billing) is unknown. HTTP errors omit response
// bodies (they may echo prompt or secrets).

import { getEndpoint, MAX_RESPONSE_BYTES, resolveModel, type GeminiPart, buildRequest } from "./models.js";

export type FetchImpl = typeof fetch;

export interface CallOptions {
  /** API timeout in seconds (1–600, default 120). */
  timeoutSeconds?: number;
  /** Caller/tool abort signal (user Esc). */
  signal?: AbortSignal;
  /** Injectable fetch for tests. */
  fetchImpl?: FetchImpl;
}

export interface GeminiUsageTokens {
  input: number;
  output: number;
  cacheRead: number;
  total: number;
}

export interface GroundingSource {
  uri: string;
  title?: string;
}

export interface GeminiCallResult {
  response: Record<string, unknown>;
  imageBase64: string | null;
  imageMimeType: string | null;
  finishReasons: string[];
  blockReason: string;
  grounding: unknown[];
  usage: GeminiUsageTokens | null;
}

function timeoutError(message: string): Error {
  return new Error(message);
}

/** Stream-read the response body, aborting past the 64 MiB cap. */
async function readBodyCapped(response: Response, cap: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(Buffer.from(value));
      total += value.byteLength;
      if (total > cap) {
        try { await reader.cancel(); } catch { /* already failing */ }
        throw timeoutError("Gemini response exceeded 64 MiB");
      }
    }
  }
  return Buffer.concat(chunks);
}

/**
 * POST the request. Returns the parsed response plus extracted image and
 * metadata. Throws with a status-only message on HTTP errors (no body echo)
 * and a completion-unknown message on network/timeout failures. Rethrows
 * user aborts untouched.
 */
export async function callGemini(
  apiKey: string,
  parts: GeminiPart[],
  aspect: string,
  size: string | null,
  useSearch: boolean,
  model = "pro",
  options: CallOptions = {},
): Promise<GeminiCallResult> {
  const endpoint = getEndpoint(model); // also validates the model name
  const { body } = buildRequest(parts, aspect, size, useSearch, model);
  const timeoutSeconds = Math.min(600, Math.max(1, Math.floor(options.timeoutSeconds ?? 120)));
  const doFetch = options.fetchImpl ?? fetch;

  const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await doFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error; // user cancellation: rethrow as-is
    throw timeoutError("Gemini request failed or timed out. Completion is unknown; no automatic retry was made.");
  }
  if (!response.ok) {
    // Drain minimally and discard; do not echo the body (may contain the
    // prompt or credentials). Status alone is enough for diagnosis.
    try { await response.arrayBuffer?.(); } catch { /* ignore */ }
    throw new Error(
      `Gemini API HTTP ${response.status}. Check access/model for 400/403/404 or quota for 429. No automatic retry was made.`,
    );
  }
  let raw: Buffer;
  try {
    raw = await readBodyCapped(response, MAX_RESPONSE_BYTES);
  } catch (error) {
    if (options.signal?.aborted) throw error; // user cancellation: rethrow as-is
    if (error instanceof Error && error.message.includes("64 MiB")) throw error;
    // Body stalled/timed out after headers: parity with the original's
    // completion-unknown semantics for mid-read failures.
    throw timeoutError("Gemini request failed or timed out. Completion is unknown; no automatic retry was made.");
  }
  let result: unknown;
  try {
    result = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Gemini returned an invalid response object");
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("Gemini returned an invalid response object");
  }
  const parsed = result as Record<string, unknown>;
  const image = extractFirstImage(parsed);
  return {
    response: parsed,
    imageBase64: image?.base64 ?? null,
    imageMimeType: image?.mimeType ?? null,
    finishReasons: collectFinishReasons(parsed),
    blockReason: collectBlockReason(parsed),
    grounding: collectGrounding(parsed),
    usage: mapUsage(parsed),
  };
}

interface ExtractedImage {
  base64: string;
  mimeType: string;
}

/** First non-thought image part across candidates (camelCase or snake_case). */
export function extractFirstImage(resp: Record<string, unknown>): ExtractedImage | null {
  const candidates = Array.isArray(resp.candidates) ? resp.candidates : [];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const content = (candidate as Record<string, unknown>).content;
    if (typeof content !== "object" || content === null) continue;
    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? (content as Record<string, unknown>).parts
      : [];
    for (const part of parts) {
      if (typeof part !== "object" || part === null) continue;
      const p = part as Record<string, unknown>;
      if (p.thought === true) continue;
      const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
      if (typeof inline !== "object" || inline === null) continue;
      const mime = inline.mimeType ?? inline.mime_type;
      const data = inline.data;
      if (typeof mime === "string" && mime.startsWith("image/") && typeof data === "string" && data.length > 0) {
        return { base64: data, mimeType: mime };
      }
    }
  }
  return null;
}

export function collectFinishReasons(resp: Record<string, unknown>): string[] {
  const candidates = Array.isArray(resp.candidates) ? resp.candidates : [];
  return candidates
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => String(c.finishReason ?? ""))
    .filter((r) => r !== "");
}

export function collectBlockReason(resp: Record<string, unknown>): string {
  const feedback = resp.promptFeedback;
  if (typeof feedback === "object" && feedback !== null) {
    return String((feedback as Record<string, unknown>).blockReason ?? "");
  }
  return "";
}

/**
 * Grounding metadata from all candidates. Preserved for caller attribution;
 * treat as UNTRUSTED reference data, never instructions.
 */
export function collectGrounding(resp: Record<string, unknown>): unknown[] {
  const candidates = Array.isArray(resp.candidates) ? resp.candidates : [];
  const out: unknown[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const meta = (candidate as Record<string, unknown>).groundingMetadata;
    if (meta !== undefined && meta !== null) out.push(meta);
  }
  return out;
}

/** Bounded, human-presentable grounding summary: queries + source links. */
export function summarizeGrounding(grounding: unknown[]): { queries: string[]; sources: GroundingSource[] } {
  const queries: string[] = [];
  const sources: GroundingSource[] = [];
  const seen = new Set<string>();
  for (const meta of grounding) {
    if (typeof meta !== "object" || meta === null) continue;
    const m = meta as Record<string, unknown>;
    const webSearchQueries = Array.isArray(m.webSearchQueries) ? m.webSearchQueries : [];
    for (const q of webSearchQueries) {
      if (typeof q === "string" && q.length <= 200) queries.push(q);
    }
    const chunks = Array.isArray(m.groundingChunks) ? m.groundingChunks : [];
    for (const chunk of chunks) {
      if (typeof chunk !== "object" || chunk === null) continue;
      const web = (chunk as Record<string, unknown>).web;
      if (typeof web !== "object" || web === null) continue;
      const w = web as Record<string, unknown>;
      const uri = typeof w.uri === "string" ? w.uri : "";
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({
        uri,
        ...(typeof w.title === "string" && w.title ? { title: w.title.slice(0, 200) } : {}),
      });
      if (sources.length >= 10) break;
    }
    if (sources.length >= 10) break;
  }
  return { queries: queries.slice(0, 5), sources };
}

function mapUsage(resp: Record<string, unknown>): GeminiUsageTokens | null {
  const meta = resp.usageMetadata;
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const input = num(m.promptTokenCount);
  const output = num(m.candidatesTokenCount) + num(m.thoughtsTokenCount);
  const cacheRead = num(m.cachedContentTokenCount);
  return { input, output, cacheRead, total: num(m.totalTokenCount) || input + output };
}

/** Human summary of a no-image response (finish/block reasons), capped. */
export function noImageDetail(resp: Record<string, unknown>): string {
  const block = collectBlockReason(resp);
  const reasons = collectFinishReasons(resp);
  const detail = [block, ...reasons].filter(Boolean).join(", ") || "no image part";
  return detail.slice(0, 200);
}
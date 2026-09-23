import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, AssistantMessageEvent, Context, Model } from "@earendil-works/pi-ai";

const MAX_QUESTION_BYTES = 512;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_FACTS = 32;
const MAX_FACT_BYTES = 512;
const MAX_REASON_BYTES = 256;
const MAX_TIMEOUT_MS = 30_000;

export const VISION_INSTRUCTIONS = `Inspect only the supplied image and answer the question using exactly one JSON object. Do not call tools, describe actions, or include markdown. The object must have exactly inspection_status, facts, and reason. inspection_status is observed, inconclusive, or unsupported. For observed, reason must be an empty string and facts contains only literal visible_text or unverified visual_fact entries. For inconclusive or unsupported, facts must be empty. Each fact has exactly kind, text, uncertainty, region_ref; uncertainty is literal_unverified, unverified_interpretation, or unreadable; unreadable text is empty; region_ref is null.`;

export type VisionErrorCode =
  | "endpoint_unavailable"
  | "deadline_exceeded"
  | "cancelled"
  | "invalid_response"
  | "result_too_large"
  | "question_required";

export class VisionError extends Error {
  readonly code: VisionErrorCode;

  constructor(code: VisionErrorCode) {
    super(code);
    this.name = "VisionError";
    this.code = code;
  }
}

export type VisionFact = {
  kind: "visible_text" | "visual_fact";
  text: string;
  uncertainty: "literal_unverified" | "unverified_interpretation" | "unreadable";
  region_ref: null;
};

export type VisionInspection = {
  inspection_status: "observed" | "inconclusive" | "unsupported";
  facts: VisionFact[];
  reason: string;
};

export type VisionInspectionRequest = {
  image: { mimeType: "image/png"; data: Buffer };
  question: string;
  signal: AbortSignal;
};

export type VisionModelSelection = {
  provider: string;
  model: string;
  /** Trusted configuration may shorten, but never lengthen, the hard deadline. */
  timeoutMs?: number;
};

export type VisionInspector = (request: VisionInspectionRequest) => Promise<VisionInspection>;

const bytes = (value: string) => Buffer.byteLength(value, "utf8");

function fail(code: VisionErrorCode): never {
  throw new VisionError(code);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return plainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function containsMedia(value: string): boolean {
  return value.toLowerCase().includes("data:image/");
}

function validFact(value: unknown): value is VisionFact {
  if (!exactKeys(value, ["kind", "text", "uncertainty", "region_ref"])) return false;
  return (
    (value.kind === "visible_text" || value.kind === "visual_fact") &&
    typeof value.text === "string" &&
    bytes(value.text) <= MAX_FACT_BYTES &&
    !containsMedia(value.text) &&
    (value.uncertainty === "literal_unverified" || value.uncertainty === "unverified_interpretation" || value.uncertainty === "unreadable") &&
    value.region_ref === null &&
    (value.uncertainty !== "unreadable" || value.text === "")
  );
}

export function parseVisionInspection(value: unknown): VisionInspection {
  if (!exactKeys(value, ["inspection_status", "facts", "reason"])) fail("invalid_response");
  if (!Array.isArray(value.facts) || value.facts.length > MAX_FACTS || !value.facts.every(validFact)) fail("invalid_response");
  if (typeof value.reason !== "string" || bytes(value.reason) > MAX_REASON_BYTES || containsMedia(value.reason)) fail("invalid_response");
  if (value.inspection_status === "observed" && value.reason === "") {
    return { inspection_status: "observed", facts: value.facts, reason: "" };
  }
  if ((value.inspection_status === "inconclusive" || value.inspection_status === "unsupported") && value.facts.length === 0) {
    return { inspection_status: value.inspection_status, facts: [], reason: value.reason };
  }
  fail("invalid_response");
}

function validSelection(value: unknown): value is VisionModelSelection {
  return plainObject(value) && typeof value.provider === "string" && value.provider.length > 0 && typeof value.model === "string" && value.model.length > 0;
}

function timeoutFor(selection: VisionModelSelection): number {
  const timeoutMs = selection.timeoutMs ?? MAX_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail("endpoint_unavailable");
  return timeoutMs;
}

function awaitWithAbort<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new VisionError("cancelled"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => settle(reject, new VisionError("cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then(
      (result) => {
        signal.aborted ? settle(reject, new VisionError("cancelled")) : settle(resolve, result);
      },
      () => {
        settle(reject, new VisionError("endpoint_unavailable"));
      }
    );
  });
}

function responseText(message: AssistantMessage): string {
  let total = 0;
  let text = "";
  for (const content of message.content) {
    if (content.type !== "text" && content.type !== "thinking") fail("invalid_response");
    const part = content.type === "text" ? content.text : content.thinking;
    total += bytes(part);
    if (total > MAX_OUTPUT_BYTES) fail("result_too_large");
    if (content.type === "text") text += content.text;
  }
  return text;
}

function parseResponse(message: AssistantMessage): VisionInspection {
  try {
    return parseVisionInspection(JSON.parse(responseText(message)));
  } catch (error) {
    if (error instanceof VisionError) throw error;
    fail("invalid_response");
  }
}

/**
 * Builds the sole adapter from an explicitly configured Pi registry model to
 * the owner callback. It intentionally does not read settings or pick models.
 */
export function createVisionInspector(registry: ExtensionContext["modelRegistry"], selection: VisionModelSelection): VisionInspector {
  if (!validSelection(selection)) fail("endpoint_unavailable");
  const timeoutMs = timeoutFor(selection);
  return async ({ image, question, signal }) => {
    if (image?.mimeType !== "image/png" || !Buffer.isBuffer(image.data) || image.data.length === 0) fail("invalid_response");
    if (typeof question !== "string" || !question || bytes(question) > MAX_QUESTION_BYTES) fail("question_required");
    if (signal.aborted) fail("cancelled");

    let model: Model<any> | undefined;
    let provider: ReturnType<ExtensionContext["modelRegistry"]["getProvider"]>;
    try {
      model = registry.find(selection.provider, selection.model);
      provider = model && registry.getProvider(model.provider);
    } catch {
      fail("endpoint_unavailable");
    }
    if (!model || model.provider !== selection.provider || model.id !== selection.model || !provider || !Array.isArray(model.input) || !model.input.includes("image")) fail("endpoint_unavailable");

    const deadline = new AbortController();
    let expired = false;
    let closed = false;
    const onAbort = () => deadline.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      expired = true;
      deadline.abort();
    }, timeoutMs);
    let iterator: AsyncIterator<AssistantMessageEvent> | undefined;
    let iteratorComplete = false;

    try {
      const auth = await awaitWithAbort(registry.getApiKeyAndHeaders(model), deadline.signal);
      if (closed || deadline.signal.aborted) fail(expired ? "deadline_exceeded" : "cancelled");
      if (!auth.ok) fail("endpoint_unavailable");

      const requestModel: Model<any> = auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model;
      const context: Context = {
        systemPrompt: VISION_INSTRUCTIONS,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: question },
            { type: "image", mimeType: "image/png", data: image.data.toString("base64") },
          ],
          timestamp: Date.now(),
        }],
      };
      const stream = provider.stream(requestModel, context, {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        signal: deadline.signal,
        timeoutMs,
        maxRetries: 0,
        maxTokens: 1024,
      });

      let outputBytes = 0;
      iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const next = await awaitWithAbort(Promise.resolve().then(() => iterator!.next()), deadline.signal);
        if (next.done) {
          iteratorComplete = true;
          fail("invalid_response");
        }
        const event = next.value;
        if (closed || deadline.signal.aborted) fail(expired ? "deadline_exceeded" : "cancelled");
        switch (event.type) {
          case "text_delta":
          case "thinking_delta":
            outputBytes += bytes(event.delta);
            if (outputBytes > MAX_OUTPUT_BYTES) {
              deadline.abort();
              fail("result_too_large");
            }
            break;
          case "start":
          case "text_start":
          case "text_end":
          case "thinking_start":
          case "thinking_end":
            break;
          case "done":
            if (event.reason !== "stop" || event.message.stopReason !== "stop") fail("invalid_response");
            return parseResponse(event.message);
          case "error":
            fail(event.reason === "aborted" ? (expired ? "deadline_exceeded" : "cancelled") : "endpoint_unavailable");
          case "toolcall_start":
          case "toolcall_delta":
          case "toolcall_end":
            deadline.abort();
            fail("invalid_response");
          default:
            deadline.abort();
            fail("invalid_response");
        }
      }
    } catch (error) {
      if (error instanceof VisionError) {
        if (expired && error.code === "cancelled") fail("deadline_exceeded");
        throw error;
      }
      if (expired) fail("deadline_exceeded");
      if (deadline.signal.aborted) fail("cancelled");
      fail("endpoint_unavailable");
    } finally {
      closed = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      deadline.abort();
      if (iterator && !iteratorComplete && iterator.return) {
        try { void Promise.resolve(iterator.return()).catch(() => {}); } catch { /* best-effort only */ }
      }
    }
  };
}

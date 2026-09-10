// pi-summerize — one prose commentary via a secondary model.
// Mirrors pi-condense/src/summarizer.ts call discipline: pre-stream auth,
// seat baseUrl override, idle+ceiling aborts with both timers cleared on every
// exit path, classified outcomes instead of throws. Instructions ride in the
// user message (pi-condense shape — no options.systemPrompt). No markdown in
// the output; the paragraph is sanitized before render.

import { stream } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const COMMENTARY_INSTRUCTIONS = `You are a terse commentator observing an AI coding agent session for the user.
Below is the activity since your last commentary and the most recent conversation turns.
Write ONE short paragraph of plain prose (1-3 sentences, under 80 words) for the user:
- what the agent just did and what it means
- note anything unresolved or next, if evident
- be specific (name files, commands, outcomes); no filler, no pleasantries
Rules: single paragraph only. No markdown, no headings, no bullets, no code fences. Never invent details not present in the observation.`;

export type CommentaryOutcome =
  | { kind: "ok"; text: string }
  | { kind: "auth" | "unusable" | "transient"; message: string };

export function modelLabel(model: any): string {
  if (!model) return "unknown model";
  return model.name || `${model.provider}/${model.id}`;
}

export function resolveModel(modelSpec: string, ctx: ExtensionContext): { model: any; warning?: string } {
  if (modelSpec === "default") return { model: ctx.model };
  const slashIndex = modelSpec.indexOf("/");
  if (slashIndex === -1) {
    return { model: ctx.model, warning: `invalid PI_SUMMERIZE_MODEL "${modelSpec}", expected "provider/model-id"; using current model` };
  }
  const provider = modelSpec.slice(0, slashIndex);
  const modelId = modelSpec.slice(slashIndex + 1);
  const found = ctx.modelRegistry.find(provider, modelId);
  if (!found) {
    return { model: ctx.model, warning: `model "${modelSpec}" not in registry; using current model` };
  }
  return { model: found };
}

/** Collapse markdown-ish output into one plain paragraph, hard-capped. */
export function sanitizeParagraph(raw: string, maxChars: number): string {
  const noBullets = raw
    .split("\n")
    .map((line) => {
      let l = line.trim();
      l = l.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)/, "");
      // code fences and stray fence markers
      l = l.replace(/^```[\w-]*\s*$/, "");
      l = l.replace(/```/g, "");
      // inline code + emphasis markers
      l = l.replace(/`([^`]*)`/g, "$1");
      l = l.replace(/\*\*([^*]+)\*\*/g, "$1");
      l = l.replace(/\*([^*]+)\*/g, "$1");
      l = l.replace(/__([^_]+)__/g, "$1");
      l = l.replace(/_([^_]+)_/g, "$1");
      // markdown links -> link text
      l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
      return l.trim();
    })
    .filter(Boolean)
    .join(" ");
  const collapsed = noBullets.replace(/\s+/g, " ").trim();
  // the closing " …" lives inside the cap: reserve its width before cutting
  const budget = Math.max(1, maxChars - 2);
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + " …";
}

export function isUsableParagraph(text: string): boolean {
  return text.trim().length >= 20;
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((s): s is AbortSignal => !!s);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return AbortSignal.any(present);
}

/**
 * One commentary attempt. Never throws (returns classified outcomes) so the
 * agent_settled handler can stay fire-and-forget. `signal` is the caller's
 * external abort (disable/supersede), combined with the internal timers.
 */
export async function runCommentary(
  model: any,
  instructions: string,
  observation: string,
  config: { maxTimeoutMs: number; idleTimeoutMs: number; maxOutputChars: number },
  ctx: ExtensionContext,
  signal?: AbortSignal
): Promise<CommentaryOutcome> {
  const timeoutController = new AbortController();
  let timedOut = false;
  let timeoutKind: "idle" | "ceiling" | null = null;
  let idleTimerId: ReturnType<typeof setTimeout> | null = null;
  let ceilingTimerId: ReturnType<typeof setTimeout> | null = null;

  const bumpIdle = () => {
    if (idleTimerId !== null) clearTimeout(idleTimerId);
    if (config.idleTimeoutMs > 0) {
      idleTimerId = setTimeout(() => {
        timedOut = true;
        timeoutKind = "idle";
        timeoutController.abort();
      }, config.idleTimeoutMs);
    }
  };

  try {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      const authMessage = "error" in auth ? auth.error : "authentication failed";
      return { kind: "auth", message: authMessage };
    }

    // Mirror the main loop: resolved auth baseUrl must win over the static
    // model baseUrl (seat-specific hosts 421 other seats).
    const providerAuth = await ctx.modelRegistry.getProviderAuth(model.provider);
    const effectiveModel = providerAuth?.auth.baseUrl
      ? { ...model, baseUrl: providerAuth.auth.baseUrl }
      : model;

    const responseStream = stream(
      effectiveModel,
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${instructions}\n\n---\n\n${observation}` }],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: combineSignals(signal, timeoutController.signal),
      }
    );

    // Ceiling arms once at call start; idle arms/resets on every stream event.
    if (config.maxTimeoutMs > 0) {
      ceilingTimerId = setTimeout(() => {
        timedOut = true;
        timeoutKind ??= "ceiling";
        timeoutController.abort();
      }, config.maxTimeoutMs);
    }
    bumpIdle();

    for await (const _event of responseStream) {
      bumpIdle();
      if (signal?.aborted) break;
    }

    if (signal?.aborted) {
      return { kind: "transient", message: "commentary aborted (superseded or disabled)" };
    }

    const response = await responseStream.result();
    if (response.stopReason === "aborted") {
      return timedOut
        ? { kind: "transient", message: `commentary ${modelLabel(model)} ${timeoutKind === "ceiling" ? "exceeded ceiling" : "stalled"}` }
        : { kind: "transient", message: "commentary stream aborted" };
    }
    if (response.stopReason === "error") {
      return { kind: "transient", message: response.errorMessage ?? "commentary stopped with reason: error" };
    }

    const text = response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    const paragraph = sanitizeParagraph(text, config.maxOutputChars);
    if (!isUsableParagraph(paragraph)) return { kind: "unusable", message: "empty commentary" };
    return { kind: "ok", text: paragraph };
  } catch (error) {
    if (signal?.aborted) {
      return { kind: "transient", message: "commentary aborted (superseded or disabled)" };
    }
    if (timedOut) {
      return {
        kind: "transient",
        message: `commentary ${modelLabel(model)} ${timeoutKind === "ceiling" ? "exceeded ceiling" : "stalled"}`,
      };
    }
    return { kind: "transient", message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (idleTimerId !== null) clearTimeout(idleTimerId);
    if (ceilingTimerId !== null) clearTimeout(ceilingTimerId);
  }
}
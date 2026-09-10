// pi-summerize — one prose commentary via a secondary model.
// Mirrors pi-condense/src/summarizer.ts call discipline: pre-stream auth,
// seat baseUrl override, idle+ceiling aborts, classified outcomes instead of
// throws. No markdown in the output; the paragraph is sanitized before render.

import { stream } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const COMMENTARY_SYSTEM_PROMPT = `You are a terse commentator observing an AI coding agent session for the user.
You receive the activity since your last commentary and the most recent conversation turns.
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
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)/, "").trim())
    .filter(Boolean)
    .join(" ");
  const collapsed = noBullets.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + " …";
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
 * agent_settled handler can stay fire-and-forget.
 */
export async function runCommentary(
  model: any,
  systemPrompt: string,
  observation: string,
  config: { maxTimeoutMs: number; idleTimeoutMs: number; maxOutputChars: number },
  ctx: ExtensionContext
): Promise<CommentaryOutcome> {
  const timeoutController = new AbortController();
  let timedOut = false;
  let timeoutKind: "idle" | "ceiling" | null = null;
  let idleTimerId: ReturnType<typeof setTimeout> | null = null;

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

    const providerAuth = await ctx.modelRegistry.getProviderAuth(model.provider);
    const effectiveModel = providerAuth?.auth.baseUrl
      ? { ...model, baseUrl: providerAuth.auth.baseUrl }
      : model;

    const responseStream = stream(
      effectiveModel,
      {
        systemPrompt,
        messages: [
          { role: "user", content: [{ type: "text", text: observation }], timestamp: Date.now() },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: combineSignals(undefined, timeoutController.signal),
      }
    );

    const ceilingTimerId = setTimeout(() => {
      timedOut = true;
      timeoutKind ??= "ceiling";
      timeoutController.abort();
    }, config.maxTimeoutMs);
    bumpIdle();

    for await (const _event of responseStream) {
      bumpIdle();
    }
    clearTimeout(ceilingTimerId);

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
    if (timedOut) {
      return {
        kind: "transient",
        message: `commentary ${modelLabel(model)} ${timeoutKind === "ceiling" ? "exceeded ceiling" : "stalled"}`,
      };
    }
    return { kind: "transient", message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (idleTimerId !== null) clearTimeout(idleTimerId);
  }
}
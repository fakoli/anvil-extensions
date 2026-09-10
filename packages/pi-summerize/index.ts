// pi-summerize — a small prose commentary after the agent goes idle.
// Companion to pi-insights (which owns the deterministic status line): when
// the agent settles, this extension asks a secondary model for a ONE-paragraph
// commentary on what just happened and renders it as a widget below the editor.
//
// Contract: observational + fire-and-forget. Never mutates tool results, never
// injects LLM-visible context, never writes memory. In print/JSON mode it is
// silent (no model calls, no output).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readConfig, type SummerizeConfig } from "./src/config.js";
import { collectTurns, countActivity, renderObservation, EMPTY_COUNTS, type ActivityCounts } from "./src/collect.js";
import { resolveModel, runCommentary, modelLabel } from "./src/commentator.js";
import { WIDGET_KEY, commentaryWidget, fallbackLine } from "./src/render.js";

interface State {
  sessionOn: boolean;
  turnsSinceCommentary: number;
  lastCommentaryAt: number | null;
  lastText: string;
  inFlight: boolean;
  generation: number;
  warnedModel: boolean;
}

export default function (pi: ExtensionAPI): void {
  const config: SummerizeConfig = readConfig();
  const state: State = {
    sessionOn: true,
    turnsSinceCommentary: 0,
    lastCommentaryAt: null,
    lastText: "",
    inFlight: false,
    generation: 0,
    warnedModel: false,
  };

  const uiOk = (ctx: ExtensionContext): boolean =>
    config.enabled && state.sessionOn && ctx.hasUI && (ctx.mode === "tui" || ctx.mode === "rpc");

  function show(ctx: ExtensionContext, paragraph: string): void {
    try {
      ctx.ui.setWidget(WIDGET_KEY, commentaryWidget(paragraph), { placement: "belowEditor" });
      state.lastText = paragraph;
    } catch {
      // display failures never fail the agent turn
    }
  }

  function maybeCommentary(ctx: ExtensionContext, force: boolean): void {
    if (!uiOk(ctx) || state.inFlight) return;
    const now = Date.now();
    if (!force && state.turnsSinceCommentary <= 0) return;
    const since = state.lastCommentaryAt === null ? Infinity : now - state.lastCommentaryAt;
    if (!force && since < config.minIntervalMs) return;

    let branch: Array<Record<string, unknown>>;
    try {
      branch = ctx.sessionManager.getBranch() as unknown as Array<Record<string, unknown>>;
    } catch {
      return;
    }
    const turns = collectTurns(branch, { maxTurns: 8, maxChars: config.maxInputChars });
    const counts = countActivity(branch);
    if (!force && counts.toolCalls === 0) return; // nothing to comment on

    state.turnsSinceCommentary = 0;
    state.lastCommentaryAt = now;
    state.inFlight = true;
    const generation = ++state.generation;

    void (async () => {
      try {
        const { model, warning } = resolveModel(config.model, ctx);
        if (warning && !state.warnedModel) {
          state.warnedModel = true;
          ctx.ui.notify(`pi-summerize: ${warning}`, "warning");
        }
        const observation = renderObservation(turns, counts);
        const outcome = await runCommentary(
          model,
          // systemPrompt + one user observation; caps come from config
          COMMENTARY_SYSTEM_PROMPT,
          observation,
          { maxTimeoutMs: config.maxTimeoutMs, idleTimeoutMs: config.idleTimeoutMs, maxOutputChars: config.maxOutputChars },
          ctx
        );
        if (generation !== state.generation) return; // superseded or disabled mid-flight
        if (outcome.kind === "ok") {
          show(ctx, outcome.text);
        } else {
          // fallback keeps the widget alive without touching the fleet again
          show(ctx, fallbackLine(counts));
          if (outcome.kind !== "unusable") {
            ctx.ui.notify(`pi-summerize: commentary unavailable (${outcome.message}); showed activity summary`, "info");
          }
        }
      } catch {
        // fire-and-forget: never fail the settled turn
      } finally {
        if (generation === state.generation) state.inFlight = false;
      }
    })();
  }

  // --- signals --------------------------------------------------------------

  pi.on("turn_end", async () => {
    try {
      state.turnsSinceCommentary += 1;
    } catch {
      // counting is best-effort
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    try {
      maybeCommentary(ctx, false);
    } catch {
      // never fail the settled turn
    }
  });

  // --- lifecycle ------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    try {
      state.turnsSinceCommentary = 0;
      state.lastCommentaryAt = null;
      state.inFlight = false;
      state.generation += 1; // invalidate any in-flight call from a restored session
      if (uiOk(ctx)) {
        try {
          ctx.ui.setWidget(WIDGET_KEY, undefined);
        } catch {
          // best effort
        }
        state.lastText = "";
      }
    } catch {
      // lifecycle failures must not block the session
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      state.generation += 1; // cancel any in-flight commentary
    } catch {
      // best effort
    }
  });

  // --- command --------------------------------------------------------------

  pi.registerCommand("summerize", {
    description: "Compose idle commentary now; /summerize on|off|status for control",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "off") {
        state.sessionOn = false;
        state.generation += 1; // invalidate any in-flight commentary
        try {
          if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
        } catch {
          // best effort
        }
        state.lastText = "";
        ctx.ui.notify("pi-summerize: off for this session", "info");
        return;
      }
      if (arg === "on") {
        state.sessionOn = true;
        ctx.ui.notify("pi-summerize: on", "info");
        return;
      }
      if (arg === "status") {
        const { model } = resolveModel(config.model, ctx);
        const when = state.lastCommentaryAt === null ? "never" : `${Math.round((Date.now() - state.lastCommentaryAt) / 1000)}s ago`;
        ctx.ui.notify(
          `pi-summerize: ${config.enabled && state.sessionOn ? "on" : "off"} · model ${modelLabel(model)} · last ${when}` +
            (state.lastText ? `\n${state.lastText}` : ""),
          "info"
        );
        return;
      }
      maybeCommentary(ctx, true);
      ctx.ui.notify("pi-summerize: composing…", "info");
    },
  });
}
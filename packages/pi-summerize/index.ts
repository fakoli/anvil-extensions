// pi-summerize — a small prose commentary after the agent goes idle.
// Companion to pi-insights (which owns the deterministic status line): when
// the agent settles, this extension asks a secondary model for a ONE-paragraph
// commentary on what just happened and renders it as a widget below the editor.
//
// Contract: observational + fire-and-forget. Never mutates tool results, never
// injects LLM-visible context, never writes memory. In print/JSON mode it is
// silent (no model calls, no output, no notify).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readConfig, type SummerizeConfig } from "./src/config.js";
import { collectTurns, countActivity, renderObservation } from "./src/collect.js";
import { resolveModel, runCommentary, modelLabel, COMMENTARY_INSTRUCTIONS } from "./src/commentator.js";
import { WIDGET_KEY, commentaryWidget, wrapPlain, fallbackLine } from "./src/render.js";

interface ActiveRequest {
  abort: AbortController;
  branchLengthAtLaunch: number;
}

interface State {
  sessionOn: boolean;
  turnsSinceCommentary: number;
  lastCommentaryAt: number | null;
  lastText: string;
  active: ActiveRequest | null;
  lastError: string | null;
  /** Branch entries counted as consumed activity; only NEW activity gates/reports. */
  cursor: number;
  degradedNotified: boolean;
  warnedModel: boolean;
}

export default function (pi: ExtensionAPI): void {
  const config: SummerizeConfig = readConfig();
  const state: State = {
    sessionOn: true,
    turnsSinceCommentary: 0,
    lastCommentaryAt: null,
    lastText: "",
    active: null,
    lastError: null,
    cursor: 0,
    degradedNotified: false,
    warnedModel: false,
  };

  /** UI operations are allowed in TUI and RPC; print/JSON stay silent. */
  const canDisplay = (ctx: ExtensionContext): boolean =>
    ctx.hasUI && (ctx.mode === "tui" || ctx.mode === "rpc");

  function show(ctx: ExtensionContext, paragraph: string): void {
    try {
      if (ctx.mode === "rpc") {
        // RPC setWidget only forwards string arrays; component factories are ignored.
        ctx.ui.setWidget(WIDGET_KEY, wrapPlain(paragraph), { placement: "belowEditor" });
      } else {
        ctx.ui.setWidget(WIDGET_KEY, commentaryWidget(paragraph), { placement: "belowEditor" });
      }
      state.lastText = paragraph;
    } catch {
      // display failures never fail the agent turn
    }
  }

  function clearWidget(ctx: ExtensionContext): void {
    try {
      if (canDisplay(ctx)) ctx.ui.setWidget(WIDGET_KEY, undefined);
    } catch {
      // best effort
    }
    state.lastText = "";
  }

  function invalidateActive(): void {
    if (state.active) {
      state.active.abort.abort();
      state.active = null;
    }
  }

  /**
   * Count only activity newer than the consumed cursor. If the branch shrank
   * below the cursor (compaction/restored session), recount from zero.
   */
  function newActivity(branch: Array<Record<string, unknown>>): ReturnType<typeof countActivity> {
    if (branch.length < state.cursor) state.cursor = 0;
    return countActivity(branch.slice(state.cursor));
  }

  /** Returns true when a commentary request was actually launched. */
  function maybeCommentary(ctx: ExtensionContext, force: boolean): boolean {
    if (!config.enabled || !state.sessionOn || !canDisplay(ctx)) return false;
    if (state.active) return false;
    const now = Date.now();
    if (!force && state.turnsSinceCommentary <= 0) return false;
    const since = state.lastCommentaryAt === null ? Infinity : now - state.lastCommentaryAt;
    if (!force && since < config.minIntervalMs) return false;

    let branch: Array<Record<string, unknown>>;
    try {
      branch = ctx.sessionManager.getBranch() as unknown as Array<Record<string, unknown>>;
    } catch {
      return false;
    }
    const counts = newActivity(branch);
    if (!force && counts.toolCalls === 0) return false; // no NEW activity to comment on

    const turns = collectTurns(branch, { maxTurns: 8, maxChars: config.maxInputChars });
    // Consume the counted slice even if the request later fails: the activity
    // was already presented to the model (or degraded to the fallback line).
    state.cursor = branch.length;
    state.turnsSinceCommentary = 0;
    state.lastCommentaryAt = now;

    const abort = new AbortController();
    state.active = { abort, branchLengthAtLaunch: branch.length };

    void (async () => {
      try {
        const { model, warning } = resolveModel(config.model, ctx);
        if (warning && !state.warnedModel) {
          state.warnedModel = true;
          if (canDisplay(ctx)) ctx.ui.notify(`pi-summerize: ${warning}`, "warning");
        }
        const observation = renderObservation(turns, counts, config.maxInputChars);
        const outcome = await runCommentary(
          model,
          COMMENTARY_INSTRUCTIONS,
          observation,
          { maxTimeoutMs: config.maxTimeoutMs, idleTimeoutMs: config.idleTimeoutMs, maxOutputChars: config.maxOutputChars },
          ctx,
          abort.signal
        );
        const current = state.active;
        if (!current || current.abort !== abort) return; // superseded, disabled, or session reset mid-flight
        // New activity or navigation happened while the call was pending: the
        // paragraph is already stale — drop it; the next settle will regenerate.
        let branchNow: Array<Record<string, unknown>> | null = null;
        try {
          branchNow = ctx.sessionManager.getBranch() as unknown as Array<Record<string, unknown>>;
        } catch {
          branchNow = null;
        }
        if (branchNow && branchNow.length !== current.branchLengthAtLaunch) return;
        state.active = null;
        if (outcome.kind === "ok") {
          state.degradedNotified = false;
          show(ctx, outcome.text);
        } else {
          // deterministic fallback keeps the widget alive without touching the fleet
          show(ctx, fallbackLine(counts));
          if (outcome.kind !== "unusable" && !state.degradedNotified) {
            state.degradedNotified = true; // once per degradation episode, not per failure
            if (canDisplay(ctx)) {
              ctx.ui.notify(`pi-summerize: commentary unavailable (${outcome.message}); showed activity summary`, "info");
            }
          }
        }
      } catch (error) {
        // fire-and-forget: never fail the settled turn, but keep the reason
        // inspectable via /summerize status
        state.lastError = error instanceof Error ? error.message : String(error);
      } finally {
        if (state.active && state.active.abort === abort) state.active = null;
      }
    })();
    return true;
  }

  // --- signals --------------------------------------------------------------

  pi.on("turn_end", async () => {
    try {
      if (state.active) {
        // A new agent run started while commentary was pending: it is stale.
        invalidateActive();
        state.turnsSinceCommentary += 1;
      } else {
        state.turnsSinceCommentary += 1;
      }
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
      invalidateActive();
      state.turnsSinceCommentary = 0;
      state.lastCommentaryAt = null;
      state.cursor = 0;
      clearWidget(ctx);
    } catch {
      // lifecycle failures must not block the session
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      invalidateActive();
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
        invalidateActive();
        state.sessionOn = false;
        clearWidget(ctx);
        if (canDisplay(ctx)) ctx.ui.notify("pi-summerize: off for this session", "info");
        return;
      }
      if (arg === "on") {
        state.sessionOn = true;
        if (canDisplay(ctx)) ctx.ui.notify("pi-summerize: on", "info");
        return;
      }
      if (arg === "status") {
        if (!canDisplay(ctx)) return; // silent modes: no UI surface for status
        const { model } = resolveModel(config.model, ctx);
        const when = state.lastCommentaryAt === null ? "never" : `${Math.round((Date.now() - state.lastCommentaryAt) / 1000)}s ago`;
        ctx.ui.notify(
          `pi-summerize: ${config.enabled && state.sessionOn ? "on" : "off"} · model ${modelLabel(model)} · last ${when}` +
            (state.lastError ? ` · last error: ${state.lastError}` : "") +
            (state.lastText ? `\n${state.lastText}` : ""),
          "info"
        );
        return;
      }
      const launched = maybeCommentary(ctx, true);
      if (launched && canDisplay(ctx)) ctx.ui.notify("pi-summerize: composing…", "info");
    },
  });
}
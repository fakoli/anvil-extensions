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
import { loadFileSettings, applyFileSettings, saveSettings, clearSettings, validateSettingsObject, USER_SETTINGS_PATH } from "./src/settings.js";
import { collectTurns, countActivity, renderObservation } from "./src/collect.js";
import { resolveModel, runCommentary, modelLabel, COMMENTARY_INSTRUCTIONS } from "./src/commentator.js";
import { WIDGET_KEY, commentaryWidget, wrapPlain, fallbackLine } from "./src/render.js";

interface BranchMark {
  length: number;
  tailRef: unknown; // identity of the last entry at mark time
}

function markOf(branch: Array<Record<string, unknown>>): BranchMark {
  return { length: branch.length, tailRef: branch.length > 0 ? branch[branch.length - 1] : null };
}

/** Delta since the mark: entries after tailRef. Unknown tail => fail OPEN (over-count is cosmetic; lost activity is not). */
function deltaSince(branch: Array<Record<string, unknown>>, mark: BranchMark | null): Array<Record<string, unknown>> {
  if (!mark) return branch;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i] === mark.tailRef) return branch.slice(i + 1);
  }
  return branch;
}

/** Fresh only if the branch is the same shape: same length AND same tail entry (identity). */
function isSameBranch(branch: Array<Record<string, unknown>>, mark: BranchMark): boolean {
  return branch.length === mark.length && (branch.length === 0 ? mark.tailRef === null : branch[branch.length - 1] === mark.tailRef);
}

interface ActiveRequest {
  abort: AbortController;
  branchMark: BranchMark;
  /** State to restore if superseded before display: consumed-but-unshown activity must not be lost. */
  restore: { consumed: BranchMark | null; lastCommentaryAt: number | null };
}

interface State {
  sessionOn: boolean;
  turnsSinceCommentary: number;
  lastAttemptAt: number | null;
  lastEmissionAt: number | null;
  lastFailure: string | null;
  lastText: string;
  active: ActiveRequest | null;
  /** Activity entries already covered by a commentary (or its fallback). */
  consumed: BranchMark | null;
  degradedNotified: boolean;
  warnedModel: boolean;
  /** /commentary dialog, session scope: applied over files, cleared at session_start. */
  sessionOverrides: Partial<SummerizeConfig>;
  /** Bumped at session boundaries; an in-flight dialog aborts when it changes. */
  dialogGeneration: number;
}

export default function (pi: ExtensionAPI): void {
  const config: SummerizeConfig = readConfig();
  // Layered file settings (user/project) win over env; session overrides land
  // via the /commentary dialog and persist per its scope choice.
  applyFileSettings(config, loadFileSettings());
  const state: State = {
    sessionOn: true,
    turnsSinceCommentary: 0,
    lastAttemptAt: null,
    lastEmissionAt: null,
    lastFailure: null,
    lastText: "",
    active: null,
    consumed: null,
    degradedNotified: false,
    warnedModel: false,
    sessionOverrides: {},
    dialogGeneration: 0,
  };

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

  /** Invalidate the in-flight request. `restoreActivity` re-offers consumed-but-unshown activity (supersede); user-disable does not. */
  function invalidateActive(restoreActivity: boolean): void {
    const active = state.active;
    if (!active) return;
    if (restoreActivity) {
      state.consumed = active.restore.consumed;
      state.lastCommentaryAt = active.restore.lastCommentaryAt;
    }
    state.active = null;
    active.abort.abort();
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
    const counts = countActivity(deltaSince(branch, state.consumed));
    if (!force && counts.toolCalls === 0) return false; // no NEW activity to comment on

    const turns = collectTurns(branch, { maxTurns: 8, maxChars: config.maxInputChars });
    // Consume the counted slice up-front. If the request is later superseded
    // (not disabled), the restore point re-offers it so nothing is silently lost.
    const consumedBefore = state.consumed;
    const lastAttemptBefore = state.lastCommentaryAt;
    state.consumed = markOf(branch);
    state.turnsSinceCommentary = 0;
    state.lastCommentaryAt = now;
    state.lastAttemptAt = now;

    const abort = new AbortController();
    state.active = {
      abort,
      branchMark: markOf(branch),
      restore: { consumed: consumedBefore, lastCommentaryAt: lastAttemptBefore },
    };

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
        // The branch must be exactly the one observed: same length AND same
        // tail entry (identity). Navigation, compaction, or new turns make the
        // paragraph stale; an unreadable branch fails CLOSED.
        let branchNow: Array<Record<string, unknown>> | null = null;
        try {
          branchNow = ctx.sessionManager.getBranch() as unknown as Array<Record<string, unknown>>;
        } catch {
          branchNow = null;
        }
        if (!branchNow || !isSameBranch(branchNow, current.branchMark)) return;
        state.active = null;
        if (outcome.kind === "ok") {
          state.degradedNotified = false;
          state.lastFailure = null;
          state.lastEmissionAt = Date.now();
          show(ctx, outcome.text);
        } else {
          // deterministic fallback keeps the widget alive without touching the fleet
          state.lastEmissionAt = Date.now();
          show(ctx, fallbackLine(counts));
          if (outcome.kind !== "unusable") {
            state.lastFailure = `${outcome.kind}: ${outcome.message}`;
            if (!state.degradedNotified) {
              state.degradedNotified = true; // once per degradation episode, not per failure
              if (canDisplay(ctx)) {
                ctx.ui.notify(`pi-summerize: commentary unavailable (${outcome.message}); showed activity summary`, "info");
              }
            }
          }
        }
      } catch (error) {
        // fire-and-forget: never fail the settled turn, but keep the reason
        // inspectable via /commentary status
        state.lastFailure = error instanceof Error ? error.message : String(error);
      } finally {
        if (state.active && state.active.abort === abort) state.active = null;
      }
    })();
    return true;
  }

  // --- signals --------------------------------------------------------------

  pi.on("turn_end", async () => {
    try {
      // A new agent run started: any pending commentary is stale. Its consumed
      // activity is restored so the next settle re-offers old + new together.
      invalidateActive(true);
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
      invalidateActive(false); // session boundary: no restore
      state.sessionOn = true; // /off is session-local; a new session starts fresh
      state.turnsSinceCommentary = 0;
      state.lastCommentaryAt = null;
      state.lastAttemptAt = null;
      state.lastEmissionAt = null;
      state.lastFailure = null;
      state.consumed = null;
      state.degradedNotified = false;
      // Session-only dialog overrides die with the session; files (user +
      // project via ctx.cwd) reapply. In-flight dialogs are invalidated.
      state.sessionOverrides = {};
      state.dialogGeneration += 1;
      reloadConfig(ctx);
      state.sessionOn = config.enabled; // a project file with enabled:false holds
      clearWidget(ctx);
    } catch {
      // lifecycle failures must not block the session
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      invalidateActive(false);
      state.dialogGeneration += 1; // an in-flight dialog must not commit into a dead session
    } catch {
      // best effort
    }
  });

  // --- settings dialog (/commentary bare) ------------------------------------

  /** Live-reload: defaults+env → user+project files (ctx.cwd) → session overrides. */
  function reloadConfig(ctx: ExtensionContext, projectDir = ctx?.cwd): void {
    const fresh = readConfig();
    const loaded = loadFileSettings(projectDir);
    applyFileSettings(fresh, loaded);
    applyFileSettings(fresh, { overrides: state.sessionOverrides, sources: [], problems: [] });
    Object.assign(config, fresh);
    for (const problem of loaded.problems) {
      if (canDisplay(ctx)) ctx.ui.notify(`pi-summerize: ${problem}`, "warning");
    }
  }

  /** Model rule shared by the dialog and file loading: "default" or provider/id.
   * The id may itself contain slashes (nested registry ids); resolveModel
   * splits at the FIRST slash, so validation must accept everything it resolves. */
  function validModelSpec(value: string): boolean {
    return value === "default" || /^[a-zA-Z0-9_.:-]+(\/[a-zA-Z0-9_.:-]+)+$/.test(value);
  }

  /** Reconcile the session's enabled state with the EFFECTIVE config after any commit. */
  function reconcileEnabled(ctx: ExtensionContext, dialogEnabled: boolean | null): void {
    if (dialogEnabled === false) {
      // explicit off from the dialog: consumed activity stays consumed
      invalidateActive(false);
      state.sessionOn = false;
      clearWidget(ctx);
      return;
    }
    // The reloaded effective config decides — a reset or save may have changed
    // it either way, and an in-flight request must be dropped when commentary
    // is effectively off (astra round-1: never follow the stale dialog choice).
    state.sessionOn = config.enabled;
    if (!config.enabled) {
      invalidateActive(false);
      clearWidget(ctx);
    }
  }

  async function settingsDialog(ctx: ExtensionContext): Promise<void> {
    if (!canDisplay(ctx)) return;
    const generation = state.dialogGeneration;
    const stale = () => generation !== state.dialogGeneration;
    try {
      const enabledPick = await ctx.ui.select("Companion commentary after the agent goes idle?", ["on", "off"]);
      if (enabledPick === undefined || stale()) return; // Esc or session boundary: change nothing
      const partial: Record<string, unknown> = { enabled: enabledPick === "on" };
      if (enabledPick === "on") {
        const modelPick = await ctx.ui.input(
          `Model for commentary (empty = session model; e.g. anvil/llm.secondary). Current: ${config.model}`,
          "",
        );
        if (modelPick === undefined || stale()) return;
        const modelTrim = modelPick.trim();
        if (modelTrim.length > 0) {
          if (!validModelSpec(modelTrim)) {
            ctx.ui.notify(`pi-summerize: "${modelTrim}" is not a valid model (use "default" or "provider/model-id"); nothing saved`, "warning");
            return;
          }
          const { warning } = resolveModel(modelTrim, ctx);
          if (warning) {
            // registry miss: refuse rather than commit a value file loading
            // would reject (session and file scopes must agree)
            ctx.ui.notify(`pi-summerize: ${warning.replace("using current model", "nothing saved")}`, "warning");
            return;
          }
          partial.model = modelTrim;
        } else {
          partial.model = "default"; // empty input means "session model", explicitly
        }
        const intervalPick = await ctx.ui.input(
          `Minimum seconds between commentary episodes (blank keeps current ${Math.round(config.minIntervalMs / 1000)}s)`,
          "",
        );
        if (intervalPick === undefined || stale()) return;
        const intervalTrim = intervalPick.trim();
        if (intervalTrim.length > 0) {
          const interval = Number(intervalTrim);
          if (!Number.isFinite(interval) || interval < 0) {
            ctx.ui.notify("pi-summerize: interval must be a non-negative number; nothing saved", "warning");
            return;
          }
          partial.minIntervalSeconds = interval;
        } // blank keeps the current interval
      }
      const scopePick = await ctx.ui.select("Save these settings where?", [
        `user (${USER_SETTINGS_PATH})`,
        "this session only",
        "reset saved settings",
      ]);
      if (scopePick === undefined || stale()) return;

      if (scopePick.startsWith("reset")) {
        // reset = back to defaults: files AND this session's dialog overrides
        // (a stale session-only "off" must not survive a reset — astra r1)
        const removedUser = clearSettings("user", undefined);
        const removedProject = clearSettings("project", ctx.cwd);
        state.sessionOverrides = {};
        state.warnedModel = false;
        reloadConfig(ctx);
        reconcileEnabled(ctx, null);
        ctx.ui.notify(`pi-summerize: settings reset (user: ${removedUser ? "removed" : "none"}, project: ${removedProject ? "removed" : "none"}); commentary is ${config.enabled ? "on" : "off"}`, "info");
      } else {
        // dialog values pass through the SAME validation/normalization as files
        const { overrides, problems } = validateSettingsObject(partial);
        if (problems.length > 0) {
          for (const problem of problems) ctx.ui.notify(`pi-summerize: ${problem}`, "warning");
          return;
        }
        if (scopePick.startsWith("user")) {
          const path = saveSettings("user", partial, ctx.cwd);
          reloadConfig(ctx);
          state.warnedModel = false; // a deliberate model change re-arms warnings
          reconcileEnabled(ctx, enabledPick === "on" ? true : false);
          ctx.ui.notify(`pi-summerize: saved to ${path}`, "info");
        } else {
          state.sessionOverrides = { ...state.sessionOverrides, ...overrides };
          reloadConfig(ctx);
          state.warnedModel = false;
          reconcileEnabled(ctx, enabledPick === "on" ? true : false);
          ctx.ui.notify("pi-summerize: session-only settings applied", "info");
        }
      }
    } catch (error) {
      if (stale()) return; // session boundary while awaiting: nothing left to report
      try {
        // dialog failures must never fail the command turn (best effort —
        // the context itself may already be gone)
        ctx.ui.notify(`pi-summerize: settings dialog error (${error instanceof Error ? error.message : String(error)})`, "warning");
      } catch {
        // best effort
      }
    }
  }

  // --- command --------------------------------------------------------------

  pi.registerCommand("commentary", {
    description: "Configure commentary (TUI dialog); /commentary on|off|status|now",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "off") {
        invalidateActive(false); // user disable: consumed activity stays consumed
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
        const attempt = state.lastAttemptAt === null ? "never" : `${Math.round((Date.now() - state.lastAttemptAt) / 1000)}s ago`;
        const emitted = state.lastEmissionAt === null ? "never" : `${Math.round((Date.now() - state.lastEmissionAt) / 1000)}s ago`;
        ctx.ui.notify(
          `pi-summerize: ${config.enabled && state.sessionOn ? "on" : "off"} · model ${modelLabel(model)}` +
            ` · interval ${Math.round(config.minIntervalMs / 1000)}s` +
            ` · last attempt ${attempt} · last emission ${emitted}` +
            (state.lastFailure ? ` · last failure: ${state.lastFailure}` : "") +
            (state.lastText ? `\n${state.lastText}` : ""),
          "info"
        );
        return;
      }
      if (arg === "now") {
        const launched = maybeCommentary(ctx, true);
        if (launched && canDisplay(ctx)) ctx.ui.notify("pi-summerize: composing…", "info");
        return;
      }
      if (arg.length === 0) {
        await settingsDialog(ctx);
        return;
      }
      const launched = maybeCommentary(ctx, true);
      if (launched && canDisplay(ctx)) ctx.ui.notify("pi-summerize: composing…", "info");
    },
  });
}
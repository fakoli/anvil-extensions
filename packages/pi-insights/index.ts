// pi-insights — Claude-Code-style insight lines for pi.
// Deterministic activity ledger + persistent widget. Observational only:
// never mutates tool results, never injects LLM context, never writes memory,
// never summarizes tool output (pi-condense's domain).
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { classifyBash, type CallCategory, type MilestonePlan, type PendingCall } from "./src/signals.js";
import {
  applyIdleReset,
  isDirtySinceCheckpoint,
  newLedger,
  recordMilestone,
  recordPending,
  recordTurn,
  recordValidationOutcome,
  resetPending,
  type Ledger,
} from "./src/state.js";
import { renderExpanded, renderLines } from "./src/render.js";
import { CHECKPOINT_TYPE, fromCheckpoint, toCheckpoint } from "./src/persistence.js";

interface Config {
  enabled: boolean;
  minIntervalMs: number;
  activityThreshold: number;
  lines: number;
  emissionFallbackMs: number;
  idleResetMs: number;
  checkpointIntervalMs: number;
}

function readConfig(): Config {
  const env = process.env;
  const num = (name: string, fallback: number, min: number, max: number): number => {
    const raw = Number(env[name]);
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, raw));
  };
  return {
    enabled: (env.PI_INSIGHTS ?? "on").toLowerCase() !== "off",
    minIntervalMs: num("PI_INSIGHTS_MIN_INTERVAL_SECONDS", 60, 5, 3600) * 1000,
    activityThreshold: num("PI_INSIGHTS_ACTIVITY_THRESHOLD", 8, 1, 1000),
    lines: num("PI_INSIGHTS_LINES", 1, 1, 2),
    emissionFallbackMs: 120_000,
    idleResetMs: 15 * 60_000,
    checkpointIntervalMs: 5 * 60_000,
  };
}

export default function (pi: ExtensionAPI): void {
  const config = readConfig();
  let ledger: Ledger = newLedger();
  let enabled = config.enabled;
  let sessionOn = true; // /insights off sets false for the session
  let lastRendered = "";
  let checkpointEntryId: string | null = null;
  // Correlate tool_call classification with tool_execution_end outcomes.
  const pendingCalls = new Map<string, PendingCall>();
  const PENDING_LIMIT = 512;

  const active = () => enabled && sessionOn;

  function trackPending(): void {
    if (pendingCalls.size >= PENDING_LIMIT) {
      const oldest = pendingCalls.keys().next().value;
      if (oldest !== undefined) pendingCalls.delete(oldest);
    }
  }

  function branchEntries(ctx: ExtensionContext): Array<Record<string, unknown>> {
    try {
      return ctx.sessionManager.getBranch() as unknown as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }

  function entryId(entry: Record<string, unknown>): string | null {
    const id = entry.id ?? entry.entryId;
    return typeof id === "string" ? id : null;
  }

  /** Branch reconciliation: if the restored checkpoint left the branch, start fresh. */
  function reconcileBranch(ctx: ExtensionContext): void {
    if (!checkpointEntryId) return;
    const present = branchEntries(ctx).some((e) => entryId(e) === checkpointEntryId);
    if (!present) {
      ledger = newLedger();
      checkpointEntryId = null;
      lastRendered = "";
    }
  }

  function render(ctx: ExtensionContext): void {
    if (!ctx.hasUI || (ctx.mode !== "tui" && ctx.mode !== "rpc")) return;
    try {
      const lines = renderLines(ledger, config.lines);
      const text = lines.join("\n");
      if (text !== lastRendered) {
        ctx.ui.setWidget("pi-insights", lines);
        lastRendered = text;
      }
    } catch {
      // display failures never fail the agent turn
    }
  }

  function checkpoint(ctx: ExtensionContext, force = false): void {
    if (!active()) return;
    const now = Date.now();
    if (!force && !isDirtySinceCheckpoint(ledger, now, config.checkpointIntervalMs)) return;
    try {
      // sessionManager.appendCustomEntry returns the entry id (appendEntry returns void)
      const id = ctx.sessionManager.appendCustomEntry(CHECKPOINT_TYPE, toCheckpoint(ledger));
      ledger.lastCheckpointAt = now;
      if (typeof id === "string" && id) checkpointEntryId = id;
    } catch {
      // persistence failures retry at the next boundary
    }
  }

  function maybeEmit(ctx: ExtensionContext, force = false): void {
    if (!active()) return;
    const now = Date.now();
    applyIdleReset(ledger, now, config.idleResetMs);
    const sinceEmission = ledger.lastEmissionAt === null ? Infinity : now - ledger.lastEmissionAt;
    const eligible = force || ledger.pending.points >= config.activityThreshold;
    if (!eligible || sinceEmission < config.minIntervalMs) return;
    render(ctx);
    ledger.lastEmissionAt = now;
    resetPending(ledger);
  }

  // --- signal tracking ------------------------------------------------------

  pi.on("tool_call", async (event) => {
    try {
      if (!active()) return;
      if (event.toolName === "bash") {
        const input = event.input as { command?: string };
        if (typeof input.command === "string") {
          const { category, commandKey, plan } = classifyBash(input.command);
          trackPending();
          pendingCalls.set(event.toolCallId, { category, commandKey, milestonePlan: plan });
          return;
        }
      }
      const category: CallCategory =
        event.toolName === "edit" || event.toolName === "write" ? "edit" : "generic";
      trackPending();
      pendingCalls.set(event.toolCallId, { category, commandKey: null, milestonePlan: null });
    } catch {
      // classification failures degrade to generic counting
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    try {
      if (!active()) return;
      const pending = pendingCalls.get(event.toolCallId);
      pendingCalls.delete(event.toolCallId);
      const now = Date.now();
      recordPending(ledger, pending ?? null, event.isError === true, now);

      if (pending?.milestonePlan && event.isError !== true) {
        const plan: MilestonePlan = pending.milestonePlan;
        if (plan.kind === "validation_passed") {
          recordValidationOutcome(ledger, plan.key, true, now);
        }
        const { added, note } = recordMilestone(ledger, plan.kind, plan.key, now, plan.note);
        if (added) {
          ledger.pending.points += 6;
          checkpoint(ctx, true); // durable milestones checkpoint immediately
        }
      } else if (pending?.milestonePlan?.kind === "validation_passed" && event.isError === true) {
        recordValidationOutcome(ledger, pending.milestonePlan.key, false, now);
        const { added } = recordMilestone(ledger, "validation_failed", `fail:${pending.milestonePlan.key}`, now);
        if (added) ledger.pending.points += 6;
      }

      // long-running fallback: pending eligible work + stale emission
      const sinceEmission = ledger.lastEmissionAt === null ? Infinity : now - ledger.lastEmissionAt;
      if (ledger.pending.points >= config.activityThreshold && sinceEmission >= config.emissionFallbackMs) {
        maybeEmit(ctx, true);
      }
      render(ctx);
    } catch {
      // never fail the agent turn
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    try {
      if (!active()) return;
      const now = Date.now();
      reconcileBranch(ctx);
      recordTurn(ledger, now);
      maybeEmit(ctx);
      render(ctx);
    } catch {
      // never fail the agent turn
    }
  });

  // --- lifecycle ------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    try {
      ledger = newLedger();
      checkpointEntryId = null;
      lastRendered = "";
      if (!enabled) return;
      for (const entry of branchEntries(ctx)) {
        if (entry.type === "custom" && entry.customType === CHECKPOINT_TYPE) {
          const restored = fromCheckpoint(entry.data);
          if (restored) {
            ledger = restored;
            checkpointEntryId = entryId(entry);
          }
        }
      }
      render(ctx);
    } catch {
      // malformed checkpoints must not block the session
    }
  });

  pi.on("agent_settled", async (_event, ctx) => {
    try {
      if (!active()) return;
      reconcileBranch(ctx);
      if (ledger.pending.points > 0 || ledger.lastEmissionAt === null) maybeEmit(ctx, true);
      render(ctx);
      checkpoint(ctx);
    } catch {
      // never fail the agent turn
    }
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    try {
      checkpoint(ctx, true);
    } catch {
      // compaction must proceed normally
    }
    return undefined; // never cancel or customize compaction
  });

  pi.on("session_compact", async (_event, ctx) => {
    try {
      reconcileBranch(ctx); // if the checkpoint left the branch, restart conservatively
      render(ctx);
    } catch {
      // observational only
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    try {
      reconcileBranch(ctx);
      render(ctx);
    } catch {
      // observational only
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      checkpoint(ctx, true);
    } catch {
      // best effort only
    }
  });

  // --- command --------------------------------------------------------------

  pi.registerCommand("insights", {
    description: "Show session insight summary; /insights on|off|reset controls tracking",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "off") {
        sessionOn = false;
        try {
          if (ctx.hasUI) ctx.ui.setWidget("pi-insights", []);
        } catch {
          // best effort
        }
        lastRendered = "";
        ctx.ui.notify("pi-insights: off for this session", "info");
        return;
      }
      if (arg === "on") {
        sessionOn = true;
        render(ctx);
        ctx.ui.notify("pi-insights: on", "info");
        return;
      }
      if (arg === "reset") {
        ledger = newLedger();
        checkpointEntryId = null;
        lastRendered = "";
        render(ctx);
        ctx.ui.notify("pi-insights: ledger reset", "info");
        return;
      }
      const lines = renderExpanded(ledger);
      if (ctx.hasUI) {
        try {
          ctx.ui.setWidget("pi-insights", lines);
          lastRendered = lines.join("\n");
        } catch {
          ctx.ui.notify(lines.join("\n"), "info");
        }
      } else {
        ctx.ui.notify(lines.join("\n"), "info");
      }
    },
  });
}
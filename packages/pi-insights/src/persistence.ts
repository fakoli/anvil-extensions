// pi-insights — checkpoint persistence via session entries (no sidecar files).
import type { Ledger, ValidationRecord } from "./state.js";
import type { Milestone } from "./signals.js";

export const CHECKPOINT_TYPE = "pi-insights.checkpoint";
const CHECKPOINT_VERSION = 1;

export interface CheckpointV1 {
  version: 1;
  savedAt: number;
  totals: Ledger["totals"];
  categories: Record<string, number>;
  milestones: Ledger["milestones"];
  validation: Ledger["validation"];
  pending: Ledger["pending"];
  lastActivityAt: number | null;
  lastEmissionAt: number | null;
}

export function toCheckpoint(ledger: Ledger): CheckpointV1 {
  return {
    version: 1,
    savedAt: Date.now(),
    totals: { ...ledger.totals },
    categories: { ...ledger.categories },
    milestones: ledger.milestones.map((m) => ({ ...m })),
    validation: ledger.validation.map((v) => ({ ...v })),
    pending: { ...ledger.pending },
    lastActivityAt: ledger.lastActivityAt,
    lastEmissionAt: ledger.lastEmissionAt,
  };
}

/** Defensive restore; malformed/unsupported checkpoints start a fresh ledger. */
export function fromCheckpoint(data: unknown): Ledger | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.version !== CHECKPOINT_VERSION) return null;
  const t = d.totals as Record<string, unknown> | undefined;
  if (!t || typeof t.tools !== "number" || typeof t.edits !== "number") return null;
  const ledger = require_newLedger();
  ledger.totals = { tools: t.tools, edits: t.edits, errors: numberOr(t.errors, 0), turns: numberOr(t.turns, 0) };
  ledger.categories = isPlainObject(d.categories) ? (d.categories as Record<string, number>) : {};
  ledger.milestones = Array.isArray(d.milestones)
    ? (d.milestones as Ledger["milestones"]).filter(
        (m) => !!m && typeof m === "object" && typeof (m as Milestone).kind === "string" && typeof (m as Milestone).key === "string",
      ).slice(0, 24)
    : [];
  ledger.validation = Array.isArray(d.validation)
    ? (d.validation as ValidationRecord[]).filter(
        (v) =>
          !!v &&
          typeof v === "object" &&
          typeof v.key === "string" &&
          (v.outcome === "passed" || v.outcome === "failed") &&
          typeof v.at === "number",
      ).slice(0, 16)
    : [];
  const p = d.pending as Record<string, unknown> | undefined;
  if (p && typeof p.points === "number") {
    ledger.pending = {
      points: p.points,
      tools: numberOr(p.tools, 0),
      edits: numberOr(p.edits, 0),
      errors: numberOr(p.errors, 0),
    };
  }
  ledger.lastActivityAt = numberOrNull(d.lastActivityAt);
  ledger.lastEmissionAt = numberOrNull(d.lastEmissionAt);
  return ledger;
}

function require_newLedger(): Ledger {
  // Local import avoidance for circular-free construction.
  return {
    totals: { tools: 0, edits: 0, errors: 0, turns: 0 },
    categories: {},
    milestones: [],
    validation: [],
    pending: { points: 0, tools: 0, edits: 0, errors: 0 },
    lastActivityAt: null,
    lastEmissionAt: null,
    lastCheckpointAt: null,
  };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function isPlainObject(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
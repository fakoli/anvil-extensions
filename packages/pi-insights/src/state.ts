// pi-insights — bounded activity ledger state and milestone bookkeeping.
import type { Milestone, MilestoneKind, PendingCall } from "./signals.js";

export interface ValidationRecord {
  key: string;
  outcome: "passed" | "failed";
  at: number;
}

export interface Ledger {
  totals: { tools: number; edits: number; errors: number; turns: number };
  categories: Record<string, number>;
  milestones: Milestone[]; // newest first, max 24
  validation: ValidationRecord[]; // newest first, max 16
  pending: { points: number; tools: number; edits: number; errors: number };
  lastActivityAt: number | null;
  lastEmissionAt: number | null;
  lastCheckpointAt: number | null;
}

export function newLedger(): Ledger {
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

const MILESTONE_LIMIT = 24;
const VALIDATION_LIMIT = 16;

export function recordPending(ledger: Ledger, pending: PendingCall | null, isError: boolean, now: number): void {
  ledger.totals.tools += 1;
  ledger.pending.tools += 1;
  if (isError) {
    ledger.totals.errors += 1;
    ledger.pending.errors += 1;
    ledger.pending.points += 1;
    ledger.lastActivityAt = now;
    return;
  }
  if (!pending) {
    ledger.pending.points += 1;
    ledger.lastActivityAt = now;
    return;
  }
  ledger.categories[pending.category] = (ledger.categories[pending.category] ?? 0) + 1;
  if (pending.category === "edit") {
    ledger.totals.edits += 1;
    ledger.pending.edits += 1;
    ledger.pending.points += 2;
  } else if (pending.category === "validation") {
    ledger.pending.points += 3;
  } else {
    ledger.pending.points += 1;
  }
  ledger.lastActivityAt = now;
}

/** Record a milestone if new; same-key repeats of countable kinds (commits)
 *  increment the count instead of deduplicating. Returns a note when it
 *  resolves a matching validation failure. */
export function recordMilestone(ledger: Ledger, kind: MilestoneKind, key: string, now: number, planNote?: string): { added: boolean; note?: string } {
  const existing = ledger.milestones.find((m) => m.kind === kind && m.key === key);
  if (existing && kind === "commit_created") {
    existing.count += 1;
    existing.at = now;
    return { added: true };
  }
  if (existing) return { added: false };
  let note = planNote;
  if (kind === "validation_passed") {
    const priorFailure = ledger.validation.find((v) => v.key === key && v.outcome === "failed");
    if (priorFailure) note = "after failure";
  }
  ledger.milestones.unshift({ kind, key, at: now, count: 1, note });
  if (ledger.milestones.length > MILESTONE_LIMIT) ledger.milestones.length = MILESTONE_LIMIT;
  return { added: true, note };
}

export function recordValidationOutcome(ledger: Ledger, key: string, passed: boolean, now: number): void {
  ledger.validation.unshift({ key, outcome: passed ? "passed" : "failed", at: now });
  if (ledger.validation.length > VALIDATION_LIMIT) ledger.validation.length = VALIDATION_LIMIT;
}

export function recordTurn(ledger: Ledger, now: number): void {
  ledger.totals.turns += 1;
  void now; // turns alone are not activity evidence; idle reset stays honest
}

/** ≥15 min idle resets the pending window; totals and milestones survive. */
export function applyIdleReset(ledger: Ledger, now: number, idleMs = 15 * 60_000): void {
  if (ledger.lastActivityAt !== null && now - ledger.lastActivityAt > idleMs) {
    ledger.pending = { points: 0, tools: 0, edits: 0, errors: 0 };
  }
}

export function isDirtySinceCheckpoint(ledger: Ledger, now: number, checkpointMs = 5 * 60_000): boolean {
  if (ledger.lastCheckpointAt === null) return true;
  if (now - ledger.lastCheckpointAt < checkpointMs) return false;
  return true;
}

export function resetPending(ledger: Ledger): void {
  ledger.pending = { points: 0, tools: 0, edits: 0, errors: 0 };
}
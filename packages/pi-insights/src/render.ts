// pi-insights — pure deterministic line rendering from ledger state.
import type { Ledger } from "./state.js";

const KIND_ICON: Record<string, string> = {
  commit_created: "📦",
  pr_opened: "🔀",
  pr_merged: "🔀",
  validation_passed: "🧪",
  validation_failed: "🧪",
  infra_checked: "🔍",
  deployment_attempted: "🚀",
};

const KIND_LABEL: Record<string, string> = {
  commit_created: "commit",
  pr_opened: "PR opened",
  pr_merged: "PR merged",
  validation_passed: "validation passed",
  validation_failed: "validation failed",
  infra_checked: "infra checked",
  deployment_attempted: "deploy attempted",
};

function truncate(line: string, max = 100): string {
  return line.length <= max ? line : line.slice(0, max - 1) + "…";
}

/**
 * 1-2 widget lines. Line 1: latest durable milestone (annotated with current
 * activity when only one line is allowed). Line 2 (when allowed): activity
 * delta, else session totals.
 */
export function renderLines(ledger: Ledger, maxLines: number): string[] {
  const p = ledger.pending;
  const activityParts: string[] = [];
  if (p.edits > 0) activityParts.push(`🛠 ${p.edits} edit${p.edits === 1 ? "" : "s"}`);
  if (p.tools - p.edits > 0) activityParts.push(`${p.tools - p.edits} tools`);
  if (p.errors > 0) activityParts.push(`⚠ ${p.errors} error${p.errors === 1 ? "" : "s"}`);
  const activity = activityParts.join(" · ");

  const recentMilestone = ledger.milestones[0];
  const lines: string[] = [];

  if (recentMilestone) {
    const icon = KIND_ICON[recentMilestone.kind] ?? "•";
    let seg = `${icon} ${KIND_LABEL[recentMilestone.kind] ?? recentMilestone.kind}`;
    if (recentMilestone.note) seg += ` (${recentMilestone.note})`;
    if (maxLines === 1 && activity) seg += ` · ${activity}`;
    lines.push(truncate(seg));
  } else if (activity) {
    lines.push(truncate(`💡 ${activity}`));
  }

  if (maxLines >= 2 && lines.length < 2) {
    if (activity && lines[0] && !lines[0].includes(activity)) {
      lines.push(truncate(`💡 ${activity}`));
    } else {
      const tot = ledger.totals;
      lines.push(
        truncate(`💡 session: ${tot.turns} turns · ${tot.edits} edits · ${tot.tools} tools${tot.errors ? ` · ${tot.errors} errors` : ""}`),
      );
    }
  }

  if (lines.length === 0) lines.push("💡 ready");
  return lines.slice(0, Math.max(1, maxLines));
}

/** Expanded multiline view for /insights. */
export function renderExpanded(ledger: Ledger): string[] {
  const lines: string[] = [];
  const tot = ledger.totals;
  lines.push(`💡 session: ${tot.turns} turns · ${tot.edits} edits · ${tot.tools} tools · ${tot.errors} errors`);
  for (const m of ledger.milestones.slice(0, 7)) {
    const icon = KIND_ICON[m.kind] ?? "•";
    lines.push(`  ${icon} ${KIND_LABEL[m.kind] ?? m.kind}${m.note ? ` (${m.note})` : ""}`);
  }
  const lastValidation = ledger.validation[0];
  if (lastValidation) {
    lines.push(`  🧪 last validation: ${lastValidation.outcome}`);
  }
  return lines;
}
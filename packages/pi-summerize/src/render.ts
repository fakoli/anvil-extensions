// pi-summerize — widget rendering. Uses the component-factory form of
// ctx.ui.setWidget so the pi-tui Text component wraps the paragraph to the
// terminal width (no manual width math here).

import { Text } from "@earendil-works/pi-tui";

export const WIDGET_KEY = "pi-summerize";

/** Widget factory for a commentary paragraph. Dim reads as commentary, not chat. */
export function commentaryWidget(paragraph: string): (tui: any, theme: any) => any {
  return (_tui: any, theme: any) => new Text(theme.fg("dim", paragraph), 0, 0);
}

/** Deterministic fallback sentence used when the model call fails. */
export function fallbackLine(counts: { toolCalls: number; edits: number; failures: number }): string {
  const bits: string[] = [];
  if (counts.toolCalls > 0) bits.push(`${counts.toolCalls} tool call${counts.toolCalls === 1 ? "" : "s"}`);
  if (counts.edits > 0) bits.push(`${counts.edits} edit${counts.edits === 1 ? "" : "s"}`);
  if (counts.failures > 0) bits.push(`${counts.failures} failing call${counts.failures === 1 ? "" : "s"}`);
  const summary = bits.length > 0 ? bits.join(", ") : "no activity";
  const tail =
    counts.failures > 0 ? " — some calls failed; the agent may retry." : ".";
  return `Since last commentary: ${summary}${tail}`;
}
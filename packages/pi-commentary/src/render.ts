// pi-commentary — widget rendering. Uses the component-factory form of
// ctx.ui.setWidget so the pi-tui Text component wraps the paragraph to the
// terminal width (no manual width math here).

import { Container, Text } from "@earendil-works/pi-tui";

export const WIDGET_KEY = "pi-commentary";

const BANNER_WIDTH = 56;

/**
 * Accent banner line: separates tips from the (plain-colored) insights
 * widget above it and gives the tip its own visual header.
 */
export function banner(theme: any): string {
  const label = "◆ tips ";
  const rule = "─".repeat(Math.max(10, BANNER_WIDTH - label.length));
  return theme.fg("accent", label) + theme.fg("dim", rule);
}

/** Plain-text banner for RPC widgets (no ANSI available there). */
export function plainBanner(width = BANNER_WIDTH): string {
  const label = "◆ tips ";
  return label + "─".repeat(Math.max(10, width - label.length));
}

/**
 * Widget factory for a commentary paragraph: accent banner + dim body.
 * Dim reads as commentary, not chat; accent banner reads as a distinct layer.
 */
export function commentaryWidget(paragraph: string): (tui: any, theme: any) => any {
  return (_tui: any, theme: any) => {
    const container = new Container();
    container.addChild(new Text(banner(theme), 0, 0));
    container.addChild(new Text(theme.fg("dim", paragraph), 0, 0));
    return container;
  };
}

/** Plain word-wrap to fixed-width lines for RPC widgets (no ANSI, no TUI). */
export function wrapPlain(text: string, width = 100): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let current = "";
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}
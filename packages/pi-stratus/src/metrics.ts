// Pinned font/glyph measurements (T002) — fallback-based, deterministic.
// fallbackUnits(text) = sum(CJK/full-width ? 2 : 1)
// fallbackMaskW = 6.5 * (fontSize / 13) * units + 13
// maskH = lineCount * (1.2 * fontSize) + 6

const CJK_RANGE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u3000-\u303F\u4E00-\u9FFF]/;

export function fallbackUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += CJK_RANGE.test(ch) ? 2 : 1;
  }
  return units;
}

export function fallbackMaskW(text: string, fontSize: number): number {
  return 6.5 * (fontSize / 13) * fallbackUnits(text) + 13;
}

export function maskH(lines: readonly string[], fontSize: number): number {
  return lines.length * (1.2 * fontSize) + 6;
}

/** Split text into lines at semantic separators, preserving complete tokens. */
;/** Break a single over-long token at the character level. */
function breakToken(token: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of token) {
    if (fallbackMaskW(current + ch, fontSize) > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  if (fallbackMaskW(text, fontSize) <= maxWidth) return [text];
  const separators = [" — ", " — ", " + ", " / ", ", ", " "];
  for (const sep of separators) {
    if (!text.includes(sep)) continue;
    const idx = text.indexOf(sep);
    const a = text.slice(0, idx + sep.length).trimEnd();
    const b = text.slice(idx + sep.length).trimStart();
    if (a.length > 0 && b.length > 0) {
      // Each part is recursively wrapped — a part can still overflow.
      return [...wrapText(a, maxWidth, fontSize), ...wrapText(b, maxWidth, fontSize)];
    }
  }
  // No separator: split into words, then break any token that still
  // overflows at the character level.
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (fallbackMaskW(candidate, fontSize) > maxWidth && current.length > 0) {
      lines.push(current);
      // A single token longer than the max width is broken at char level.
      if (fallbackMaskW(word, fontSize) > maxWidth) {
        lines.push(...breakToken(word, maxWidth, fontSize));
        current = "";
      } else {
        current = word;
      }
    } else if (fallbackMaskW(word, fontSize) > maxWidth) {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      lines.push(...breakToken(word, maxWidth, fontSize));
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

export interface Metrics {
  version: string;
}

export const PINNED_METRICS: Metrics = { version: "stratus-metrics-v1" };

export function metricsHash(): string {
  return PINNED_METRICS.version;
}

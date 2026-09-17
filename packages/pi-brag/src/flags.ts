// /brag invocation parsing. Pure string logic, no I/O — fully offline-testable.
//
// Grammar (mirrors the upstream brag skill's flags):
//   /brag [--tone <preset|freeform>] [--format landscape|vertical|square]
//         [--duration <seconds>] [--title <text>] [--no-music] [--no-sfx]
//         [--voice] [freeform creative direction ...]
//
// `--flag=value` is accepted alongside `--flag value`. Quoted values are kept
// as single tokens. Unrecognized --flags are collected (not fatal) so the
// kickoff prompt can tell the agent what was ignored.

export const FORMATS = ["landscape", "vertical", "square"] as const;
export type BragFormat = (typeof FORMATS)[number];

export const TONE_PRESETS = [
  "default",
  "polished",
  "yc-parody",
  "chaotic",
  "deadpan",
  "cinematic",
  "app-store",
] as const;
export type TonePreset = (typeof TONE_PRESETS)[number];

export const FORMAT_DIMENSIONS: Record<BragFormat, string> = {
  landscape: "1920x1080",
  vertical: "1080x1920",
  square: "1080x1080",
};

export const DURATION_MIN = 5;
export const DURATION_MAX = 90;

export interface BragOptions {
  /** Raw --tone value, if given (preset name or freeform creative direction). */
  tone?: string;
  /** Set when the --tone value matches a known preset. */
  tonePreset?: TonePreset;
  format?: BragFormat;
  /** Requested duration in seconds, clamped to [DURATION_MIN, DURATION_MAX]. */
  duration?: number;
  /** Duration was clamped (or otherwise adjusted) — worth surfacing. */
  durationClamped?: boolean;
  music: boolean;
  sfx: boolean;
  voice: boolean;
  title?: string;
  /** Freeform trailing text (creative direction / notes). */
  direction?: string;
  /** Unrecognized or malformed --flags, reported back to the caller. */
  unknownFlags: string[];
}

/** Split on whitespace, respecting single- and double-quoted spans. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasContent = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasContent = true;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (current.length > 0 || hasContent) tokens.push(current);
      current = "";
      hasContent = false;
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || hasContent) tokens.push(current);
  return tokens;
}

export function isTonePreset(value: string): value is TonePreset {
  return (TONE_PRESETS as readonly string[]).includes(value);
}

export function isFormat(value: string): value is BragFormat {
  return (FORMATS as readonly string[]).includes(value);
}

function flagValue(token: string, next: string | undefined): { value: string | undefined; consumedNext: boolean } {
  const eq = token.indexOf("=");
  if (eq !== -1) return { value: token.slice(eq + 1), consumedNext: false };
  return { value: next, consumedNext: true };
}

export function parseBragInvocation(input: string): BragOptions {
  const tokens = tokenize(input.trim());
  const opts: BragOptions = { music: true, sfx: true, voice: false, unknownFlags: [] };
  const direction: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      direction.push(token);
      continue;
    }
    const name = token.slice(2).split("=")[0];
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;

    switch (name) {
      case "no-music":
        if (token.includes("=")) opts.unknownFlags.push(`--no-music takes no value (${token})`);
        else opts.music = false;
        continue;
      case "no-sfx":
        if (token.includes("=")) opts.unknownFlags.push(`--no-sfx takes no value (${token})`);
        else opts.sfx = false;
        continue;
      case "voice":
        if (token.includes("=")) opts.unknownFlags.push(`--voice takes no value (${token})`);
        else opts.voice = true;
        continue;
      case "tone": {
        const { value, consumedNext } = flagValue(token, next);
        if (value === undefined || value === "" || value.startsWith("--")) {
          opts.unknownFlags.push("--tone (missing value)");
          if (value === undefined && consumedNext) break;
          continue;
        }
        opts.tone = value;
        if (isTonePreset(value)) opts.tonePreset = value;
        if (consumedNext) i++;
        continue;
      }
      case "format": {
        const { value, consumedNext } = flagValue(token, next);
        if (value === undefined || value === "" || value.startsWith("--")) {
          opts.unknownFlags.push("--format (missing value)");
          if (value === undefined && consumedNext) break;
          continue;
        }
        if (isFormat(value)) {
          opts.format = value;
        } else {
          opts.unknownFlags.push(`--format ${value} (expected: ${FORMATS.join("|")})`);
        }
        if (consumedNext) i++;
        continue;
      }
      case "duration": {
        const { value, consumedNext } = flagValue(token, next);
        if (value === undefined || value === "" || value.startsWith("--")) {
          opts.unknownFlags.push("--duration (missing value)");
          if (value === undefined && consumedNext) break;
          continue;
        }
        const seconds = Number(value.replace(/s$/i, ""));
        if (Number.isFinite(seconds) && seconds > 0) {
          const clamped = Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(seconds)));
          opts.duration = clamped;
          if (clamped !== seconds) opts.durationClamped = true;
        } else {
          opts.unknownFlags.push(`--duration ${value} (expected seconds, ${DURATION_MIN}–${DURATION_MAX})`);
        }
        if (consumedNext) i++;
        continue;
      }
      case "title": {
        const { value, consumedNext } = flagValue(token, next);
        if (value === undefined || value === "" || value.startsWith("--")) {
          opts.unknownFlags.push("--title (missing value)");
          if (value === undefined && consumedNext) break;
          continue;
        }
        opts.title = value;
        if (consumedNext) i++;
        continue;
      }
      default:
        opts.unknownFlags.push(token);
        continue;
    }
  }

  if (direction.length > 0) opts.direction = direction.join(" ");
  return opts;
}

/** Human-readable option summary for the kickoff prompt. */
export function formatBragOptions(opts: BragOptions): string[] {
  const lines: string[] = [];
  if (opts.tone !== undefined) {
    lines.push(`- Tone: ${opts.tone}${opts.tonePreset ? " (preset)" : " (freeform creative direction)"}`);
  } else {
    lines.push("- Tone: auto (pick from the tone presets unless the project suggests one)");
  }
  if (opts.format) {
    lines.push(`- Format: ${opts.format} (${FORMAT_DIMENSIONS[opts.format]})`);
  } else {
    lines.push("- Format: auto (landscape 1920x1080 unless the product is mobile-first)");
  }
  if (opts.duration !== undefined) {
    lines.push(
      `- Duration: ${opts.duration}s${opts.durationClamped ? ` (clamped to ${DURATION_MIN}–${DURATION_MAX}s)` : " (requested)"}`,
    );
  } else {
    lines.push("- Duration: auto (15–25s unless the story needs more)");
  }
  lines.push(`- Music: ${opts.music ? "on" : "off (--no-music)"}`);
  lines.push(`- SFX: ${opts.sfx ? "on" : "off (--no-sfx)"}`);
  lines.push(`- Voiceover: ${opts.voice ? "on (--voice)" : "off (default)"}`);
  if (opts.title !== undefined) lines.push(`- Title: ${opts.title}`);
  if (opts.direction) lines.push(`- Creative direction: ${opts.direction}`);
  if (opts.unknownFlags.length > 0) lines.push(`- Unrecognized flags (ignored): ${opts.unknownFlags.join("; ")}`);
  return lines;
}
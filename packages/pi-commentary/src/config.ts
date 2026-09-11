// pi-commentary — configuration from environment variables.
// Mirrors the repo-wide env-config conventions (pi-insights, pi-condense).

export interface CommentaryConfig {
  /** Master switch. `PI_COMMENTARY=off` disables tracking and generation. */
  enabled: boolean;
  /**
   * Model for commentary, as "provider/model-id". "default" resolves to the
   * session's current model. Recommended for fleet setups: a secondary model
   * (e.g. "anvil/llm.secondary") so commentary never touches the primary.
   */
  model: string;
  /** Minimum seconds between commentary emissions. */
  minIntervalMs: number;
  /** Wall-clock ceiling for one commentary call. */
  maxTimeoutMs: number;
  /** Stall (no-output) ceiling for one commentary call. */
  idleTimeoutMs: number;
  /** Hard cap on observation payload sent to the model. */
  maxInputChars: number;
  /** Hard cap on the rendered paragraph. */
  maxOutputChars: number;
}

const DEFAULTS = {
  minIntervalSeconds: 300,
  maxTimeoutSeconds: 45,
  idleTimeoutSeconds: 20,
  maxInputChars: 6000,
  maxOutputChars: 700,
};

function num(name: string, fallbackSeconds: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallbackSeconds;
  return Math.min(max, Math.max(min, raw));
}

export function readConfig(): CommentaryConfig {
  const env = process.env;
  return {
    enabled: (env.PI_COMMENTARY ?? "on").toLowerCase() !== "off",
    model: env.PI_COMMENTARY_MODEL ?? "default",
    minIntervalMs: num("PI_COMMENTARY_MIN_INTERVAL_SECONDS", DEFAULTS.minIntervalSeconds, 0, 3600) * 1000,
    maxTimeoutMs: num("PI_COMMENTARY_TIMEOUT_SECONDS", DEFAULTS.maxTimeoutSeconds, 5, 600) * 1000,
    idleTimeoutMs: num("PI_COMMENTARY_IDLE_TIMEOUT_SECONDS", DEFAULTS.idleTimeoutSeconds, 2, 300) * 1000,
    maxInputChars: num("PI_COMMENTARY_MAX_INPUT_CHARS", DEFAULTS.maxInputChars, 500, 100_000),
    maxOutputChars: num("PI_COMMENTARY_MAX_OUTPUT_CHARS", DEFAULTS.maxOutputChars, 100, 4000),
  };
}

export const DEFAULTS_EXPORT = DEFAULTS;
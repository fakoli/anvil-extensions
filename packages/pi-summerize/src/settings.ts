// pi-summerize — layered settings persistence.
//
// Resolution order (later wins): defaults → env (PI_SUMMERIZE_*) → user file
// (~/.pi/agent/pi-summerize.json) → project file (.pi/pi-summerize.json) →
// session (in-memory, /summerize dialog). Files carry the SAME shape as the
// env vars but snake_case keys; unknown keys are rejected on read so typos
// fail loudly instead of silently disabling a setting.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { SummerizeConfig } from "./config.js";

// Env override exists for tests and sandboxed environments; production uses
// the standard path under the pi agent dir.
export const USER_SETTINGS_PATH =
  process.env.PI_SUMMERIZE_USER_SETTINGS ?? join(homedir(), ".pi", "agent", "pi-summerize.json");
export const PROJECT_SETTINGS_NAME = "pi-summerize.json";

/** Keys allowed in settings files, with their SummerizeConfig mapping. */
const FILE_KEYS: Record<string, keyof SummerizeConfig> = {
  enabled: "enabled",
  model: "model",
  minIntervalSeconds: "minIntervalMs",
  timeoutSeconds: "maxTimeoutMs",
  idleTimeoutSeconds: "idleTimeoutMs",
  maxInputChars: "maxInputChars",
  maxOutputChars: "maxOutputChars",
};

const MS_KEYS = new Set(["minIntervalMs", "maxTimeoutMs", "idleTimeoutMs"]);

// Field bounds — the same clamps readConfig() applies to env values, applied
// to file and dialog values too (astra: 1e308 seconds must not become
// maxTimeoutMs:Infinity, and 0 must not disable a cap).
const BOUNDS: Record<string, [number, number]> = {
  minIntervalMs: [0, 3_600_000],
  maxTimeoutMs: [5_000, 600_000],
  idleTimeoutMs: [2_000, 300_000],
  maxInputChars: [500, 100_000],
  maxOutputChars: [100, 4_000],
};

export interface LoadedSettings {
  overrides: Partial<SummerizeConfig>;
  sources: string[]; // human-readable provenance, e.g. "user:/home/x/.pi/agent/pi-summerize.json"
  problems: string[]; // validation failures (reported via notify, never thrown)
}

/** Validate dialog-collected values through the SAME rules as files. */
export function validateSettingsObject(obj: Record<string, unknown>): { overrides: Partial<SummerizeConfig>; problems: string[] } {
  const problems: string[] = [];
  const overrides = validate(obj, "dialog", problems);
  return { overrides: overrides ?? {}, problems };
}

function validate(obj: Record<string, unknown>, path: string, problems: string[]): Partial<SummerizeConfig> | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!Object.hasOwn(FILE_KEYS, key)) {
      problems.push(`${path}: unknown key "${key}" (expected: ${Object.keys(FILE_KEYS).join(", ")})`);
      continue;
    }
    const target = FILE_KEYS[key];
    if (target === "enabled") {
      if (typeof value !== "boolean") {
        problems.push(`${path}: "enabled" must be true|false`);
        continue;
      }
      out[target] = value;
      continue;
    }
    if (target === "model") {
      if (typeof value !== "string" || value.length === 0) {
        problems.push(`${path}: "model" must be a non-empty string ("default" or "provider/model-id")`);
        continue;
      }
      if (value !== "default" && !/^[a-zA-Z0-9_.:-]+\/[a-zA-Z0-9_.:-]+$/.test(value)) {
        problems.push(`${path}: "model" must be "default" or "provider/model-id"`);
        continue;
      }
      out[target] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      problems.push(`${path}: "${key}" must be a non-negative finite number`);
      continue;
    }
    const normalized = MS_KEYS.has(target) ? value * 1000 : value;
    if (!Number.isFinite(normalized)) {
      problems.push(`${path}: "${key}" overflows after unit conversion`);
      continue;
    }
    const [lo, hi] = BOUNDS[target] ?? [-Infinity, Infinity];
    if (normalized < lo || normalized > hi) {
      problems.push(`${path}: "${key}" out of bounds (${lo}..${hi} in target units)`);
      continue;
    }
    out[target] = normalized;
  }
  return Object.keys(out).length > 0 ? (out as Partial<SummerizeConfig>) : null;
}

function readSettingsFile(path: string): { obj: Record<string, unknown> | null; error?: string } {
  if (!existsSync(path)) return { obj: null };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { obj: null, error: `${path}: settings file must be a JSON object` };
    }
    return { obj: parsed as Record<string, unknown> };
  } catch (error) {
    return { obj: null, error: `${path}: unparseable JSON (${error instanceof Error ? error.message : String(error)})` };
  }
}

/** Load layered file settings (user then project; project wins). */
export function loadFileSettings(projectDir?: string, userPathOverride?: string): LoadedSettings {
  const result: LoadedSettings = { overrides: {}, sources: [], problems: [] };
  for (const [label, path] of [
    ["user", userPathOverride ?? USER_SETTINGS_PATH],
    ["project", projectDir ? join(resolve(projectDir), ".pi", PROJECT_SETTINGS_NAME) : null],
  ] as const) {
    if (!path) continue;
    const { obj, error } = readSettingsFile(path);
    if (error) {
      result.problems.push(error);
      continue;
    }
    if (!obj) continue;
    const validated = validate(obj, path, result.problems);
    if (validated) {
      result.overrides = { ...result.overrides, ...validated };
      result.sources.push(`${label}:${path}`);
    }
  }
  return result;
}

/** Apply layered file settings over an env-derived base config (in place). */
export function applyFileSettings(config: SummerizeConfig, loaded: LoadedSettings): void {
  Object.assign(config, loaded.overrides);
}

// Advisory cross-process lock (mkdir is atomic on POSIX). Bounded wait; on
// timeout the save FAILS (callers notify) instead of racing the merge.
const LOCK_TIMEOUT_MS = 2000;
const LOCK_RETRY_MS = 20;

function withSettingsLock<T>(path: string, fn: () => T): T {
  // parent MUST exist before the lock: a fresh settings directory otherwise
  // yields ENOENT on the lock mkdir, which a naive catch misreads as
  // contention and retries for the full timeout (astra round-2 repro)
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const lockDir = `${path}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      // only genuine contention (EEXIST) is retried; every other filesystem
      // error propagates immediately
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new Error(`settings file busy: ${lockDir} held by another process`);
      }
      // spin: bounded and short; a lock holder finishes in microseconds
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    try {
      rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // best effort unlock
    }
  }
}

/** Persist a partial settings object to the given scope. Atomic + locked. */
export function saveSettings(scope: "user" | "project", partial: Record<string, unknown>, projectDir?: string, userPathOverride?: string): string {
  const path =
    scope === "user"
      ? userPathOverride ?? USER_SETTINGS_PATH
      : join(resolve(projectDir ?? process.cwd()), ".pi", PROJECT_SETTINGS_NAME);
  return withSettingsLock(path, () => {
    // merge with existing so the dialog only writes what it changed; refuse
    // to clobber an unreadable/malformed file (recovery is explicit)
    const { obj, error } = readSettingsFile(path);
    if (error) throw new Error(`refusing to overwrite malformed settings: ${error}`);
    let merged: Record<string, unknown> = { ...(obj ?? {}), ...partial };
    const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`);
    renameSync(tmp, path);
    return path;
  });
}

/** Remove a settings file (used by the dialog's "reset" choice). */
export function clearSettings(scope: "user" | "project", projectDir?: string, userPathOverride?: string): boolean {
  const path =
    scope === "user"
      ? userPathOverride ?? USER_SETTINGS_PATH
      : join(resolve(projectDir ?? process.cwd()), ".pi", PROJECT_SETTINGS_NAME);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
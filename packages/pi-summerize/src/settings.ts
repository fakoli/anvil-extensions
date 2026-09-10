// pi-summerize — layered settings persistence.
//
// Resolution order (later wins): defaults → env (PI_SUMMERIZE_*) → user file
// (~/.pi/agent/pi-summerize.json) → project file (.pi/pi-summerize.json) →
// session (in-memory, /summerize dialog). Files carry the SAME shape as the
// env vars but snake_case keys; unknown keys are rejected on read so typos
// fail loudly instead of silently disabling a setting.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
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

export interface LoadedSettings {
  overrides: Partial<SummerizeConfig>;
  sources: string[]; // human-readable provenance, e.g. "user:/home/x/.pi/agent/pi-summerize.json"
  problems: string[]; // validation failures (reported via notify, never thrown)
}

function validate(obj: Record<string, unknown>, path: string, problems: string[]): Partial<SummerizeConfig> | null {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!(key in FILE_KEYS)) {
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
      problems.push(`${path}: "${key}" must be a non-negative number`);
      continue;
    }
    out[target] = MS_KEYS.has(target) ? value * 1000 : value;
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

/** Persist a partial settings object to the given scope. Atomic write. */
export function saveSettings(scope: "user" | "project", partial: Record<string, unknown>, projectDir?: string, userPathOverride?: string): string {
  const path =
    scope === "user"
      ? userPathOverride ?? USER_SETTINGS_PATH
      : join(resolve(projectDir ?? process.cwd()), ".pi", PROJECT_SETTINGS_NAME);
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  // merge with existing file so the dialog only writes what it changed
  let merged: Record<string, unknown> = {};
  const { obj } = readSettingsFile(path);
  if (obj) merged = obj;
  merged = { ...merged, ...partial };
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`);
  renameSync(tmp, path);
  return path;
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
// Settings loading and API-key resolution.
// Port of nanobanana.py config_path / parse_settings_file / load_settings /
// load_api_key. Shares the SAME on-disk config with the Claude plugin:
// ${XDG_CONFIG_HOME:-~/.config}/nano-banana-pro/config.json.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
  closeSync,
  openSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDotenv } from "./dotenv.js";
import { DEFAULTS } from "./models.js";

export interface Settings {
  default_model?: string;
  default_aspect?: string;
  default_size?: string;
  output_dir?: string;
  max_remix_images?: number;
  gemini_api_key?: string; // legacy; never echoed, never written by this package
  [key: string]: unknown;
}

const STRING_FIELDS = ["default_model", "default_aspect", "default_size", "output_dir", "gemini_api_key"];
const PLACEHOLDERS = new Set(["your_api_key_here", "your-api-key-here"]);

export function configPath(): string {
  const override = process.env.NANOBANANA_CONFIG;
  if (override) return join2Home(override);
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdg, "nano-banana-pro", "config.json");
}

function join2Home(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/**
 * Parse a JSON settings file, or the legacy Claude plugin's YAML-frontmatter
 * settings (`<cwd>/.claude/nano-banana-pro.local.md`) using a minimal line
 * parser: `key: value` pairs, quoted strings, `#` comments. The legacy schema
 * only ever contains flat string keys, so a full YAML parser is not required.
 * Parser errors are NOT echoed: they can contain a legacy API key.
 */
export function parseSettingsFile(path: string): Settings {
  if (!existsSync(path)) return {};
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Invalid settings file: ${path}; expected JSON or YAML settings`);
  }
  let data: unknown;
  if (path.endsWith(".json")) {
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error(`Invalid settings file: ${path}; expected JSON or YAML settings`);
    }
  } else {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|\s*$)/);
    if (!match) throw new Error(`Invalid settings file: ${path}; expected JSON or YAML settings`);
    data = parseFrontmatter(match[1]);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Invalid settings file: ${path}; expected JSON or YAML settings`);
  }
  const settings = data as Record<string, unknown>;
  for (const field of STRING_FIELDS) {
    const value = settings[field];
    if (field in settings && value !== null && value !== undefined && typeof value !== "string") {
      throw new Error(`Invalid settings file: ${path}; expected JSON or YAML settings`);
    }
  }
  return settings as Settings;
}

function parseFrontmatter(body: string): Record<string, string> {
  const data: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue; // not a flat `key: value` pair; skip rather than fail
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    const hash = value.search(/\s#/);
    if (hash >= 0) value = value.slice(0, hash).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return data;
}

/**
 * Resolve settings: explicit file or NANOBANANA_CONFIG (must exist), else the
 * XDG user config overridden by the legacy per-project frontmatter file.
 * `sessionOverrides` (from /image-config, session scope) apply last.
 */
export function loadSettings(explicit?: string, sessionOverrides?: Partial<Settings>): Settings {
  let settings: Settings;
  if (explicit || process.env.NANOBANANA_CONFIG) {
    const path = explicit ? join2Home(explicit) : configPath();
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Settings file not found: ${path}`);
    }
    settings = parseSettingsFile(path);
  } else {
    settings = parseSettingsFile(configPath());
    const legacy = join(process.cwd(), ".claude", "nano-banana-pro.local.md");
    settings = { ...settings, ...parseSettingsFile(legacy) };
  }
  return { ...settings, ...(sessionOverrides ?? {}) };
}

function usable(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    !PLACEHOLDERS.has(value.trim().toLowerCase())
  );
}

/**
 * API key precedence (mirrors the original): exported GEMINI_API_KEY →
 * project .env → home .env → legacy settings key. Placeholders are ignored.
 * The key is never logged or echoed.
 */
export function loadApiKey(settings?: Settings): string | null {
  const env = process.env.GEMINI_API_KEY;
  if (usable(env)) return env.trim();
  for (const path of [join(process.cwd(), ".env"), join(homedir(), ".env")]) {
    if (existsSync(path) && statSync(path).isFile()) {
      let parsed: Record<string, string>;
      try {
        parsed = parseDotenv(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      if (usable(parsed.GEMINI_API_KEY)) return parsed.GEMINI_API_KEY.trim();
    }
  }
  const legacy = settings?.gemini_api_key;
  return usable(legacy) ? legacy.trim() : null;
}

/**
 * Create the default user settings file if missing (never overwrites), with
 * private file permissions. Returns the path. No credentials are stored.
 */
export function initConfigFile(path = configPath()): string {
  if (!existsSync(path)) {
    if (!path.endsWith(".json")) {
      throw new Error("New configuration files must use the .json extension");
    }
    atomicWriteText(`${JSON.stringify(DEFAULTS, null, 2)}\n`, path);
  }
  return path;
}

/** Read-modify-write a user settings file atomically, preserving other keys. */
export function saveUserSettings(updates: Partial<Settings>, path = configPath()): string {
  const existing = parseSettingsFile(path);
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  delete merged.gemini_api_key; // never store credentials
  atomicWriteText(`${JSON.stringify(merged, null, 2)}\n`, path);
  return path;
}

/** Remove a user settings file if present. */
export function resetUserSettings(path = configPath()): boolean {
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

/** Atomic publish: temp file in the target dir, then rename/link. 0600. */
export function atomicWriteText(content: string, path: string): void {
  const dir = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\") + 1) || 1);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.${path.slice(path.lastIndexOf("/") + 1) || path}-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    const fd = openSync(temp, "w", 0o600);
    try {
      writeFileSync(fd, content, "utf8");
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } finally {
    try { unlinkSync(temp); } catch { /* already renamed */ }
  }
}

export { DEFAULTS };
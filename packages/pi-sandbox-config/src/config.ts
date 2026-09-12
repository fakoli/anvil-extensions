// config.ts — sandbox run-config read/validate/write, mirroring the rules of
// anvil's scripts/pi-sandbox-config.mjs exactly (that module is the contract;
// this extension is the friendly front-end for it).
//
// Scope rules (fail-closed, identical to the anvil validator):
//   trusted scope  (user config or an explicit file): image / network / caps /
//                  max_containers
//   project scope  (<workspace>/.pi/sandbox.config.json): max_containers ONLY —
//                  the workspace is untrusted input and must not loosen
//                  container security.
// Precedence: --config > user config > defaults; project max_containers merges
// most-restrictive-wins. Writes are atomic (tmp + rename, mode 0600).

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MAX_CONTAINERS_MIN = 1;
export const MAX_CONTAINERS_MAX = 256;
export const NETWORK_VALUES = ["none"] as const; // "inference" reserved upstream
export const CAPS_PRESETS = ["all-dropped", "docker-default"] as const;
export const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*@sha256:[a-f0-9]{64}$/;
export const CONFIG_KEYS = ["image", "network", "caps", "max_containers"] as const;
export const PROJECT_ALLOWED_KEYS = ["max_containers"] as const;
const CONFIG_READ_CAP_BYTES = 64 * 1024;

export type ConfigScope = "user" | "project";

export interface ScopePolicy {
  trusted: boolean;
  allowedKeys: readonly string[];
}

export const USER_CONFIG_PATH = join(homedir(), ".config", "anvil", "sandbox.config.json");
export function projectConfigPath(workspace: string): string {
  return join(workspace, ".pi", "sandbox.config.json");
}

export function scopePolicy(scope: ConfigScope): ScopePolicy {
  return scope === "user"
    ? { trusted: true, allowedKeys: CONFIG_KEYS }
    : { trusted: false, allowedKeys: PROJECT_ALLOWED_KEYS };
}

export class ConfigError extends Error {}

function fail(msg: string): never {
  throw new ConfigError(msg);
}

// ---- reading ---------------------------------------------------------------

export interface RawConfig {
  path: string;
  exists: boolean;
  doc: Record<string, unknown> | null;
  validation: { ok: boolean; errors: string[] };
}

export function readConfigFile(path: string, scope: ConfigScope): RawConfig {
  let st;
  try {
    st = statSync(path);
  } catch {
    return { path, exists: false, doc: null, validation: { ok: true, errors: [] } };
  }
  if (!st.isFile()) fail(`${path} is not a regular file`);
  let raw: string;
  try {
    if (st.size > CONFIG_READ_CAP_BYTES) fail(`${path} exceeds the ${CONFIG_READ_CAP_BYTES}-byte config cap`);
    raw = readFileSync(path, "utf8");
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    fail(`cannot read ${path}: ${(e as Error).message}`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    return {
      path,
      exists: true,
      doc: null,
      validation: { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] },
    };
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { path, exists: true, doc: null, validation: { ok: false, errors: ["must contain a JSON object"] } };
  }
  const record = doc as Record<string, unknown>;
  return { path, exists: true, doc: record, validation: validateConfigDoc(record, scope) };
}

// ---- validation (mirror of scripts/pi-sandbox-config.mjs) -------------------

export function validateConfigDoc(
  doc: Record<string, unknown>,
  scope: ConfigScope,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const { trusted, allowedKeys } = scopePolicy(scope);
  for (const key of Object.keys(doc)) {
    if (!allowedKeys.includes(key)) {
      errors.push(
        trusted
          ? `unknown key "${key}" (allowed: ${CONFIG_KEYS.join(", ")})`
          : `project-scope config may only set ${PROJECT_ALLOWED_KEYS.join(", ")} — found "${key}" (security fields are trusted-scope only)`,
      );
    }
  }
  if ("image" in doc) {
    const v = doc.image;
    if (typeof v !== "string" || !IMAGE_RE.test(v)) {
      errors.push(
        `"image" must be a digest-pinned reference (<repo>@sha256:<64 hex>); got ${JSON.stringify(v)}`,
      );
    }
  }
  if ("network" in doc) {
    const v = doc.network;
    if (typeof v !== "string" || !(NETWORK_VALUES as readonly string[]).includes(v)) {
      errors.push(
        `"network" must be one of ${JSON.stringify(NETWORK_VALUES)} ("inference" is reserved and not implemented on the docker path); got ${JSON.stringify(v)}`,
      );
    }
  }
  if ("caps" in doc) {
    const v = doc.caps;
    if (typeof v !== "string" || !(CAPS_PRESETS as readonly string[]).includes(v)) {
      errors.push(`"caps" must be one of ${JSON.stringify(CAPS_PRESETS)}; got ${JSON.stringify(v)}`);
    }
  }
  if ("max_containers" in doc) {
    const v = doc.max_containers;
    if (!Number.isInteger(v) || (v as number) < MAX_CONTAINERS_MIN || (v as number) > MAX_CONTAINERS_MAX) {
      errors.push(
        `"max_containers" must be an integer in [${MAX_CONTAINERS_MIN}, ${MAX_CONTAINERS_MAX}]; got ${JSON.stringify(v)}`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---- effective view (precedence: trusted > defaults; min-max merge) ---------

export interface EffectiveConfig {
  image: string; // "" → launcher default / ANVIL_SANDBOX_IMAGE env
  caps: string; // "all-dropped" | "docker-default"
  maxContainers: number | null; // null → no cap enforced
  source: string; // human-readable provenance
}

export function effectiveConfig(user: RawConfig | null, project: RawConfig | null): EffectiveConfig {
  const trustedDoc = user?.exists && user.validation.ok ? user.doc : null;
  const projectDoc = project?.exists && project.validation.ok ? project.doc : null;
  const trustedMax = typeof trustedDoc?.max_containers === "number" ? (trustedDoc.max_containers as number) : null;
  const projectMax = typeof projectDoc?.max_containers === "number" ? (projectDoc.max_containers as number) : null;
  let max: number | null = trustedMax;
  if (projectMax !== null) max = max === null ? projectMax : Math.min(max, projectMax);
  const sourceBase = trustedDoc ? (user?.path ?? "explicit config") : "defaults";
  const source = projectMax !== null ? `${sourceBase} + project(max_containers)` : sourceBase;
  return {
    image: typeof trustedDoc?.image === "string" ? trustedDoc.image : "",
    caps: typeof trustedDoc?.caps === "string" ? trustedDoc.caps : "all-dropped",
    maxContainers: max,
    source,
  };
}

// ---- writing (atomic, 0600) --------------------------------------------------

export function writeConfigAtomic(path: string, doc: Record<string, unknown>): void {
  const dir = dirname(path);
  let existingDirMode: number | undefined;
  try {
    existingDirMode = statSync(dir).mode;
  } catch {
    // missing dir → create it
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw e;
  } finally {
    if (existingDirMode === undefined) {
      // we created the dir with 0700; leave it stricter rather than looser
    }
  }
}
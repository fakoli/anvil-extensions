// anvil.ts — locate the sandbox policy surface and cross-check configs
// against anvil's own fail-closed validator (scripts/pi-sandbox-config.mjs).
//
// Discovery order for packaging/pi/sandbox/allowlist.json:
//   ANVIL_SANDBOX_ALLOWLIST (explicit file) > ANVIL_CHECKOUT (anvil repo root) >
//   walk up from cwd looking for packaging/pi/sandbox/allowlist.json (≤ 8 levels) >
//   ~/code/anvil > null (degrade: profiles unknown, free-text profile allowed
//   with warning; every saved config is still schema-validated locally and
//   cross-checked when the validator is found).
// NOTE: ANVIL_ROOT is deliberately NOT used — it means the anvil *state* root
// to the anvil CLI (anvil_status etc.); overloading it here would misresolve.
//
// Subprocess hygiene mirrors the sandbox scripts themselves: injection-vector
// env vars are stripped before node starts, timeout via execFile, output capped.

import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join as join$, resolve as pathResolve } from "node:path";

export class AnvilError extends Error {}

const WALK_UP_LIMIT = 8;
const SUBPROC_TIMEOUT_MS = 15_000;
const OUTPUT_CAP = 256 * 1024;

const INJECTION_ENV_VARS = [
  "NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT",
  "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "BASH_ENV", "ENV",
  "PYTHONSTARTUP", "PYTHONPATH", "ZDOTDIR", "RUBYOPT",
];

export interface SandboxPolicy {
  allowlistPath: string;
  repoRoot: string; // dir containing scripts/pi-sandbox-config.mjs
  profiles: Array<{ name: string; description: string; network: string }>;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findSandboxPolicy(cwd: string): SandboxPolicy | null {
  const explicit = process.env.ANVIL_SANDBOX_ALLOWLIST;
  if (explicit && isFile(explicit)) {
    const checkout = process.env.ANVIL_CHECKOUT && isFile(process.env.ANVIL_CHECKOUT + "/scripts/pi-sandbox-config.mjs")
      ? pathResolve(process.env.ANVIL_CHECKOUT)
      : pathResolve(explicit, "../../.."); // allowlist lives at <root>/packaging/pi/sandbox/
    return buildPolicy(explicit, repoRootOf(explicit, checkout));
  }
  const checkoutEnv = process.env.ANVIL_CHECKOUT;
  if (checkoutEnv) {
    const al = pathResolve(checkoutEnv, "packaging", "pi", "sandbox", "allowlist.json");
    if (isFile(al)) return buildPolicy(al, pathResolve(checkoutEnv));
  }
  let dir = pathResolve(cwd);
  for (let i = 0; i < WALK_UP_LIMIT; i++) {
    const al = join$(dir, "packaging", "pi", "sandbox", "allowlist.json");
    if (isFile(al)) return buildPolicy(al, dir);
    const parent = pathResolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  const defaultCheckout = join$(getHomeDir(), "code", "anvil");
  const alDefault = join$(defaultCheckout, "packaging", "pi", "sandbox", "allowlist.json");
  if (isFile(alDefault)) return buildPolicy(alDefault, defaultCheckout);
  return null;
}

function getHomeDir(): string {
  return process.env.HOME || homedir();
}

function repoRootOf(allowlistPath: string, fallback: string): string {
  // <root>/packaging/pi/sandbox/allowlist.json → repo root is three up
  const guess = pathResolve(allowlistPath, "../../..");
  return isFile(join$(guess, "scripts", "pi-sandbox-config.mjs")) ? guess : fallback;
}

function buildPolicy(allowlistPath: string, repoRoot: string): SandboxPolicy {
  let doc: any;
  try {
    doc = JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch (e) {
    throw new AnvilError(`cannot parse allowlist at ${allowlistPath}: ${(e as Error).message}`);
  }
  const profiles: SandboxPolicy["profiles"] = [];
  const entries = doc?.profiles;
  if (entries && typeof entries === "object" && !Array.isArray(entries)) {
    for (const [name, p] of Object.entries(entries)) {
      const prof = p as Record<string, unknown>;
      profiles.push({
        name,
        description: typeof prof.description === "string" ? prof.description : "",
        network: typeof prof.network === "string" ? prof.network : "none",
      });
    }
  }
  if (!profiles.length) throw new AnvilError(`allowlist at ${allowlistPath} exposes no profiles`);
  return { allowlistPath: pathResolve(allowlistPath), repoRoot, profiles };
}

function sanitizedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of INJECTION_ENV_VARS) delete env[k];
  return env;
}

function runNode(
  args: string[],
  timeoutMs = SUBPROC_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      args,
      { timeout: timeoutMs, maxBuffer: OUTPUT_CAP, env: sanitizedEnv(), killSignal: "SIGKILL", signal },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === undefined && !stdout && !stderr) {
          rejectPromise(new AnvilError(`validator spawn failed: ${err.message}`));
          return;
        }
        const code = err && typeof (err as any).code === "number" ? ((err as any).code as number) : err ? 1 : 0;
        if (err && (err as any).killed) {
          rejectPromise(new AnvilError(`validator timed out after ${timeoutMs}ms`));
          return;
        }
        resolvePromise({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

const VALIDATOR_REL = ["scripts", "pi-sandbox-config.mjs"];

function validatorPath(policy: SandboxPolicy): string {
  const p = join$(policy.repoRoot, ...VALIDATOR_REL);
  if (!isFile(p)) {
    throw new AnvilError(`sandbox validator not found at ${p} (anvil checkout expected)`);
  }
  return p;
}

// Cross-check an exact config-file byteset against anvil's own validator —
// call this BEFORE writing so a rejected config never lands on disk.
export async function crossCheckConfig(
  policy: SandboxPolicy,
  configFile: string,
  opts: { profile?: string; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; message: string }> {
  const args = [validatorPath(policy), "validate", "--config", pathResolve(configFile)];
  if (policy.allowlistPath) args.push("--allowlist", policy.allowlistPath);
  if (opts.profile) args.push("--profile", opts.profile);
  const r = await runNode(args, SUBPROC_TIMEOUT_MS, opts.signal);
  if (r.code === 0) return { ok: true, message: r.stdout.trim() };
  return { ok: false, message: (r.stderr || r.stdout).trim() || `validator exit ${r.code}` };
}

export interface ResolvedPreview {
  image: string;
  network: string;
  caps: string;
  maxContainers: string; // "" → unlimited
  configSource: string;
  raw: string; // full KEY<TAB>VALUE output
}

// Read-only resolution preview — exactly what a launch would use. Never
// launches anything: `resolve` only reads + validates.
export async function resolvePreview(
  policy: SandboxPolicy,
  opts: { profile: string; workspace: string; configFlag?: string; signal?: AbortSignal },
): Promise<ResolvedPreview> {
  const args = [
    validatorPath(policy),
    "resolve",
    "--profile", opts.profile,
    "--workspace", pathResolve(opts.workspace),
    "--allowlist", policy.allowlistPath,
  ];
  if (opts.configFlag) args.push("--config", pathResolve(opts.configFlag));
  const r = await runNode(args, SUBPROC_TIMEOUT_MS, opts.signal);
  if (r.code !== 0) {
    throw new AnvilError((r.stderr || r.stdout).trim() || `resolver exit ${r.code}`);
  }
  const map: Record<string, string> = {};
  for (const line of r.stdout.split("\n")) {
    if (!line) continue;
    const idx = line.indexOf("\t");
    if (idx < 0) throw new AnvilError(`malformed resolver output line: ${line}`);
    map[line.slice(0, idx)] = line.slice(idx + 1);
  }
  for (const k of ["IMAGE", "NETWORK", "CAPS", "MAX_CONTAINERS", "CONFIG_SOURCE"]) {
    if (!(k in map)) throw new AnvilError(`resolver output missing ${k}`);
  }
  return {
    image: map.IMAGE,
    network: map.NETWORK,
    caps: map.CAPS,
    maxContainers: map.MAX_CONTAINERS,
    configSource: map.CONFIG_SOURCE,
    raw: r.stdout.trimEnd(),
  };
}

export { existsSync };
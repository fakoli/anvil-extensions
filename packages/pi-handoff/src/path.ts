// pi-handoff — handoff file path resolution.
//
// TypeScript port of the handoff plugin's `scripts/handoff-path.sh` (MIT) and
// the key-parity logic in `hooks/session-start.py`. Correctness requirement
// (the bug the plugin exists to avoid): the path is keyed by PROJECT IDENTITY,
// not cwd, which is often a throwaway per-session worktree.
//
//   - repos with an origin remote key by the normalized remote, so separate
//     clones of the same project share one handoff note
//   - local repos key by the git COMMON dir (the main repo's .git), which is
//     shared by every linked worktree
//
// Storage lives under ~/.pi/agent/handoff/<repo-key>/handoff.md — private
// (home, not the repo), project-scoped, and independent of any host's
// internal session slugs. HANDOFF_DATA_DIR overrides the base.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const DEFAULT_HANDOFF_BASE = join(homedir(), ".pi", "agent", "handoff");

function gitStdout(projectDir: string, ...args: string[]): string | null {
  try {
    const out = execFileSync("git", ["-C", projectDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    const line = out.split("\n")[0]?.trim();
    return line || null;
  } catch {
    return null;
  }
}

// Mirror of normalize_remote() in handoff-path.sh: git@host:path,
// ssh://git@host/path, and http(s)://[user@]host/path all reduce to
// host/path; the host is lowercased, a trailing .git is stripped, and
// github.com paths are lowercased (case-insensitive there).
export function normalizeRemote(url: string): string {
  let value = url.replace(/\r$/, "").replace(/\/+$/, "");
  let host = "";
  let path = "";
  if (value.startsWith("git@") && value.includes(":")) {
    const rest = value.slice(4);
    const i = rest.indexOf(":");
    host = rest.slice(0, i);
    path = rest.slice(i + 1);
  } else if (value.startsWith("ssh://git@") && value.slice(10).includes("/")) {
    const rest = value.slice(10);
    const i = rest.indexOf("/");
    host = rest.slice(0, i);
    path = rest.slice(i + 1);
  } else if (value.startsWith("http://") || value.startsWith("https://")) {
    let rest = value.split("://", 2)[1] ?? "";
    rest = rest.split("@").pop() ?? rest;
    const i = rest.indexOf("/");
    if (i <= 0) return value;
    host = rest.slice(0, i);
    path = rest.slice(i + 1);
  } else {
    return value;
  }
  host = host.toLowerCase();
  path = path.replace(/\/+$/, "").replace(/\.git$/, "");
  if (host === "github.com") path = path.toLowerCase();
  return `${host}/${path}`;
}

// git hash-object --stdin is sha1 over "blob <len>\0<content>" — replicate it
// with node:crypto so keying never depends on git being available.
export function gitBlobSha1Prefix(text: string): string {
  const body = Buffer.from(text, "utf8");
  const framed = Buffer.concat([Buffer.from(`blob ${body.length}\0`, "ascii"), body]);
  return createHash("sha1").update(framed).digest("hex").slice(0, 12);
}

function handoffKey(hint: string, source: string): string {
  const safeHint = hint.replace(/[^A-Za-z0-9]/g, "-");
  return `${safeHint}-${gitBlobSha1Prefix(source)}`;
}

function physicalPath(p: string): string {
  // Physical (symlinks resolved) canonicalization — the original used
  // `cd && pwd -P` (bash) and `Path.resolve()` (Python), both physical. A
  // lexical resolve would key a symlinked project dir to a different file
  // than its real path (e.g. macOS /var -> /private/var).
  try {
    return realpathSync(p);
  } catch {
    try {
      return resolve(p);
    } catch {
      return p;
    }
  }
}

export interface HandoffPath {
  file: string;
  key: string;
  base: string;
  migratedFromLegacy: boolean;
}

/**
 * Resolve (and ensure) the handoff file path for a project directory.
 * `dataDir` overrides HANDOFF_DATA_DIR, which overrides the default
 * ~/.pi/agent/handoff.
 */
export function resolveHandoffPath(projectDirRaw: string, dataDir?: string): HandoffPath {
  const base = dataDir ?? process.env.HANDOFF_DATA_DIR ?? DEFAULT_HANDOFF_BASE;
  // Canonicalize to a PHYSICAL path up front: a linked worktree's cwd may be
  // uncanonical (e.g. macOS /var vs /private/var), and git returns canonical
  // paths — without this, the main checkout and its worktrees would key to
  // DIFFERENT files, the exact bug this package exists to prevent.
  const projectDir = physicalPath(projectDirRaw);

  let legacySource = projectDir;
  let legacyHint = basename(projectDir) || "project";

  const common = gitStdout(projectDir, "rev-parse", "--git-common-dir");
  if (common) {
    // --git-common-dir is the MAIN repo's .git (relative in the main
    // worktree, absolute from a linked worktree). The dirname of the common
    // ".git" dir is the repo root (standard non-bare layout); keep it
    // physical so it matches the canonical project_dir above.
    const commonAbs = common.startsWith("/") || /^[A-Za-z]:\//.test(common)
      ? common
      : join(projectDir, common);
    const repoRoot = physicalPath(dirname(commonAbs));
    legacySource = repoRoot;
    legacyHint = basename(repoRoot) || "project";
  }

  let source = legacySource;
  let hint = legacyHint;
  const remote = gitStdout(projectDir, "remote", "get-url", "origin");
  if (remote) {
    const remoteId = normalizeRemote(remote);
    if (remoteId) {
      source = `remote:${remoteId}`;
      hint = remoteId.split("/").pop() || remoteId;
    }
  }

  const key = handoffKey(hint, source);
  const dir = join(base, key);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "handoff.md");

  // One-time legacy migration: notes keyed by repo root (pre-remote-keying)
  // are copied over when the new-key file is empty and the legacy one has
  // content. (The original did the same in handoff-path.sh.)
  const legacyKey = handoffKey(legacyHint, legacySource);
  let migratedFromLegacy = false;
  if (legacyKey !== key) {
    const legacyFile = join(base, legacyKey, "handoff.md");
    const newEmpty = !existsSync(file) || statSync(file).size === 0;
    const legacyHasContent = existsSync(legacyFile) && statSync(legacyFile).size > 0;
    if (newEmpty && legacyHasContent) {
      writeFileSync(file, readFileSync(legacyFile), { mode: 0o600 });
      migratedFromLegacy = true;
    }
  }

  return { file, key, base, migratedFromLegacy };
}

/** Read a note's frontmatter (the flat key: value block between leading --- fences). */
export function parseFrontmatter(content: string): Record<string, string> | null {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return out;
    const m = lines[i].match(/^([A-Za-z_]+): ?(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return null; // unterminated block → no frontmatter
}

/** The prose of a note: everything below the frontmatter block (if any). */
export function noteProse(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return lines.slice(i + 1).join("\n").replace(/^\n+/, "");
  }
  return content;
}

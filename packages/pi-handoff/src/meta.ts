// pi-handoff — save-time state capture.
//
// TypeScript port of the handoff plugin's `scripts/handoff-meta.sh` (MIT):
// print a flat YAML frontmatter block capturing the state the note is saved
// against, so recall can tell whether the note has gone stale (branch moved,
// HEAD advanced, claims released).
//
// Every field is best-effort and independently optional: outside a git repo
// the git fields are omitted; without the anvil CLI (or outside an anvil
// project) the anvil fields are omitted. Never throws — metadata must never
// block a save. Keys are FLAT (no nesting) so freshness.ts can parse them
// with plain string matching; this file is the only writer, freshness the
// only reader — keep them in lockstep.

import { execFileSync } from "node:child_process";

function git(projectDir: string, ...args: string[]): string | null {
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

function gitDirtyCount(projectDir: string): number | null {
  try {
    const out = execFileSync("git", ["-C", projectDir, "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
    return out.split("\n").filter((l) => l.trim()).length;
  } catch {
    return null;
  }
}

function anvilSnapshot(projectDir: string): Record<string, string> {
  // Optional anvil snapshot — the anvil-pulse guard pattern: probe only when
  // the CLI exists, stay silent on any failure (not an anvil project,
  // transient).
  let statusJson: string;
  try {
    statusJson = execFileSync("anvil", ["status", "--json", "--cwd", projectDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return {};
  }
  try {
    const env = JSON.parse(statusJson || "");
    if (!env?.ok) return {};
    const data = env.data ?? {};
    const claims: Array<Record<string, unknown>> = data.claims ?? [];
    const tasks: Record<string, unknown> = data.tasks ?? {};
    const out: Record<string, string> = {};
    if (claims.length) {
      const pairs = claims.map((c) => {
        const task = String(c.task_id ?? c.task ?? "?");
        const phase = String(c.phase ?? "-");
        return `${task}:${phase}`;
      });
      out.anvil_claims = pairs.join(",");
    }
    for (const key of ["ready", "needs_review"] as const) {
      const v = tasks[key];
      if (typeof v === "number") out[`anvil_${key}`] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Build the frontmatter block for a note saved now in `projectDir`. */
export function captureMeta(projectDir: string): string {
  const lines: string[] = ["---", `saved_at: ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`];
  const branch = git(projectDir, "rev-parse", "--abbrev-ref", "HEAD");
  const head = git(projectDir, "rev-parse", "HEAD");
  if (branch) lines.push(`branch: ${branch}`);
  if (head) lines.push(`head: ${head}`);
  const dirty = gitDirtyCount(projectDir);
  if (dirty !== null) lines.push(`dirty_files: ${dirty}`);
  for (const [k, v] of Object.entries(anvilSnapshot(projectDir))) {
    lines.push(`${k}: ${v}`);
  }
  lines.push("---");
  return lines.join("\n");
}

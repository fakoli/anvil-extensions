// pi-handoff — freshness checks.
//
// TypeScript port of the handoff plugin's `scripts/handoff-freshness.sh`
// (MIT): compare a note's recorded state (the flat frontmatter captureMeta
// writes) against ACTUAL repo/anvil state, and report staleness flags so
// recall never presents a stale resume point as current.
//
// Verdict semantics: informational, never blocking — the result is always
// produced, never thrown. A legacy note with no frontmatter yields
// "freshness unavailable" (never a crash, per backward compat with
// pre-0.2.0 notes).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseFrontmatter, resolveHandoffPath } from "./path.js";

export interface FreshnessResult {
  available: boolean;
  fresh: boolean;
  flags: string[];
  ageDays: number | null;
  note: string; // one human line (the original's default output)
}

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

function isAncestor(projectDir: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["-C", projectDir, "merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function anvilClaimsLive(projectDir: string): string | null {
  try {
    return execFileSync("anvil", ["status", "--json", "--cwd", projectDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    return null;
  }
}

/**
 * Check the saved note for `projectDir` against live state.
 * `maxAgeDays` overrides HANDOFF_MAX_AGE_DAYS (default 14).
 */
export function checkFreshness(
  projectDir: string,
  opts: { maxAgeDays?: number } = {},
): FreshnessResult {
  const resolved = resolveHandoffPath(projectDir);
  if (!existsSync(resolved.file)) {
    return {
      available: false,
      fresh: false,
      flags: [],
      ageDays: null,
      note: "handoff: no handoff note saved",
    };
  }
  const content = readFileSync(resolved.file, "utf8");
  const fm = parseFrontmatter(content);
  if (!fm) {
    return {
      available: false,
      fresh: false,
      flags: [],
      ageDays: null,
      note: "handoff: freshness unavailable (legacy note, no recorded state)",
    };
  }

  const flags: string[] = [];
  let ageDays: number | null = null;

  // Age (best-effort).
  if (fm.saved_at) {
    const savedEpoch = Date.parse(fm.saved_at);
    if (!Number.isNaN(savedEpoch)) {
      ageDays = Math.floor((Date.now() - savedEpoch) / 86_400_000);
      let maxAge = opts.maxAgeDays ?? Number(process.env.HANDOFF_MAX_AGE_DAYS ?? 14);
      if (!Number.isInteger(maxAge) || maxAge < 0) maxAge = 14;
      if (ageDays > maxAge) {
        flags.push(
          `note is ${ageDays} days old (>${maxAge}; set HANDOFF_MAX_AGE_DAYS to tune)`,
        );
      }
    }
  }

  if (git(projectDir, "rev-parse", "--git-dir") !== null) {
    const curBranch = git(projectDir, "rev-parse", "--abbrev-ref", "HEAD") ?? "";
    const curHead = git(projectDir, "rev-parse", "HEAD") ?? "";
    if (fm.branch && curBranch && fm.branch !== curBranch) {
      flags.push(`branch moved: note saved on '${fm.branch}', now on '${curBranch}'`);
    }
    if (fm.head && curHead && fm.head !== curHead) {
      // Distinguish "history advanced past the note" from "diverged".
      if (isAncestor(projectDir, fm.head, curHead)) {
        flags.push(
          `HEAD advanced since save (${fm.head.slice(0, 8)}.. -> ${curHead.slice(0, 8)}); 'Recently shipped' may be incomplete`,
        );
      } else {
        flags.push(
          `HEAD diverged from the saved commit (${fm.head.slice(0, 8)} not an ancestor of ${curHead.slice(0, 8)})`,
        );
      }
    }
  }

  // Anvil claims recorded at save: are they still the live picture?
  if (fm.anvil_claims) {
    const live = anvilClaimsLive(projectDir);
    if (live) {
      for (const pair of fm.anvil_claims.split(",")) {
        // Split on the LAST colon: anvil task ids are composite
        // (feature:Txxx), so the id itself contains ':' — only the trailing
        // :phase is ours.
        const task = pair.slice(0, pair.lastIndexOf(":"));
        if (!task || task === "?") continue;
        const present =
          live.includes(`"task_id": "${task}"`) || live.includes(`"task": "${task}"`);
        if (!present) {
          flags.push(`claim on ${task} recorded at save is no longer active (released/expired/applied)`);
        }
      }
    }
  }

  if (flags.length === 0) {
    return {
      available: true,
      fresh: true,
      flags: [],
      ageDays,
      note: "handoff: note is fresh (matches current repo state)",
    };
  }
  return {
    available: true,
    fresh: false,
    flags,
    ageDays,
    note: "handoff: " + flags.map((f) => `STALE - ${f}`).join("; "),
  };
}

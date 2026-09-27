// pi-handoff — note save/read plumbing.
//
// The note is the LIVE resume point: overwrite it in place, don't append
// endlessly. It complements durable memory: memory is for durable
// facts/preferences; the handoff is "where we are right now."
//
// Writes are atomic (tmp + rename, mode 0600) so a crash mid-write can at
// most leave the previous note intact.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { captureMeta } from "./meta.js";
import { noteProse, parseFrontmatter, resolveHandoffPath } from "./path.js";

export interface SavedNote {
  path: string;
  key: string;
  previousProse: string | null;
  bytes: number;
}

/**
 * Save (or refresh) the handoff note for `projectDir`.
 *
 * `prose` is the note body the agent composed (resume steps, open threads,
 * recently shipped, gotchas); `summary` is an optional one-line seed that is
 * placed first. The frontmatter block is regenerated on every save — the
 * caller must NOT carry a previous block forward (stale saved_at/head would
 * stack).
 */
export function saveNote(
  projectDir: string,
  prose: string,
  summary?: string,
): SavedNote {
  const resolved = resolveHandoffPath(projectDir);
  const previous = existsSync(resolved.file)
    ? noteProse(readFileSync(resolved.file, "utf8")).trim()
    : null;

  const bodyParts: string[] = [];
  if (summary && summary.trim()) bodyParts.push(summary.trim());
  if (prose.trim()) bodyParts.push(prose.trim());
  const body = bodyParts.join("\n\n");
  if (!body) {
    throw new Error("nothing to save: pass prose (and/or summary)");
  }

  const doc = `${captureMeta(projectDir)}\n${body}\n`;
  mkdirSync(dirname(resolved.file), { recursive: true, mode: 0o700 });
  const tmp = join(dirname(resolved.file), `handoff.md.tmp.${process.pid}`);
  writeFileSync(tmp, doc, { mode: 0o600 });
  renameSync(tmp, resolved.file);
  return {
    path: resolved.file,
    key: resolved.key,
    previousProse: previous,
    bytes: Buffer.byteLength(doc, "utf8"),
  };
}

export interface NoteRead {
  path: string;
  exists: boolean;
  prose: string | null;
  frontmatter: Record<string, string> | null;
}

/** Read the saved note (prose only; frontmatter is machine metadata). */
export function readNote(projectDir: string): NoteRead {
  const resolved = resolveHandoffPath(projectDir);
  if (!existsSync(resolved.file) || readFileSync(resolved.file, "utf8").trim() === "") {
    return { path: resolved.file, exists: false, prose: null, frontmatter: null };
  }
  const content = readFileSync(resolved.file, "utf8");
  return {
    path: resolved.file,
    exists: true,
    prose: noteProse(content),
    frontmatter: parseFrontmatter(content),
  };
}

// pi-session-retro — path expansion + orchestration.
//
// `expandPaths` is a faithful port of the original `expand_paths`: a Codex
// rollout path expands to every sibling rollout sharing its session_id
// (main + subagent rollouts), canonical-deduped so the same file never
// double-charges. Pi and Claude files pass through unchanged.
//
// The orchestration functions are the tool-facing entry points:
//   runStats / runReport / runHtml  — parse + aggregate + render
//   runList / runFind              — discovery

import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { isCodex, isPi, parse } from "./parse.js";
import { aggregate } from "./aggregate.js";
import { mdToHtml, reportHtml, reportMd } from "./report.js";
import { findSessions, listSessions, sessionFiles } from "./discover.js";

function canon(path: string): string {
  // The original uses normcase+realpath+normpath for cross-platform dedupe.
  try {
    return realpathSync(normalize(path));
  } catch {
    return normalize(path);
  }
}

function codexMeta(path: string): Record<string, unknown> {
  for (const line of readJsonl(path)) {
    if (line.type === "session_meta" && line.payload && typeof line.payload === "object") {
      return line.payload as Record<string, unknown>;
    }
  }
  return {};
}

function* readJsonl(path: string): Generator<Record<string, unknown>> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d && typeof d === "object" && !Array.isArray(d)) yield d as Record<string, unknown>;
    } catch {
      // skip
    }
  }
}

function codexSortKey(path: string): [number, string, string] {
  const meta = codexMeta(path);
  return [
    meta.parent_thread_id ? 1 : 0,
    String(meta.timestamp ?? ""),
    path,
  ];
}

function poolFromDirs(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) out.push(p);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/**
 * Expand Codex rollout paths to all rollouts of the same session.
 * `codexDirs` overrides where sibling rollouts are searched (default:
 * the real ~/.codex/sessions tree); used by tests with fixtures.
 */
export function expandPaths(paths: string[], codexDirs?: string[]): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();
  const candidatePool: string[] =
    codexDirs !== undefined
      ? poolFromDirs(codexDirs)
      : sessionFiles().filter((f) => f.includes("/.codex/sessions/"));
  for (const p of paths) {
    if (seen.has(canon(p))) continue;
    if (!isCodex(p)) {
      seen.add(canon(p));
      expanded.push(p);
      continue;
    }
    const meta = codexMeta(p);
    const sessionId = meta.session_id;
    if (!sessionId) {
      seen.add(canon(p));
      expanded.push(p);
      continue;
    }
    const candidates = new Map<string, string>();
    candidates.set(canon(p), p);
    for (const candidate of candidatePool) {
      if (codexMeta(candidate).session_id === sessionId) {
        candidates.set(canon(candidate), candidate);
      }
    }
    for (const c of [...candidates.values()].sort((a, b) =>
      codexSortKey(a)
        .toString()
        .localeCompare(codexSortKey(b).toString()),
    )) {
      const key = canon(c);
      if (!seen.has(key)) {
        seen.add(key);
        expanded.push(c);
      }
    }
  }
  return expanded;
}

export interface RunOptions {
  narrative?: string; // markdown narrative for the html site
}

function mustExist(paths: string[]): string[] {
  const missing = paths.filter((p) => {
    try {
      return !statSync(p).isFile();
    } catch {
      return true;
    }
  });
  if (missing.length) {
    throw new Error("every requested session must be a readable file: " + JSON.stringify(missing));
  }
  return paths;
}

export function runStats(paths: string[]): string {
  const expanded = expandPaths(mustExist(paths));
  if (!expanded.length) throw new Error("no existing session JSONL paths given");
  const agg = aggregate(expanded.map((p) => parse(p)));
  return JSON.stringify(agg, null, 1);
}

export function runReport(paths: string[]): string {
  const expanded = expandPaths(mustExist(paths));
  if (!expanded.length) throw new Error("no existing session JSONL paths given");
  return reportMd(aggregate(expanded.map((p) => parse(p))));
}

export function runHtml(paths: string[], opts: RunOptions = {}): string {
  const expanded = expandPaths(mustExist(paths));
  if (!expanded.length) throw new Error("no existing session JSONL paths given");
  const agg = aggregate(expanded.map((p) => parse(p)));
  return reportHtml(agg, opts.narrative ? mdToHtml(opts.narrative) : "");
}

export function runList(sub = ""): string {
  return listSessions(sub);
}

export function runFind(keyword: string, sub = ""): string {
  return findSessions(keyword, sub);
}

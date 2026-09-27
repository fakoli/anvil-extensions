// pi-session-retro — session discovery (list / find).
//
// Port of the original `_head` / `_session_files` / `_session_rows` /
// `cmd_list` / `cmd_find`, extended with native Pi session discovery
// (`~/.pi/agent/sessions/**/*.jsonl`) alongside Claude and Codex.
//
// `_head` reads only the top of each file (cheap breadcrumbs: cwd, branch,
// first-ts, topic, runtime) so `list`/`find` stay fast over many sessions.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { textOf } from "./parse.js";

export interface Head {
  cwd: string | null;
  branch: string | null;
  ts: string | null;
  topic: string | null;
  runtime: "pi" | "claude" | "codex";
}

const CODEX_TOP_TYPES = new Set(["session_meta", "turn_context", "response_item", "event_msg"]);

export function sessionBaseDirs(): string[] {
  const home = homedir();
  return [
    join(home, ".pi", "agent", "sessions"),
    join(home, ".claude", "projects"),
    join(home, ".codex", "sessions"),
  ];
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
}

export function sessionFiles(): string[] {
  const out: string[] = [];
  for (const dir of sessionBaseDirs()) walk(dir, out);
  return out;
}

function runtimeOf(path: string): Head["runtime"] {
  if (path.includes("/.pi/agent/sessions/")) return "pi";
  if (path.includes("/.codex/sessions/")) return "codex";
  return "claude";
}

/** Cheap breadcrumbs from the top of a session (ported from `_head`). */
export function head(path: string, maxLines = 800): Head {
  let cwd: string | null = null;
  let branch: string | null = null;
  let ts: string | null = null;
  let topic: string | null = null;
  let runtime: Head["runtime"] = runtimeOf(path);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { cwd, branch, ts, topic, runtime };
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const lines = raw.split("\n");
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (!d || typeof d !== "object") continue;
    ts = ts ?? (d.timestamp != null ? String(d.timestamp) : null);
    if (d.cwd && !cwd) {
      cwd = String(d.cwd);
      branch = (d.gitBranch as string) ?? null;
    }
    const payload =
      d.payload && typeof d.payload === "object" ? (d.payload as Record<string, unknown>) : {};
    if (CODEX_TOP_TYPES.has(String(d.type))) runtime = "codex";
    if (d.type === "session_meta" && payload.cwd && !cwd) cwd = String(payload.cwd);
    if (d.type === "turn_context" && payload.cwd && !cwd) cwd = String(payload.cwd);
    if (d.type === "session" && d.version != null) runtime = "pi"; // pi header (content-based)
    if (d.type === "session" && d.cwd && !cwd) cwd = String(d.cwd); // pi header
    if (
      !topic &&
      payload.type === "message" &&
      payload.role === "user"
    ) {
      const c = textOf(payload.content);
      if (c && !c.trimStart().startsWith("<")) topic = c.replace(/\n/g, " ").trim().slice(0, 72);
    }
    if (!topic && d.type === "user" && typeof d.message === "object" && d.message) {
      const c = (d.message as Record<string, unknown>).content;
      if (typeof c === "string" && !c.trimStart().startsWith("<")) {
        topic = c.replace(/\n/g, " ").trim().slice(0, 72);
      }
    }
    if (!topic && d.type === "message" && typeof d.message === "object" && d.message) {
      // pi: first user message
      const m = d.message as Record<string, unknown>;
      if (m.role === "user") {
        const c = textOf(m.content);
        if (c && !c.trimStart().startsWith("<")) topic = c.replace(/\n/g, " ").trim().slice(0, 72);
      }
    }
    if (cwd && topic) break;
  }
  return { cwd, branch, ts, topic, runtime };
}

export interface SessionRow {
  mtime: string; // "YYYY-MM-DD HH:MM"
  size: number;
  path: string;
  head: Head;
}

function fmtMtime(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function sessionRows(sub = ""): SessionRow[] {
  const rows: SessionRow[] = [];
  const needle = sub.toLowerCase();
  for (const f of sessionFiles()) {
    try {
      const h = head(f);
      const haystack = [f, h.cwd, h.branch, h.topic].map((v) => String(v ?? "")).join(" ").toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      const st = statSync(f);
      rows.push({ mtime: fmtMtime(st.mtimeMs / 1000), size: st.size, path: f, head: h });
    } catch {
      continue;
    }
  }
  return rows;
}

function homeAbbrev(p: string): string {
  return p.replace(homedir(), "~/");
}

/** Port of `cmd_list`: browse sessions, newest last, with breadcrumbs. */
export function listSessions(sub = ""): string {
  const rows = sessionRows(sub);
  const L: string[] = [];
  for (const r of [...rows].sort((a, b) => a.mtime.localeCompare(b.mtime)).slice(-40)) {
    const proj = homeAbbrev(r.head.cwd ?? basename(dirname(r.path))).slice(0, 46);
    L.push(`${r.mtime}  ${r.head.runtime.padEnd(6)}  ${String(Math.floor(r.size / 1024)).padStart(5)}K  ${(r.head.branch ?? "-").padEnd(22)}  ${proj}`);
    if (r.head.topic) L.push(`            -> ${r.head.topic}`);
    L.push(`            ${r.path}`);
  }
  if (rows.length) {
    const newest = [...rows].sort((a, b) => a.mtime.localeCompare(b.mtime)).at(-1)!;
    L.push(`\n# newest (likely the current session):\n${newest.path}`);
  } else {
    L.push(
      `no sessions found${sub ? ` matching ${JSON.stringify(sub)}` : ""} under ${sessionBaseDirs().join(" or ")}`,
    );
  }
  return L.join("\n");
}

/** Port of `cmd_find`: sessions whose content mentions a keyword. */
export function findSessions(keyword: string, sub = ""): string {
  const kw = keyword.toLowerCase();
  const rows: Array<{ mt: string; hits: number; path: string; h: Head }> = [];
  for (const r of sessionRows(sub)) {
    let raw: string;
    try {
      raw = readFileSync(r.path, "utf8");
    } catch {
      continue;
    }
    const lower = raw.toLowerCase();
    let hits = 0;
    let idx = lower.indexOf(kw);
    while (idx !== -1) {
      hits += 1;
      idx = lower.indexOf(kw, idx + kw.length);
    }
    if (hits) rows.push({ mt: r.mtime, hits, path: r.path, h: r.head });
  }
  const L: string[] = [];
  for (const r of rows.sort((a, b) => a.mt.localeCompare(b.mt))) {
    const proj = homeAbbrev(r.h.cwd ?? basename(dirname(r.path))).slice(0, 46);
    L.push(`${r.mt}  ${r.h.runtime.padEnd(6)}  ${String(r.hits).padStart(4)}x  ${(r.h.branch ?? "-").padEnd(22)}  ${proj}`);
    if (r.h.topic) L.push(`            -> ${r.h.topic}`);
    L.push(`            ${r.path}`);
  }
  if (!rows.length) {
    L.push(
      `no sessions mention ${JSON.stringify(keyword)}${sub ? ` (filter ${JSON.stringify(sub)})` : ""}`,
    );
  }
  return L.join("\n");
}

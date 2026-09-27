// pi-session-retro — session JSONL parsers.
//
// Faithful TypeScript port of the original session_stats.py parsers
// (parse_claude, parse_codex) plus a NEW native Pi parser (parse_pi) —
// the capability the original (Claude Code / Codex only) lacked.
//
// Pi session JSONL (session v3):
//   {"type":"session","version":3,"id":...,"timestamp":...,"cwd":...}
//   {"type":"message","message":{"role":"user"|"assistant"|"toolResult",
//     "model":...,"usage":{input,output,cacheRead,cacheWrite,reasoning,
//     totalTokens,cost:{total}},
//     "content": [ {"type":"text"|"thinking"|"toolCall", ...} ]}}
//
// Pi tool blocks use the name `toolCall` (not Claude's `tool_use`);
// subagent dispatches arrive as `subagent` toolCalls, and tool outputs
// are separate `toolResult` records.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { baseStats, bump, type SessionStats, type WorkflowRun } from "./types.js";

// ---------------------------------------------------------------------------
// shared helpers (ported from the original)
// ---------------------------------------------------------------------------

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string") {
          const t = (c as { type?: string }).type;
          if (t === "text" || t === "input_text" || t === "output_text")
            return (c as { text: string }).text;
        }
        return null;
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function* jsonl(path: string): Generator<Record<string, unknown>> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  // utf-8-sig equivalent: strip a leading BOM
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec && typeof rec === "object" && !Array.isArray(rec)) {
        yield rec as Record<string, unknown>;
      }
    } catch {
      // skip malformed lines, as the original does
    }
  }
}

const CODEX_TOP_TYPES = new Set(["session_meta", "turn_context", "response_item", "event_msg"]);

export function isCodex(path: string): boolean {
  for (const d of jsonl(path)) {
    if (CODEX_TOP_TYPES.has(String(d.type))) return true;
    if (d.message) return false;
  }
  return false;
}

/**
 * Content-based Pi detection: a Pi session starts with a
 * `{"type":"session","version":N,...}` header record. Works for any path
 * (the original path-based check only matches the real ~/.pi tree).
 */
export function isPi(path: string): boolean {
  for (const d of jsonl(path)) {
    if (d.type === "session" && d.version != null) return true;
    if (d.type === "message") return false; // message records without a pi header: not pi
    if (d.type || d.payload) return false;
  }
  return false;
}

function codexKind(text: string, agentType = ""): string {
  const t = (text || "").toLowerCase();
  if (t.includes("adversarial")) return "review";
  if (t.includes("critic") || t.includes("review") || agentType === "explorer") return "review";
  if (t.includes("fix") || t.includes("apply")) return "apply-fixes";
  if (t.includes("implement") || t.includes("working in")) return "task-cycle";
  return "other";
}

function codexPromptSummary(text: string): string {
  const clean = (text || "").split(/\s+/).join(" ").trim();
  return clean.slice(0, 90);
}

export function looksEncrypted(text: string | null | undefined): boolean {
  return /^gAAAA[A-Za-z0-9_\-=]{16,}$/.test((text || "").trim());
}

function agentLabel(d: Record<string, unknown>): string {
  let label = String(d.agent_nickname ?? d.nickname ?? "");
  if (!label && d.agent_path) label = basename(String(d.agent_path));
  return label;
}

function wfRef(inp: Record<string, unknown>): string {
  let base: string;
  if (inp.name) base = String(inp.name);
  else if (inp.scriptPath) base = basename(String(inp.scriptPath));
  else if (inp.script) {
    const m = String(inp.script).match(/name:\s*['"]([^'"]+)['"]/);
    base = m ? m[1] : "inline";
  } else base = "?";
  base = base.replace("inline:", "");
  base = base.replace(/-wf_[a-z0-9-]+\.(js|json)$/, "");
  return base.replace(/\.(js|json)$/, "");
}

// ---------------------------------------------------------------------------
// Pi parser (native — the new capability)
// ---------------------------------------------------------------------------

function parsePi(path: string): SessionStats {
  const s = baseStats(path, "pi");
  let firstUser: string | null = null;
  for (const d of jsonl(path)) {
    const ts = d.timestamp != null ? String(d.timestamp) : null;
    if (ts) {
      s.ts_first = s.ts_first ?? ts;
      s.ts_last = ts;
    }
    if (d.type === "session") {
      s.session_id = (d.id as string) ?? null;
      if (d.cwd) s.cwd = String(d.cwd);
      continue;
    }
    if (d.type !== "message") continue;
    const m = (d.message ?? {}) as Record<string, unknown>;
    const role = String(m.role ?? "");
    const content = m.content;
    if (role === "assistant") {
      s.asst += 1;
      const u = (m.usage ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      const reasoning = num(u.reasoning);
      s.out += num(u.output) + reasoning; // generated output incl. reasoning, as totalTokens implies
      s.inp += num(u.input);
      s.cc += num(u.cacheWrite);
      s.cr += num(u.cacheRead);
      s.reasoning_tokens = (s.reasoning_tokens ?? 0) + reasoning;
      const cost = ((u.cost ?? {}) as Record<string, unknown>).total;
      if (typeof cost === "number") s.cost_total = (s.cost_total ?? 0) + cost;
      if (typeof m.model === "string") (s.models ??= new Set()).add(m.model);
      if (ts) s.events.push([ts, num(u.output) + reasoning]);
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (!b || typeof b !== "object") continue;
          if (b.type === "toolCall" && typeof b.name === "string") {
            bump(s.tools, b.name);
            const inp = (b.arguments ?? {}) as Record<string, unknown>;
            if (b.name === "Skill") bump(s.skills, String(inp.skill ?? "?"));
            else if (b.name === "subagent" || b.name === "Agent") {
              const agentType = String(inp.agent ?? inp.subagent_type ?? "general-purpose");
              bump(s.agent_types, agentType);
              const label = agentLabel(inp) || agentType;
              bump(s.wf_named, (String(inp.label ?? label).split(":")[0] || "subagent").slice(0, 34));
              s.workflows.push({
                summary: label,
                agents: 1,
                tokens: null,
                tool_uses: null,
                ms: 0,
                kind: codexKind(String(inp.task ?? "") , agentType),
              } satisfies WorkflowRun);
              if (ts) s.wf_ts.push(ts);
            }
          }
        }
      }
    } else if (role === "user") {
      const txt = textOf(content).trim();
      if (
        txt &&
        !txt.startsWith("<") &&
        !looksEncrypted(txt)
      ) {
        const clean = txt.replace(/\n/g, " ").trim();
        s.user_turns.push(clean.slice(0, 140));
        if (firstUser === null) firstUser = clean;
      }
    }
    // toolResult records: outputs of tool calls; no additive counters,
    // mirroring the original (which counts tool_use, not tool_result).
  }
  s.prompt_summary = codexPromptSummary(firstUser ?? "");
  if (s.ts_first && s.ts_last) {
    const a = Date.parse(s.ts_first);
    const b = Date.parse(s.ts_last);
    if (!Number.isNaN(a) && !Number.isNaN(b)) s.duration_ms = Math.max(0, b - a);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Claude Code parser (ported)
// ---------------------------------------------------------------------------

function parseClaude(path: string): SessionStats {
  const s = baseStats(path, "claude");
  for (const d of jsonl(path)) {
    const ts = d.timestamp != null ? String(d.timestamp) : null;
    if (ts) {
      s.ts_first = s.ts_first ?? ts;
      s.ts_last = ts;
    }
    if (d.cwd && !s.cwd) {
      s.cwd = String(d.cwd);
      s.branch = (d.gitBranch as string) ?? null;
    }
    const m = (d.message ?? null) as Record<string, unknown> | null;
    if (!m || typeof m !== "object") continue;
    if (d.type === "assistant") {
      const u = (m.usage ?? {}) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" ? v : 0);
      s.out += num(u.output_tokens);
      s.inp += num(u.input_tokens);
      s.cc += num(u.cache_creation_input_tokens);
      s.cr += num(u.cache_read_input_tokens);
      s.asst += 1;
      if (ts) s.events.push([ts, num(u.output_tokens)]);
      for (const c of (m.content ?? []) as unknown[]) {
        const b = c as Record<string, unknown>;
        if (!b || typeof b !== "object" || b.type !== "tool_use") continue;
        const nm = String(b.name ?? "?");
        bump(s.tools, nm);
        const inp = (b.input ?? {}) as Record<string, unknown>;
        if (nm === "Skill") bump(s.skills, String(inp.skill ?? "?"));
        else if (nm === "Agent")
          bump(s.agent_types, String(inp.subagent_type ?? "general-purpose"));
        else if (nm === "Workflow") {
          bump(s.wf_named, wfRef(inp));
          if (ts) s.wf_ts.push(ts);
        }
      }
    } else if (d.type === "user") {
      const txt = textOf(m.content);
      if (txt.includes("<usage>") || txt.includes("<task-notification>")) {
        const g = (p: string) => {
          const re = new RegExp(p, "s");
          const mm = txt.match(re);
          return mm ? mm[1] : null;
        };
        s.workflows.push({
          summary: (g("<summary>(.*?)</summary>") ?? "").trim().slice(0, 90),
          agents: Number(g("<agent_count>(\\d+)") ?? 0) || 0,
          tokens: Number(g("<subagent_tokens>(\\d+)") ?? 0) || 0,
          tool_uses: Number(g("<tool_uses>(\\d+)") ?? 0) || 0,
          ms: Number(g("<duration_ms>(\\d+)") ?? 0) || 0,
        });
      } else if (typeof m.content === "string" && !m.content.trimStart().startsWith("<")) {
        s.user_turns.push(m.content.replace(/\n/g, " ").trim().slice(0, 140));
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Codex parser (ported)
// ---------------------------------------------------------------------------

function parseCodex(path: string): SessionStats {
  const s = baseStats(path, "codex");
  const tokenTotals: Array<Record<string, unknown>> = [];
  let firstUser: string | null = null;
  for (const d of jsonl(path)) {
    const ts = d.timestamp != null ? String(d.timestamp) : null;
    if (ts) {
      s.ts_first = s.ts_first ?? ts;
      s.ts_last = ts;
    }
    const topType = String(d.type ?? "");
    const payload =
      d.payload && typeof d.payload === "object" && !Array.isArray(d.payload)
        ? (d.payload as Record<string, unknown>)
        : {};

    if (topType === "session_meta") {
      s.meta_count += 1;
      if (payload.cwd) s.cwd = s.cwd ?? String(payload.cwd);
      // Only the FIRST session_meta record is this rollout's own identity.
      if (s.meta_count === 1) {
        s.session_id = (payload.session_id as string) ?? null;
        s.id = (payload.id as string) ?? null;
        s.parent_thread_id = (payload.parent_thread_id as string) ?? null;
        const src = payload.source;
        const srcObj = src && typeof src === "object" && !Array.isArray(src) ? (src as Record<string, unknown>) : null;
        const subSrc = srcObj ? (srcObj.subagent ?? null) : null; // the original checks src.get("subagent")
        s.codex_is_subagent = Boolean(payload.parent_thread_id || subSrc);
        if (subSrc && typeof subSrc === "object") {
          const spawn = subSrc.thread_spawn;
          const sp = spawn && typeof spawn === "object" ? (spawn as Record<string, unknown>) : {};
          s.agent_nickname = (sp.agent_nickname as string) ?? (sp.nickname as string) ?? null;
          s.agent_path = (sp.agent_path as string) ?? null;
        }
      } else if (payload.id === s.id) {
        s.meta_same_id_repeats += 1;
      } else {
        s.meta_foreign_ids += 1;
      }
    } else if (topType === "turn_context") {
      if (payload.cwd) s.cwd = s.cwd ?? String(payload.cwd);
    }

    const ptype = String(payload.type ?? "");
    if (ptype === "message") {
      const role = String(payload.role ?? "");
      const text = textOf(payload.content).trim();
      if (role === "assistant") {
        s.asst += 1;
      } else if (role === "user" && text && !text.startsWith("<") && !looksEncrypted(text)) {
        const clean = text.replace(/\n/g, " ").trim();
        s.user_turns.push(clean.slice(0, 140));
        if (firstUser === null) firstUser = clean;
      }
    } else if (ptype === "function_call") {
      const name = String(payload.name ?? "?");
      bump(s.tools, name);
      if (name === "spawn_agent") {
        let inp: Record<string, unknown> = {};
        try {
          inp = JSON.parse(String(payload.arguments ?? "{}"));
        } catch {
          inp = {};
        }
        let prompt = String(inp.message ?? "");
        if (looksEncrypted(prompt)) prompt = "";
        const agentType = String(inp.agent_type ?? "default");
        const label = agentLabel(inp);
        const kind = codexKind(prompt || label, agentType);
        const summary =
          codexPromptSummary(prompt) || label || `${agentType} subagent`;
        s.workflows.push({
          summary,
          agents: 1,
          tokens: null,
          tool_uses: null,
          ms: 0,
          kind,
          codex_spawn: true,
          agent_type: agentType,
        });
        bump(s.agent_types, agentType);
        bump(s.wf_named, (summary.split(":")[0] || kind).slice(0, 34));
        if (ts) s.wf_ts.push(ts);
      }
    } else if (ptype === "custom_tool_call") {
      bump(s.tools, String(payload.name ?? "custom_tool_call"));
    } else if (ptype === "mcp_tool_call_end") {
      bump(s.tools, String(payload.tool_name ?? "mcp_tool"));
    } else if (ptype === "token_count") {
      tokenTotals.push((payload.info as Record<string, unknown>)?.total_token_usage as Record<string, unknown> ?? {});
      const last = ((payload.info as Record<string, unknown>)?.last_token_usage ?? {}) as Record<string, unknown>;
      if (ts) {
        s.events.push([
          ts,
          Number(last.output_tokens ?? 0) + Number(last.reasoning_output_tokens ?? 0),
        ]);
      }
    } else if (ptype === "task_complete") {
      s.duration_ms = Math.max(s.duration_ms, Number(payload.duration_ms ?? 0) || 0);
    }
  }

  const usage = tokenTotals.length ? (tokenTotals[tokenTotals.length - 1] ?? {}) : {};
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  s.out = num(usage.output_tokens) + num(usage.reasoning_output_tokens);
  s.inp = num(usage.input_tokens);
  s.cr = num(usage.cached_input_tokens);
  s.prompt_summary = codexPromptSummary(firstUser ?? "");
  // Forked only when a LATER session_meta carries a FOREIGN id.
  s.codex_forked = s.meta_foreign_ids > 0;
  return s;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export function parse(path: string): SessionStats {
  if (isCodex(path)) return parseCodex(path);
  if (isPi(path) || path.includes("/.pi/agent/sessions/")) return parsePi(path);
  // A Pi session file is plain message JSONL, so the codex probe above is
  // what discriminates codex; pi is detected by its session header.
  return parseClaude(path);
}

/** Parse a Pi session explicitly (used by discovery, which knows the dir). */
export function parseByRuntime(path: string, runtime: SessionStats["runtime"]): SessionStats {
  if (runtime === "pi") return parsePi(path);
  if (runtime === "codex") return parseCodex(path);
  return parseClaude(path);
}

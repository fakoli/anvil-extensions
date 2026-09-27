// pi-session-retro — shared types.
//
// The per-session stats shape mirrors the original session_stats.py
// `_base_stats` dict field-for-field so aggregate() and the report
// renderers are faithful ports. Counters are plain objects (Counter
// stand-ins).

export type ToolCounter = Record<string, number>;

export interface WorkflowRun {
  summary: string;
  agents: number;
  tokens: number | null;
  tool_uses: number | null;
  ms: number;
  kind?: string;
  codex_spawn?: boolean;
  agent_type?: string;
}

export interface SessionStats {
  path: string;
  runtime: "pi" | "claude" | "codex";
  out: number;
  inp: number;
  cc: number; // cache creation
  cr: number; // cache read
  asst: number; // assistant turns
  user_turns: string[];
  tools: ToolCounter;
  workflows: WorkflowRun[];
  ts_first: string | null;
  ts_last: string | null;
  cwd: string | null;
  branch: string | null;
  skills: ToolCounter;
  agent_types: ToolCounter;
  wf_named: ToolCounter;
  events: Array<[string, number]>; // [ts iso, output tokens that turn]
  wf_ts: string[];
  session_id: string | null;
  id: string | null;
  parent_thread_id: string | null;
  codex_is_subagent: boolean;
  codex_forked: boolean;
  meta_count: number;
  meta_same_id_repeats: number;
  meta_foreign_ids: number;
  agent_nickname: string | null;
  agent_path: string | null;
  duration_ms: number;
  prompt_summary: string;
  // pi-only extras (ignored by the shared aggregate)
  cost_total?: number;
  models?: Set<string>;
  reasoning_tokens?: number;
}

export function baseStats(path: string, runtime: SessionStats["runtime"]): SessionStats {
  return {
    path,
    runtime,
    out: 0,
    inp: 0,
    cc: 0,
    cr: 0,
    asst: 0,
    user_turns: [],
    tools: {},
    workflows: [],
    ts_first: null,
    ts_last: null,
    cwd: null,
    branch: null,
    skills: {},
    agent_types: {},
    wf_named: {},
    events: [],
    wf_ts: [],
    session_id: null,
    id: null,
    parent_thread_id: null,
    codex_is_subagent: false,
    codex_forked: false,
    meta_count: 0,
    meta_same_id_repeats: 0,
    meta_foreign_ids: 0,
    agent_nickname: null,
    agent_path: null,
    duration_ms: 0,
    prompt_summary: "",
  };
}

export function bump(c: ToolCounter, key: string, by = 1): void {
  c[key] = (c[key] ?? 0) + by;
}

export function sumCounter(c: ToolCounter): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

// pi-session-retro — aggregation.
//
// Faithful port of the original `aggregate()`: rolls one or more parsed
// sessions into a flat summary, pairing Codex spawn records with their
// subagent rollouts and excluding forked/replayed rollouts from every
// additive sum (the double-counting guard the original exists for).
//
// Pi sessions carry no subagent rollouts, so they flow through the same
// non-codex path as Claude sessions.

import { basename } from "node:path";
import {
  type SessionStats,
  type WorkflowRun,
  sumCounter,
} from "./types.js";

export interface Aggregate {
  sessions: string[];
  cwd: string | null;
  branch: string | null;
  wall_hours: number;
  assistant_turns: number;
  user_turns: number;
  runtimes: string[];
  main_output_tokens: number;
  fresh_input_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  workflows: number;
  workflow_agents: number;
  workflow_tokens: number;
  workflow_tokens_available: boolean;
  tools: Record<string, number>;
  user_turn_text: string[];
  measurement_notes: string[];
  skills_used: Record<string, number>;
  agent_types: Record<string, number>;
  workflows_named: Record<string, number>;
  timeline: Array<{ hour: string; out: number; wf: number }>;
  workflow_by_type: Record<
    string,
    { runs: number; agents: number; tokens: number | null; unknown_runs: number; minutes: number }
  >;
  workflow_runs: WorkflowRun[];
  generative_total: number;
}

function hoursIso(a: string | null, b: string | null): number {
  if (!a || !b) return 0.0;
  const fa = Date.parse(a);
  const fb = Date.parse(b);
  if (Number.isNaN(fa) || Number.isNaN(fb)) return 0.0;
  return Math.round(((fb - fa) / 3_600_000) * 10) / 10;
}

function durationMs(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const fa = Date.parse(a);
  const fb = Date.parse(b);
  if (Number.isNaN(fa) || Number.isNaN(fb)) return 0;
  return Math.max(0, fb - fa);
}

function agentLabel(s: SessionStats): string {
  return s.agent_nickname || (s.agent_path ? basename(s.agent_path) : "");
}

function wfKind(summary: string): string {
  const t = (summary || "").toLowerCase();
  if (t.includes("implement") && t.includes("verify")) return "task-cycle";
  if (t.includes("review") || t.includes("adversarial")) return "review";
  if (t.includes("apply") || t.includes("fix")) return "apply-fixes";
  return "other";
}

// subagent-type inference for pi/claude subagent tool calls (mirrors the
// original's codex kind heuristics)
function kindOf(summary: string, agentType = ""): string {
  const t = (summary || "").toLowerCase();
  if (t.includes("adversarial")) return "review";
  if (t.includes("critic") || t.includes("review") || agentType === "explorer") return "review";
  if (t.includes("fix") || t.includes("apply")) return "apply-fixes";
  if (t.includes("implement") || t.includes("working in")) return "task-cycle";
  return "other";
}

export function aggregate(sessions: SessionStats[]): Aggregate {
  const codexSubagents = sessions.filter(
    (s) => s.runtime === "codex" && s.codex_is_subagent && !s.codex_forked,
  );
  const codexMains = sessions.filter(
    (s) => s.runtime === "codex" && !s.codex_is_subagent,
  );
  const nonCodex = sessions.filter((s) => s.runtime !== "codex");

  const workflowRuns: WorkflowRun[] = [];
  for (const s of sessions) {
    if (s.runtime !== "codex") workflowRuns.push(...s.workflows);
  }

  const spawnWorkflows = codexMains
    .filter((s) => !s.codex_forked)
    .flatMap((s) => s.workflows.filter((w) => w.codex_spawn));

  for (let idx = 0; idx < codexSubagents.length; idx++) {
    const sub = codexSubagents[idx];
    const prompt = sub.prompt_summary || (sub.user_turns[0] ?? "");
    const label = agentLabel(sub);
    const spawn = idx < spawnWorkflows.length ? spawnWorkflows[idx] : ({} as WorkflowRun);
    const summary =
      (spawn as WorkflowRun).summary || label || prompt || basename(sub.path);
    const kind =
      (spawn as WorkflowRun).kind || kindOf(prompt || label, String((spawn as WorkflowRun).agent_type ?? ""));
    const ms = sub.duration_ms || durationMs(sub.ts_first, sub.ts_last);
    const forked = sub.codex_forked;
    workflowRuns.push({
      summary,
      agents: 1,
      // A forked rollout's cumulative totals include the replayed parent
      // history — report as unavailable (null), never 0 or the parent's.
      tokens: forked ? null : sub.out,
      tool_uses: forked ? null : sumCounter(sub.tools),
      ms,
      kind,
    });
  }
  for (const spawn of spawnWorkflows.slice(codexSubagents.length)) {
    workflowRuns.push({
      summary: spawn.summary ?? "",
      agents: spawn.agents ?? 1,
      tokens: spawn.tokens ?? null,
      tool_uses: spawn.tool_uses ?? null,
      ms: 0,
      kind: spawn.kind ?? "other",
    });
  }

  const unknownWfRuns = workflowRuns.filter((w) => w.tokens === null).length;
  const workflowTokens = workflowRuns.reduce(
    (a, w) => a + (w.tokens ?? 0),
    0,
  );
  const workflowTokensAvailable = unknownWfRuns === 0;

  // Forked rollouts replay another rollout's history: exclude them from
  // EVERY additive sum.
  const counted = sessions.filter((s) => !s.codex_forked);
  const mainOutputTokens = nonCodex
    .concat(codexMains)
    .filter((s) => !s.codex_forked)
    .reduce((a, s) => a + s.out, 0);
  const humanSessions = nonCodex
    .concat(codexMains)
    .filter((s) => !s.codex_forked);

  const tools: Record<string, number> = {};
  for (const s of counted) {
    for (const [k, v] of Object.entries(s.tools)) tools[k] = (tools[k] ?? 0) + v;
  }
  const sortedTools = Object.fromEntries(
    Object.entries(tools).sort((a, b) => b[1] - a[1]),
  );

  const notes: string[] = [];
  if (unknownWfRuns) {
    notes.push(
      `delegated token totals are unavailable for ${unknownWfRuns} of ${workflowRuns.length} workflow runs in this log format`,
    );
  }
  const forkedCount = sessions.filter((s) => s.codex_forked).length;
  const sameIdRepeats = sessions.reduce((a, s) => a + s.meta_same_id_repeats, 0);
  const foreignIdRecords = sessions.reduce((a, s) => a + s.meta_foreign_ids, 0);
  if (sameIdRepeats) {
    notes.push(
      `${sameIdRepeats} same-ID resume metadata record(s) observed across the rollout(s) (counted once each, not excluded)`,
    );
  }
  if (forkedCount) {
    notes.push(
      `${foreignIdRecords} foreign-ID replay metadata record(s) across ${forkedCount} rollout(s) (excluded); their cumulative totals are excluded from token, tool, and turn sums`,
    );
  }

  const skillsUsed: Record<string, number> = {};
  for (const s of counted) {
    for (const [k, v] of Object.entries(s.skills)) skillsUsed[k] = (skillsUsed[k] ?? 0) + v;
  }
  const agentTypes: Record<string, number> = {};
  for (const s of counted) {
    for (const [k, v] of Object.entries(s.agent_types))
      agentTypes[k] = (agentTypes[k] ?? 0) + v;
  }
  const wfNamed: Record<string, number> = {};
  for (const s of counted) {
    for (const [k, v] of Object.entries(s.wf_named)) wfNamed[k] = (wfNamed[k] ?? 0) + v;
  }

  // activity timeline: hourly buckets of output tokens + workflow dispatches
  const tl = new Map<string, [number, number]>();
  for (const s of counted) {
    for (const [ets, outT] of s.events) {
      const k = ets.slice(0, 13);
      const cur = tl.get(k) ?? [0, 0];
      cur[0] += outT;
      tl.set(k, cur);
    }
    for (const wts of s.wf_ts) {
      const k = wts.slice(0, 13);
      const cur = tl.get(k) ?? [0, 0];
      cur[1] += 1;
      tl.set(k, cur);
    }
  }
  const timeline = [...tl.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({
      hour: k.slice(5).replace("T", " ") + ":00", // "09-26 08:00"
      out: v[0],
      wf: v[1],
    }));

  // workflow taxonomy by kind
  const by = new Map<string, [number, number, number, number, number]>();
  const runs: WorkflowRun[] = [];
  for (const w of workflowRuns) {
    let k = wfKind(w.summary);
    if (w.kind) k = w.kind;
    const cur = by.get(k) ?? [0, 0, 0, 0, 0];
    cur[0] += 1;
    cur[1] += w.agents;
    cur[3] += w.ms;
    if (w.tokens === null) cur[4] += 1;
    else cur[2] += w.tokens;
    by.set(k, cur);
    runs.push({ ...w, kind: k });
  }
  const workflowByType: Aggregate["workflow_by_type"] = {};
  for (const [k, v] of [...by.entries()].sort((a, b) => b[1][2] - a[1][2])) {
    workflowByType[k] = {
      runs: v[0],
      agents: v[1],
      tokens: v[4] && !v[2] ? null : v[2],
      unknown_runs: v[4],
      minutes: Math.round(v[3] / 60000) / 10,
    };
  }

  const firstTs = sessions
    .map((s) => s.ts_first)
    .filter((v): v is string => Boolean(v))
    .sort()[0] ?? null;
  const lastTs = sessions
    .map((s) => s.ts_last)
    .filter((v): v is string => Boolean(v))
    .sort()
    .reverse()[0] ?? null;

  const out: Aggregate = {
    sessions: sessions.map((s) => s.path),
    cwd: sessions.find((s) => s.cwd)?.cwd ?? null,
    branch: sessions.find((s) => s.branch)?.branch ?? null,
    wall_hours: firstTs && lastTs ? hoursIso(firstTs, lastTs) : 0.0,
    assistant_turns: counted.reduce((a, s) => a + s.asst, 0),
    user_turns: humanSessions.reduce((a, s) => a + s.user_turns.length, 0),
    runtimes: [...new Set(sessions.map((s) => s.runtime))].sort(),
    main_output_tokens: mainOutputTokens,
    fresh_input_tokens: counted.reduce((a, s) => a + s.inp, 0),
    cache_creation_tokens: counted.reduce((a, s) => a + s.cc, 0),
    cache_read_tokens: counted.reduce((a, s) => a + s.cr, 0),
    workflows: workflowRuns.length,
    workflow_agents: workflowRuns.reduce((a, w) => a + w.agents, 0),
    workflow_tokens: workflowTokens,
    workflow_tokens_available: workflowTokensAvailable,
    tools: sortedTools,
    user_turn_text: humanSessions.flatMap((s) => s.user_turns),
    measurement_notes: notes,
    skills_used: Object.fromEntries(
      Object.entries(skillsUsed).sort((a, b) => b[1] - a[1]),
    ),
    agent_types: Object.fromEntries(
      Object.entries(agentTypes).sort((a, b) => b[1] - a[1]),
    ),
    workflows_named: Object.fromEntries(
      Object.entries(wfNamed).sort((a, b) => b[1] - a[1]),
    ),
    timeline,
    workflow_by_type: workflowByType,
    workflow_runs: [...runs].sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0)),
    generative_total: 0, // set below
  };
  out.generative_total = out.main_output_tokens + out.workflow_tokens;

  // Integrity guard: if the sources had activity but the aggregate is all
  // zero, every rollout was silently excluded — say so, don't pass it off.
  const hadSourceEvents = sessions.some(
    (s) =>
      s.asst ||
      s.user_turns.length ||
      sumCounter(s.tools) ||
      s.out ||
      s.inp,
  );
  const aggregateIsAllZero =
    out.assistant_turns === 0 &&
    out.user_turns === 0 &&
    Object.values(out.tools).reduce((a, b) => a + b, 0) === 0 &&
    out.generative_total === 0 &&
    out.fresh_input_tokens === 0;
  if (hadSourceEvents && aggregateIsAllZero) {
    out.measurement_notes.unshift(
      "INTEGRITY WARNING: every headline metric is zero even though the " +
        "parsed rollout(s) contained user/assistant/tool/token events — " +
        "every rollout was excluded from aggregation rather than this " +
        "being a genuinely empty session; treat this report as unreliable",
    );
  }
  return out;
}

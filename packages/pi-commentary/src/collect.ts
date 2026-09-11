// pi-commentary — bounded observation collection from the session branch.
// Pure functions, no I/O. The payload must stay small and stay OUT of the
// model-visible conversation (it only feeds the commentary call).

/** One condensed turn observation. */
export interface TurnDigest {
  role: "user" | "assistant";
  text: string;
  /** Number of tool calls observed in this entry (assistant side only). */
  toolCalls: number;
  /** Compact tool-name summary for this span, e.g. "bash×2, edit×1". */
  tools?: string;
  /** Bounded error signatures observed in this span, "; "-joined. */
  errors?: string;
}

/** Activity counts since the last commentary, kept separately from text. */
export interface ActivityCounts {
  toolCalls: number;
  edits: number;
  failures: number;
  /** Text chars in user/assistant messages across the slice — conversational evidence for eligibility. */
  messageChars: number;
}

export const EMPTY_COUNTS: ActivityCounts = { toolCalls: 0, edits: 0, failures: 0, messageChars: 0 };

function entryRole(entry: Record<string, unknown>): "user" | "assistant" | null {
  // Session entries wrap the message under `message`; some shapes carry it flat.
  const message = (entry.message ?? entry) as Record<string, unknown>;
  const role = message.role;
  if (role === "user" || role === "assistant") return role;
  return null;
}

function textOf(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c && c.type === "text" && typeof c.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function toolCallCount(message: Record<string, unknown>): number {
  const content = message.content;
  if (!Array.isArray(content)) return 0;
  return content.filter((c: any) => c && (c.type === "toolCall" || c.type === "tool_use" || c.type === "toolcall")).length;
}

/** Compact "name×N, …" summary of tool calls in a message (≤4 distinct names). */
function toolNameSummary(message: Record<string, unknown>): string {
  const content = message.content;
  if (!Array.isArray(content)) return "";
  const tally = new Map<string, number>();
  for (const c of content as any[]) {
    if (!c) continue;
    const isCall = c.type === "toolCall" || c.type === "tool_use" || c.type === "toolcall";
    if (!isCall) continue;
    const name = typeof c.name === "string" ? c.name : typeof c.toolName === "string" ? c.toolName : "tool";
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const names = [...tally.entries()].slice(0, 4).map(([n, k]) => (k > 1 ? `${n}×${k}` : n));
  const extra = tally.size > 4 ? `, +${tally.size - 4} more` : "";
  return names.join(", ") + extra;
}

/** Bounded error signature from a failed toolResult entry, else null. */
function errorSignature(entry: Record<string, unknown>): string | null {
  const message = (entry.message ?? entry) as Record<string, unknown>;
  if (message.isError !== true && message.error === undefined) return null;
  let raw: unknown = message.error;
  if (typeof raw !== "string" || raw.length === 0) {
    raw = textOf(message);
  }
  if (typeof raw !== "string" || raw.trim().length === 0) return "unknown error";
  const sig = raw.trim().replace(/\s+/g, " ");
  return sig.length > 120 ? sig.slice(0, 117) + "…" : sig;
}

/** Classify a branch entry for counting: edit-ish tool or failure. */
export function classifyEntry(entry: Record<string, unknown>): { tool: boolean; edit: boolean; failure: boolean } {
  const message = (entry.message ?? entry) as Record<string, unknown>;
  const content = message.content;
  if (!Array.isArray(content)) return { tool: false, edit: false, failure: false };
  let tool = false;
  let edit = false;
  let failure = false;
  for (const c of content as any[]) {
    if (!c) continue;
    const isCall = c.type === "toolCall" || c.type === "tool_use" || c.type === "toolcall";
    if (!isCall) continue;
    tool = true;
    const name = typeof c.name === "string" ? c.name : (c.toolName as string | undefined);
    if (name === "edit" || name === "write") edit = true;
    const result = c.result;
    if (result && typeof result === "object" && (result as any).isError === true) failure = true;
    if (c.isError === true) failure = true;
  }
  return { tool, edit, failure };
}

/**
 * Collect the last `maxTurns` user/assistant turns as bounded digests,
 * oldest-first. Text is trimmed per-entry and then overall to `maxChars`.
 */
export function collectTurns(
  branch: Array<Record<string, unknown>>,
  options: { maxTurns: number; maxChars: number }
): TurnDigest[] {
  const digests: TurnDigest[] = [];
  // Evidence accumulated between message entries (toolResult entries and
  // assistant tool blocks land between them in pi's branch shape) is attached
  // to the NEXT digest so the model sees which span it belongs to.
  let pendingTools: string[] = [];
  let pendingErrors: string[] = [];
  const pushDigest = (role: "user" | "assistant", text: string, toolCalls: number) => {
    const digest: TurnDigest = { role, text, toolCalls };
    if (pendingTools.length > 0) digest.tools = pendingTools.slice(0, 4).join(", ") + (pendingTools.length > 4 ? `, +${pendingTools.length - 4} more` : "");
    if (pendingErrors.length > 0) digest.errors = pendingErrors.slice(0, 2).join("; ") + (pendingErrors.length > 2 ? "; +more" : "");
    pendingTools = [];
    pendingErrors = [];
    digests.push(digest);
  };
  for (const entry of branch) {
    const message = (entry.message ?? entry) as Record<string, unknown>;
    if (message.role === "toolResult" || entry.type === "toolResult") {
      const sig = errorSignature(entry);
      if (sig) pendingErrors.push(sig);
      continue;
    }
    if (entry.type !== undefined && entry.type !== "message") continue;
    const role = entryRole(entry);
    if (!role) continue;
    const text = textOf(message).trim();
    const toolCalls = toolCallCount(message);
    if (!text && toolCalls === 0) continue;
    const tools = toolNameSummary(message);
    if (tools) pendingTools.push(tools);
    pushDigest(role, text.slice(-1200), toolCalls);
  }

  const tail = digests.slice(-options.maxTurns);
  // Drop leading text-less digests to center the payload on substance.
  while (tail.length > 1 && !tail[0].text) tail.shift();

  let total = 0;
  const out: TurnDigest[] = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const d = tail[i];
    // Hard cap: even the first (newest) digest is truncated to the budget —
    // maxChars is a contract, not a soft target.
    const room = out.length === 0 ? options.maxChars : options.maxChars - total;
    if (room <= 0) break;
    const text = d.text.length > room ? d.text.slice(d.text.length - room) : d.text;
    const digest: TurnDigest = { role: d.role, text, toolCalls: d.toolCalls };
    if (d.tools) digest.tools = d.tools;
    if (d.errors) digest.errors = d.errors;
    total += text.length;
    out.unshift(digest);
  }
  return out;
}

/** Count activity across the full branch (cheap pass, per-call counting).
 * Failed calls are detected primarily from separate toolResult entries
 * (pi's real shape); results attached directly to the assistant toolCall
 * block are kept as a defensive fallback. */
export function countActivity(branch: Array<Record<string, unknown>>): ActivityCounts {
  const counts: ActivityCounts = { toolCalls: 0, edits: 0, failures: 0, messageChars: 0 };
  for (const entry of branch) {
    const message = (entry.message ?? entry) as Record<string, unknown>;
    const role = message.role;
    if (role === "toolResult") {
      if (message.isError === true) counts.failures += 1;
      continue;
    }
    if (role === "user" || role === "assistant") {
      counts.messageChars += textOf(message).trim().length;
    }
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content as any[]) {
      if (!c) continue;
      const isCall = c.type === "toolCall" || c.type === "tool_use" || c.type === "toolcall";
      if (!isCall) continue;
      counts.toolCalls += 1;
      const name = typeof c.name === "string" ? c.name : (c.toolName as string | undefined);
      if (name === "edit" || name === "write") counts.edits += 1;
      const result = c.result;
      if ((result && typeof result === "object" && (result as any).isError === true) || c.isError === true) {
        counts.failures += 1;
      }
    }
  }
  return counts;
}

/** Serialize digests + counts into the commentary user-message (hard-capped). */
export function renderObservation(turns: TurnDigest[], counts: ActivityCounts, maxChars = 8000): string {
  const parts: string[] = [];
  parts.push(
    `Activity since last commentary: ${counts.toolCalls} tool call(s), ${counts.edits} edit(s), ${counts.failures} failing call(s), ${counts.messageChars} message char(s).`
  );
  const turnLines: string[] = [];
  for (const t of turns) {
    const label = t.role === "user" ? "USER" : "ASSISTANT";
    const evidence: string[] = [];
    if (t.text.length > 0) evidence.push(t.text);
    else evidence.push(`(${t.toolCalls} tool call(s), no text)`);
    if (t.tools) evidence.push(`[tools: ${t.tools}]`);
    if (t.errors) evidence.push(`[errors: ${t.errors}]`);
    turnLines.push(`${label}: ${evidence.join(" ")}`);
  }
  if (turnLines.length === 0) {
    parts.push("No readable turn text available.");
    const only = parts.join("\n");
    return only.length <= maxChars ? only : only.slice(0, maxChars - 1) + "\u2026";
  }
  parts.push("Recent turns (oldest first; oldest dropped first on overflow):");
  // Overflow drops the OLDEST turns first — the newest correction or
  // constraint is the one a tip must not lose. The final hard cap keeps the
  // tail (newest) rather than the head.
  let start = 0;
  const build = () => [...parts, ...turnLines.slice(start)].join("\n");
  while (start < turnLines.length && build().length > maxChars) start += 1;
  let joined = build();
  if (joined.length > maxChars) {
    joined = "\u2026" + joined.slice(joined.length - maxChars + 1);
  }
  return joined;
}
// pi-summerize — bounded observation collection from the session branch.
// Pure functions, no I/O. The payload must stay small and stay OUT of the
// model-visible conversation (it only feeds the commentary call).

/** One condensed turn observation. */
export interface TurnDigest {
  role: "user" | "assistant";
  text: string;
  /** Number of tool calls observed in this entry (assistant side only). */
  toolCalls: number;
}

/** Activity counts since the last commentary, kept separately from text. */
export interface ActivityCounts {
  toolCalls: number;
  edits: number;
  failures: number;
}

export const EMPTY_COUNTS: ActivityCounts = { toolCalls: 0, edits: 0, failures: 0 };

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
  for (const entry of branch) {
    if (entry.type !== undefined && entry.type !== "message") continue;
    const role = entryRole(entry);
    if (!role) continue;
    const message = (entry.message ?? entry) as Record<string, unknown>;
    const text = textOf(message).trim();
    const toolCalls = toolCallCount(message);
    if (!text && toolCalls === 0) continue;
    digests.push({ role, text: text.slice(-1200), toolCalls });
  }

  const tail = digests.slice(-options.maxTurns);
  // Drop leading text-less digests to center the payload on substance.
  while (tail.length > 1 && !tail[0].text) tail.shift();

  let total = 0;
  const out: TurnDigest[] = [];
  for (let i = tail.length - 1; i >= 0; i--) {
    const d = tail[i];
    const cost = d.text.length;
    if (out.length > 0 && total + cost > options.maxChars) break;
    total += cost;
    out.unshift(d);
  }
  return out;
}

/** Count activity across the full branch (cheap pass, per-call counting). */
export function countActivity(branch: Array<Record<string, unknown>>): ActivityCounts {
  const counts: ActivityCounts = { toolCalls: 0, edits: 0, failures: 0 };
  for (const entry of branch) {
    const message = (entry.message ?? entry) as Record<string, unknown>;
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

/** Serialize digests + counts into the commentary user-message. */
export function renderObservation(turns: TurnDigest[], counts: ActivityCounts): string {
  const parts: string[] = [];
  parts.push(
    `Activity since last commentary: ${counts.toolCalls} tool call(s), ${counts.edits} edit(s), ${counts.failures} failing call(s).`
  );
  if (turns.length > 0) {
    parts.push("Recent turns (oldest first):");
    for (const t of turns) {
      const label = t.role === "user" ? "USER" : "ASSISTANT";
      const body = t.text.length > 0 ? t.text : `(${t.toolCalls} tool call(s), no text)`;
      parts.push(`${label}: ${body}`);
    }
  } else {
    parts.push("No readable turn text available.");
  }
  return parts.join("\n");
}
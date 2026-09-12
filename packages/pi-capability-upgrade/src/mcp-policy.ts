export type McpCall = {
  server: string;
  operation: string;
  args: Record<string, unknown>;
  callerScope?: readonly string[];
  source: "direct" | "proxy" | "repair" | "child";
};

export type McpRule = { server: string; operations: readonly string[]; requiredScope?: string };

export type PolicyDecision = { allowed: boolean; reason: string };

const SAFE_NAME = /^[a-z][a-z0-9_.-]{0,127}$/;

/** Apply policy after repair, against the canonical final call. */
export function authorizeMcpCall(call: McpCall, rules: readonly McpRule[]): PolicyDecision {
  if (!SAFE_NAME.test(call.server) || !SAFE_NAME.test(call.operation)) return { allowed: false, reason: "unresolved MCP identity" };
  if (!call.args || Array.isArray(call.args) || typeof call.args !== "object") return { allowed: false, reason: "invalid final arguments" };
  const rule = rules.find((candidate) => candidate.server === call.server && candidate.operations.includes(call.operation));
  if (!rule) return { allowed: false, reason: "operation is not explicitly allowlisted" };
  if (rule.requiredScope && !call.callerScope?.includes(rule.requiredScope)) return { allowed: false, reason: "caller scope is not authorized" };
  return { allowed: true, reason: "explicit policy allow" };
}

export function boundedOutput(text: string, maxChars = 12_000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n[output truncated]`, truncated: true };
}

export const DISABLED_MCP_RULES: readonly McpRule[] = [];

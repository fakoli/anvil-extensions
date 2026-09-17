import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createMcpAdapter, MCP_TOOL_APPROVAL_REQUEST_EVENT } from "pi-mcp-adapter";
import { authorizeMcpCall, DISABLED_MCP_RULES } from "./src/mcp-policy.js";

// A supplied factory configuration is isolated by the reviewed adapter: it is
// not merged with host, shared, project, import, or command-line MCP files.
// There are deliberately no enabled servers in the portable bundle.
const mcpAdapter = createMcpAdapter({
  config: {
    settings: {
      hostConfigDiscovery: "off",
      scriptMode: false,
      sampling: false,
      samplingAutoApprove: false,
      requestTimeoutMs: 30_000,
      directTools: false,
      exposeResources: false,
    },
    mcpServers: {},
  },
});

export default function capabilityUpgrade(pi: ExtensionAPI): void {
  mcpAdapter(pi);
  // The adapter emits this event at its final tool-call boundary for proxy,
  // direct, resource, and script origins. Claim it before any later listener
  // can fail open. This candidate's empty rule set therefore denies every
  // server call, including a runtime registration added by another extension.
  pi.events.on(MCP_TOOL_APPROVAL_REQUEST_EVENT, (request: unknown) => {
    if (!request || typeof request !== "object") return;
    const candidate = request as {
      serverName?: unknown; originalToolName?: unknown; args?: unknown;
      origin?: unknown; claim?: (handler: () => "allow_once" | "deny") => boolean;
    };
    if (typeof candidate.claim !== "function") return;
    candidate.claim(() => {
      const source = candidate.origin === "direct" ? "direct" : "proxy";
      const decision = authorizeMcpCall({
        server: typeof candidate.serverName === "string" ? candidate.serverName : "",
        operation: typeof candidate.originalToolName === "string" ? candidate.originalToolName : "",
        args: candidate.args && typeof candidate.args === "object" && !Array.isArray(candidate.args)
          ? candidate.args as Record<string, unknown> : {},
        source,
      }, DISABLED_MCP_RULES);
      return decision.allowed ? "allow_once" : "deny";
    });
  });
}

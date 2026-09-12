import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveLibraryIdTool } from "@upstash/context7-pi/lib/tools/resolve-library-id";
import { queryDocsTool } from "@upstash/context7-pi/lib/tools/query-docs";
import { createMcpAdapter, MCP_TOOL_APPROVAL_REQUEST_EVENT } from "pi-mcp-adapter";
import { assertSafeDocumentationQuestion } from "./src/docs-guard.js";
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
  pi.registerTool({
    ...resolveLibraryIdTool,
    description: "Resolve a public package at an explicit version before documentation lookup. Private source and credentials are refused.",
    parameters: Type.Object({
      libraryName: Type.String({ minLength: 1, maxLength: 200 }),
      version: Type.String({ minLength: 1, maxLength: 100 }),
      query: Type.String({ minLength: 1, maxLength: 1_500 }),
    }),
    async execute(toolCallId, params) {
      assertSafeDocumentationQuestion(params.query);
      assertSafeDocumentationQuestion(params.libraryName);
      assertSafeDocumentationQuestion(params.version);
      return resolveLibraryIdTool.execute(toolCallId, {
        libraryName: `${params.libraryName}@${params.version}`,
        query: `${params.query} (version ${params.version})`,
      });
    },
  });
  pi.registerTool({
    ...queryDocsTool,
    description: "Query public documentation for a resolved library and explicit package version. Reports unavailable version evidence rather than substituting another version.",
    parameters: Type.Object({
      libraryId: Type.String({ pattern: "^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", maxLength: 300 }),
      version: Type.String({ minLength: 1, maxLength: 100 }),
      query: Type.String({ minLength: 1, maxLength: 1_500 }),
    }),
    async execute(toolCallId, params) {
      assertSafeDocumentationQuestion(params.query);
      assertSafeDocumentationQuestion(params.version);
      return queryDocsTool.execute(toolCallId, {
        libraryId: params.libraryId,
        query: `For version ${params.version}: ${params.query}. If this version is unavailable, say so explicitly.`,
      });
    },
  });
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

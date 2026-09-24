// pi extension entry (T011): registers Stratus pi tools. Node >= 22.19.0.
// Tools are thin wrappers over the engine; every tool returns structured data.
// The default export is the real pi ExtensionAPI initializer — it registers
// the tool catalog through pi.registerTool and the /stratus command through
// pi.registerCommand, so the extension loads in the pi runtime.

import { compileAnyDiagram, compileDiagram } from "./pipeline.ts";
import { getPreset, listPresets } from "./presets.ts";
import { runCli } from "./cli.ts";
import { exportDiagram, type ExportFormat } from "./export.ts";
import { evaluateDiagram } from "./evaluate.ts";
import { jevAssess, jevStatus } from "./jev.ts";

export interface PiTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; optional?: boolean }>;
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const tools: readonly PiTool[] = [
  {
    name: "stratus_render",
    description: "Compile a Stratus spec into deterministic SVG + standalone interactive HTML with a validation receipt.",
    parameters: {
      spec: { type: "object", description: "Stratus diagram spec (JSON)" },
      preset: { type: "string", description: "Preset id (simple-vpc, three-tier) when no spec given", optional: true },
      theme: { type: "string", description: "light or dark", optional: true },
    },
    run: (args) => {
      const spec = args.spec ?? getPreset(String(args.preset ?? "three-tier"));
      return compileAnyDiagram(spec, { theme: args.theme === "dark" ? "dark" : "light", interactive: false });
    },
  },
  {
    name: "stratus_validate",
    description: "Validate a Stratus spec and return the typed validation receipt (gates, diagnostics, reference grade).",
    parameters: {
      spec: { type: "object", description: "Stratus diagram spec (JSON)" },
      preset: { type: "string", description: "Preset id when no spec given (simple-vpc, alb-targets, three-tier, gateway-endpoint, site-to-site-vpn, transit-gateway, gcp-network, azure-vnet)", optional: true },
    },
    run: (args) => {
      const spec = args.spec ?? getPreset(String(args.preset ?? "three-tier"));
      return compileAnyDiagram(spec, { theme: "light", interactive: false });
    },
  },
  {
    name: "stratus_presets",
    description: "List the progressive-disclosure preset ladder (simple-vpc → three-tier → …).",
    parameters: {},
    run: () => ({ presets: listPresets() }),
  },
  {
    name: "stratus_export",
    description: "Export a compiled diagram as svg, html, pdf, png, jpeg, or pptx (slides).",
    parameters: {
      spec: { type: "object", description: "Stratus diagram spec (JSON)" },
      format: { type: "string", description: "svg | html | pdf | png | jpeg | pptx" },
      outDir: { type: "string", description: "Output directory" },
      theme: { type: "string", description: "light or dark", optional: true },
    },
    run: (args) => exportDiagram({
      spec: args.spec,
      format: String(args.format ?? "svg") as ExportFormat,
      outDir: String(args.outDir ?? "."),
      theme: args.theme === "dark" ? "dark" : "light",
    }),
  },
  {
    name: "stratus_evaluate",
    description: "Evaluate a compiled diagram against gold-standard dimensions (containment tree, placement truth, routing explainability, CIDR truth, edge separation).",
    parameters: {
      spec: { type: "object", description: "Stratus diagram spec (JSON)" },
      referenceDir: { type: "string", description: "Directory of gold-standard reference specs", optional: true },
    },
    run: (args) => {
      const req: { spec: unknown; referenceDir?: string } = { spec: args.spec };
      if (args.referenceDir !== undefined) req.referenceDir = String(args.referenceDir);
      return evaluateDiagram(req);
    },
  },
  {
    name: "stratus_jev_status",
    description: "Probe the JEV advisory bridge status (advisory metadata only, never a gate).",
    parameters: {},
    run: () => jevStatus(),
  },
  {
    name: "stratus_jev_assess",
    description: "Ask JEV for an advisory assessment of a subject (strictly advisory-only).",
    parameters: {
      capability: { type: "string", description: "prd_review | evidence_triage" },
      subject: { type: "string", description: "Subject identifier" },
      payload: { type: "object", description: "Bounded payload for review" },
    },
    run: (args) => jevAssess({
      capability: (args.capability === "evidence_triage" ? "evidence_triage" : "prd_review"),
      subject: String(args.subject ?? "subject"),
      payload: args.payload ?? {},
    }),
  },
  {
    name: "stratus_cli",
    description: "Run a Stratus CLI verb (render, validate, catalog, network-check, doctor, preset) and return a structured receipt.",
    parameters: {
      argv: { type: "array", description: "CLI argv parts, e.g. [\"render\", \"three-tier\"]" },
    },
    run: (args) => runCli((args.argv as string[]) ?? ["doctor"]),
  },
];

export default function stratusExtension(pi: PiExtensionAPI): void {
  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      label: tool.name
        .replace(/^stratus_/, "")
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      description: tool.description,
      parameters: tool.parameters,
      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        // Cancellation reaches the engine through the shared signal.
        if (signal?.aborted) {
          return { content: [{ type: "text", text: "cancelled" }], details: { ok: false, cancelled: true } };
        }
        const result = await tool.run(params as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result as Record<string, unknown>,
        };
      },
    });
  }
  pi.registerCommand("stratus", {
    description:
      "Compile a Stratus diagram spec (or preset: simple-vpc, three-tier) into deterministic SVG + standalone interactive HTML with a typed validation receipt",
    handler: async (args, ctx) => {
      const preset = (args ?? "").trim() || "three-tier";
      const prompt = [
        `Compile the Stratus preset "${preset}" end to end.`,
        `Use the stratus_render tool with preset "${preset}", then report: the validation receipt (gates, reference grade, scene hash), the artifact paths, and any diagnostics.`,
        `If the user asked for a custom diagram, build the spec JSON first (schema: schemas/cloud.schema.json), then render it.`,
      ].join("\n");
      pi.sendUserMessage(prompt, { deliverAs: ctx.isIdle() ? undefined : "followUp" });
    },
  });
}

/** Structural type for the pi ExtensionAPI surface this extension uses. */
export interface PiExtensionAPI {
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: Record<string, unknown>,
      signal: AbortSignal | undefined,
      onUpdate: ((update: unknown) => void) | undefined,
      ctx: unknown,
    ) => Promise<{ content: { type: string; text: string }[]; details: Record<string, unknown> }>;
  }): void;
  registerCommand(command: string, def: {
    description: string;
    handler: (args: string | undefined, ctx: { isIdle: () => boolean }) => void | Promise<void>;
  }): void;
  sendUserMessage(message: string, options?: { deliverAs?: "followUp" | undefined }): void;
}

// CLI command wrappers (T006) — structured receipts, timeouts honored (R010).

import { compileAnyDiagram, compileDiagram, type CompileResult } from "./pipeline.ts";
import { getPreset, listPresets } from "./presets.ts";
import { CATALOG, isKnownService, catalogEntry } from "./cloud.ts";
import { ENGINE_VERSION } from "./validator.ts";
import { exportDiagram } from "./export.ts";
import { evaluateDiagram } from "./evaluate.ts";
import { existsSync } from "node:fs";

export interface CliReceipt {
  ok: boolean;
  command: string;
  data?: unknown;
  error?: string;
  engineVersion: string;
}

export function cmdRender(input: unknown, opts: { theme?: "light" | "dark"; out?: string }): CompileResult {
  return compileAnyDiagram(input, { theme: opts.theme ?? "light", interactive: false }) as CompileResult;
}

export function cmdValidate(input: unknown): CompileResult {
  return compileAnyDiagram(input, { theme: "light", interactive: false }) as CompileResult;
}

export function cmdCatalog(): unknown {
  return { ok: true, count: CATALOG.length, services: CATALOG.map((e) => ({ id: e.id, label: e.label, category: e.category, placement: e.placement })) };
}

export function cmdNetworkCheck(): unknown {
  // Real preflight: presets resolve, catalog loads, chrome is findable.
  const presets = listPresets().map((p) => p.id);
  const presetChecks = presets.map((id) => ({ id, resolvable: getPreset(id) !== undefined }));
  const chromePath = process.env.STRATUS_CHROME_PATH ?? "/usr/bin/google-chrome";
  let chromeAvailable = false;
  try {
    chromeAvailable = existsSync(chromePath);
  } catch {
    chromeAvailable = false;
  }
  return {
    engineVersion: ENGINE_VERSION,
    presets: presetChecks,
    catalogEntries: CATALOG.length,
    exports: { chromePath, chromeAvailable },
  };
  return { ok: true, command: "network-check", presets: listPresets().map((p) => p.id) };
}

export function cmdDoctor(): unknown {
  return {
    ok: true,
    engineVersion: ENGINE_VERSION,
    presets: listPresets().map((p) => p.id),
    catalogEntries: CATALOG.length,
    verbs: ["render", "validate", "doctor", "catalog", "network-check", "preset", "evaluate", "export"],
  };
}

export function cmdPreset(id: string): unknown {
  const spec = getPreset(id);
  if (!spec) return { ok: false, command: "preset", error: `unknown preset: ${id}`, engineVersion: ENGINE_VERSION };
  return { ok: true, command: "preset", data: spec, engineVersion: ENGINE_VERSION };
}

/** Run one CLI invocation from argv-style parts. Returns a structured receipt. */
export async function runCli(argv: readonly string[], stdinJson?: string | object): Promise<unknown> {
  const [command, ...args] = argv;
  const engineVersion = ENGINE_VERSION;
  const receipt = (ok: boolean, data?: unknown, error?: string): unknown => ({ ok, command, data, error, engineVersion });
  // stdinJson may be an already-parsed object or a JSON string — parse at most
  // once. Parse errors return a structured receipt instead of throwing.
  const parseStdin = (): { ok: true; input: unknown } | { ok: false; error: string } => {
    if (stdinJson === undefined) return { ok: true, input: undefined };
    if (typeof stdinJson !== "string") return { ok: true, input: stdinJson };
    try {
      return { ok: true, input: JSON.parse(stdinJson) };
    } catch (err) {
      return { ok: false, error: `invalid stdin JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
  };
  // Full structured findings: severity, pointer, evidence, and fixes survive
  // the CLI interface — never stripped.
  const gateSummary = (gates: readonly { id: string; status: string; diagnostics: readonly unknown[] }[]) =>
    gates.map((g) => ({
      id: g.id,
      status: g.status,
      diagnostics: g.diagnostics.map((d) => {
        const diag = d as { code: string; severity: string; message: string; subjects: readonly string[]; pointer?: string; evidence?: { rule: string; actual?: unknown; expected?: unknown }; supportedFixes?: readonly { instruction: string }[]; fixes?: readonly { instruction: string }[] };
        const fixes = diag.supportedFixes ?? diag.fixes;
        return {
          code: diag.code,
          severity: diag.severity,
          message: diag.message,
          subjects: diag.subjects,
          ...(diag.pointer !== undefined ? { pointer: diag.pointer } : {}),
          ...(diag.evidence !== undefined ? { evidence: diag.evidence } : {}),
          ...(fixes !== undefined && fixes.length > 0 ? { fixes } : {}),
        };
      }),
    }));
  switch (command) {
    case "render": {
      const parsed = parseStdin();
      if (!parsed.ok) return receipt(false, undefined, parsed.error);
      const outIdx = args.indexOf("--out");
      const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
      const positional = args.filter((a, i) => a !== "--out" && !(outIdx >= 0 && i === outIdx + 1));
      const input = parsed.input !== undefined ? parsed.input : getPreset(positional[0] ?? "three-tier");
      if (!input) return receipt(false, undefined, `unknown preset: ${positional[0]}`);
      const result = cmdRender(input, { theme: "light" });
      if (!result.ok) return receipt(false, { stage: result.stage, gates: gateSummary(result.receipt.gates) }, "compile failed");
      if (outPath !== undefined) {
        // --out writes the svg/html documents and returns artifact paths.
        const { mkdirSync, writeFileSync } = await import("node:fs");
        try {
          mkdirSync(outPath, { recursive: true });
          const svgPath = `${outPath}/diagram.svg`;
          const htmlPath = `${outPath}/diagram.html`;
          writeFileSync(svgPath, result.svg, "utf8");
          writeFileSync(htmlPath, result.document.html, "utf8");
          return receipt(true, { svgBytes: result.svg.length, htmlBytes: result.document.html.length, referenceGrade: result.receipt.referenceGrade, sceneHash: result.receipt.sceneHash, artifacts: [svgPath, htmlPath] });
        } catch (err) {
          return receipt(false, undefined, `--out write failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return receipt(true, { svgBytes: result.svg.length, htmlBytes: result.document.html.length, referenceGrade: result.receipt.referenceGrade, sceneHash: result.receipt.sceneHash, artifact: "svg+html documents returned inline (pass --out to write files)" });
    }
    case "validate": {
      const parsed = parseStdin();
      if (!parsed.ok) return receipt(false, undefined, parsed.error);
      const input = parsed.input !== undefined ? parsed.input : getPreset(args[0] ?? "three-tier");
      if (!input) return receipt(false, undefined, `unknown preset: ${args[0]}`);
      const result = cmdValidate(input);
      if (!result.ok) return receipt(false, { stage: result.stage, referenceGrade: result.receipt.referenceGrade, gates: gateSummary(result.receipt.gates) }, "validation failed");
      return receipt(true, { referenceGrade: result.receipt.referenceGrade, gates: gateSummary(result.receipt.gates) });
    }
    case "catalog": return receipt(true, cmdCatalog());
    case "network-check": return receipt(true, cmdNetworkCheck());
    case "evaluate": {
      const parsed = parseStdin();
      if (!parsed.ok) return receipt(false, undefined, parsed.error);
      const input = parsed.input !== undefined ? parsed.input : getPreset(args[0] ?? "three-tier");
      if (!input) return receipt(false, undefined, `unknown preset: ${args[0]}`);
      const record = evaluateDiagram({ spec: input as Parameters<typeof evaluateDiagram>[0]["spec"] });
      // The outer receipt mirrors the evaluation result — a failed evaluation
      // is never reported as ok:true.
      return receipt(record.ok, record);
    }
    case "export": {
      const parsed = parseStdin();
      if (!parsed.ok) return receipt(false, undefined, parsed.error);
      const input = parsed.input !== undefined ? parsed.input : getPreset(args[0] ?? "three-tier");
      if (!input) return receipt(false, undefined, `unknown preset: ${args[0]}`);
      const format = (args[1] ?? "png") as "png" | "jpeg" | "pdf" | "pptx" | "svg" | "html";
      const outDir = args[2] ?? "/tmp/stratus-export";
      try {
        const r = await exportDiagram({ spec: input as Parameters<typeof exportDiagram>[0]["spec"], format, outDir });
        if (r.ok) return receipt(true, { artifacts: r.artifacts });
        return receipt(false, { gates: gateSummary(r.gates ?? []) }, r.error);
      } catch (err) {
        return receipt(false, undefined, `export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    case "doctor": return receipt(true, cmdDoctor());
    case "preset": return cmdPreset(args[0] ?? "three-tier");
    default:
      return receipt(false, undefined, `unknown command: ${command ?? "?"} (verbs: render, validate, catalog, network-check, doctor, preset)`);
  }
}

export { isKnownService, catalogEntry };

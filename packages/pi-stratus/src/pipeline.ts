// Shared entry point (T006) — spec → validate → layout → render → artifacts.
// Validation precedes writing (the archify contract pattern, reused not copied).

import { decodeSpec, type StratusSpec } from "./schema.ts";
import { normalizeSpec } from "./normalize.ts";
import { validateSemantic, type ValidationReceipt } from "./validator.ts";
import { layoutSpec, type LayoutScene } from "./layout.ts";
import { decodeGeneral, renderGeneral, validateGeneral, type GeneralReceipt } from "./diagram-types.ts";
import { renderSvg, renderHtml, type RenderOptions, type RenderedDocument } from "./renderer.ts";
import { PINNED_METRICS } from "./metrics.ts";

export interface CompileOptions extends RenderOptions {
  viewId?: string;
  /** Explicit flow override; defaults to the spec's presentation.flow. */
  flow?: "top-down" | "left-right";
  /** Explicit detail override; defaults to the declared view's detail. */
  detail?: "overview" | "network-detail";
  /** Standalone focus filter (no declared view); narrows the laid-out scopes. */
  focusIds?: readonly string[];
}

export interface CompileOk {
  ok: true;
  spec: StratusSpec;
  scene: LayoutScene;
  svg: string;
  document: RenderedDocument;
  receipt: ValidationReceipt;
}

export interface CompileFail {
  ok: false;
  receipt: ValidationReceipt;
  stage: "decode" | "semantic" | "layout";
}

export type CompileResult = CompileOk | CompileFail;

export type GeneralCompileResult =
  | { ok: true; svg: string; document: RenderedDocument; receipt: GeneralReceipt }
  | { ok: false; receipt: GeneralReceipt; error?: string };

/** Compile any spec — cloud diagrams AND general diagrams (workflow,
 *  sequence, dataflow, lifecycle) route through this single entry point. */
export function compileAnyDiagram(input: unknown, options: CompileOptions): CompileResult | GeneralCompileResult {
  const kind = (input as { kind?: string } | null | undefined)?.kind;
  if (kind === "workflow" || kind === "sequence" || kind === "dataflow" || kind === "lifecycle") {
    return compileGeneralDiagram(input, options);
  }
  return compileDiagram(input, options);
}

export function compileDiagram(input: unknown, options: CompileOptions): CompileResult {
  const decoded = decodeSpec(input);
  if (!decoded.ok) {
    return {
      ok: false,
      stage: "decode",
      receipt: failedReceipt([
        {
          id: "schema",
          phase: "schema" as const,
          status: "failed" as const,
          diagnostics: decoded.diagnostics.map((d) => ({
            code: "SCHEMA_INVALID" as never,
            severity: "error" as never,
            phase: "schema" as const,
            message: `${d.message} (${d.pointer})`,
            subjects: [d.pointer],
            evidence: { rule: "SCHEMA_INVALID", pointer: d.pointer },
            supportedFixes: [],
          })),
        },
      ]),
    };
  }
  const semantic = validateSemantic(decoded.spec);
  if (semantic.hasErrors) {
    return { ok: false, stage: "semantic", receipt: semantic.receipt };
  }
  const normalized = normalizeSpec(decoded.spec);
  const layoutOptions: { viewId?: string; flow: "top-down" | "left-right"; focusIds?: readonly string[]; detail?: "overview" | "network-detail" } = { flow: options.flow ?? decoded.spec.presentation.flow };
  if (options.viewId !== undefined) {
    layoutOptions.viewId = options.viewId;
    // View selection changes focus/detail/content from the declared view.
    const view = decoded.spec.views.find((v) => v.id === options.viewId);
    if (view) {
      layoutOptions.focusIds = view.focusIds;
      layoutOptions.detail = options.detail ?? view.detail;
    }
  }
  // Standalone detail override (no matching view) is honored too.
  if (options.detail !== undefined && options.viewId === undefined) {
    layoutOptions.detail = options.detail;
  }
  // Standalone focusIds (no declared view) are honored as well.
  if (options.focusIds !== undefined && options.viewId === undefined) {
    layoutOptions.focusIds = options.focusIds;
  }
  const { scene, diagnostics } = layoutSpec(normalized.spec, normalized.indexes, layoutOptions);
  const layoutErrors = diagnostics.filter((d) => d.severity === "error");
  const receipt: ValidationReceipt = {
    ...semantic.receipt,
    sceneHash: hashScene(scene),
    gates: [
      ...semantic.receipt.gates,
      {
        id: "geometry",
        phase: "layout",
        status: layoutErrors.length > 0 ? "failed" : "passed",
        diagnostics: diagnostics.map((d) => ({
          code: d.code as never,
          severity: d.severity as never,
          phase: "layout" as const,
          message: d.message,
          subjects: d.subjects,
          evidence: { rule: d.code },
          supportedFixes: [],
        })),
      },
    ],
    referenceGrade: layoutErrors.length > 0 ? "blocked" : semantic.receipt.referenceGrade,
  };
  if (layoutErrors.length > 0) {
    return { ok: false, stage: "layout", receipt };
  }
  const svg = renderSvg(decoded.spec, scene, receipt, options);
  const html = renderHtml(svg, decoded.spec, receipt, options);
  const document: RenderedDocument = { svg, html };
  return { ok: true, spec: decoded.spec, scene, svg, document, receipt };
}

/** Compile a general (workflow/sequence/dataflow/lifecycle) spec end to end. */
export function compileGeneralDiagram(input: unknown, options: CompileOptions): { ok: true; svg: string; document: RenderedDocument; receipt: GeneralReceipt } | { ok: false; receipt: GeneralReceipt; error?: string } {
  const decoded = decodeGeneral(input);
  if (!decoded.ok) {
    return {
      ok: false,
      receipt: {
        schemaVersion: 1,
        engineVersion: "stratus-engine-v1",
        referenceGrade: "blocked",
        gates: [{ id: "general-schema", phase: "schema" as const, status: "failed" as const, diagnostics: decoded.diagnostics.map((d) => ({ code: d.code as never, severity: "error" as never, phase: "schema" as const, message: d.message, subjects: [d.code], evidence: { rule: d.code }, supportedFixes: [] })) }],
      } as unknown as GeneralReceipt,
      error: "decode failed",
    };
  }
  // Semantic errors (dangling endpoints, duplicate ids) block compilation.
  const validation = validateGeneral(decoded.spec);
  const semanticErrors = validation.diagnostics.filter((d) => d.severity === "error");
  if (semanticErrors.length > 0) {
    return {
      ok: false,
      receipt: {
        ...validation.receipt,
        referenceGrade: "blocked",
      } as unknown as GeneralReceipt,
      error: `semantic validation failed: ${semanticErrors.map((d) => d.code).join(", ")}`,
    };
  }
  const rendered = renderGeneral(decoded.spec, options.theme === "dark" ? "dark" : "light");
  return { ok: true, svg: rendered.svg, document: { svg: rendered.svg, html: rendered.html }, receipt: rendered.receipt };
}

function failedReceipt(gates: ValidationReceipt["gates"]): ValidationReceipt {
  return {
    schemaVersion: 1,
    engineVersion: "stratus-engine-v1",
    specHash: "invalid",
    metricsHash: PINNED_METRICS.version,
    profileId: "aws-normalized-spacious-v1",
    gates,
    referenceGrade: "blocked",
    scope: "diagram-spec-conformance-not-cloud-security",
  };
}

function hashScene(scene: LayoutScene): string {
  // Hash the complete recursively-canonicalized scene — nested geometry,
  // labels, route points, styles, and views must all affect the hash.
  const canonical = JSON.stringify(scene, (_key, value) => value);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < canonical.length; i++) {
    h ^= BigInt(canonical.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}


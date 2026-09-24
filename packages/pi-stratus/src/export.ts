// Export surface (T010): SVG native, PDF/raster via headless system Chrome,
// slides via pptxgenjs. All exports are offline; no credentials, no network.

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileDiagram, compileGeneralDiagram, type CompileResult } from "./pipeline.ts";
import type { StratusSpec } from "./schema.ts";

export type ExportFormat = "svg" | "html" | "pdf" | "png" | "jpeg" | "pptx";

export interface ExportRequest {
  spec: StratusSpec | unknown;
  format: ExportFormat;
  outDir: string;
  theme?: "light" | "dark";
  slideTitle?: string;
  /** Cancellation reaches subprocesses through this signal. */
  signal?: AbortSignal;
}

export interface ExportReceipt {
  ok: boolean;
  format: ExportFormat;
  artifacts: { path: string; bytes: number }[];
  referenceGrade?: string;
  error?: string;
  /** Structured findings preserved from a failed compile. */
  gates?: { id: string; status: string; diagnostics: { code: string; message: string; subjects: readonly string[] }[] }[];
}

const SYSTEM_CHROME = process.env.STRATUS_CHROME_PATH ?? "/usr/bin/google-chrome";

async function renderWithChrome(htmlPath: string, outPath: string, format: "pdf" | "png" | "jpeg", signal?: AbortSignal): Promise<void> {
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: SYSTEM_CHROME,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
  try {
    if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
    const page = await browser.newPage();
    if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
    // Absolute path → proper file:// URL (spaces, unicode safe).
    await page.goto(pathToFileURL(htmlPath).href, signal ? { waitUntil: "networkidle0", signal } : { waitUntil: "networkidle0" });
    if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
    if (format === "pdf") {
      await page.pdf({ path: outPath, printBackground: true, preferCSSPageSize: true });
    } else {
      const el = await page.$("#stratus-figure");
      if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
      if (el) {
        await el.screenshot({ path: outPath, type: format === "jpeg" ? "jpeg" : "png" });
      } else {
        await page.screenshot({ path: outPath, type: format === "jpeg" ? "jpeg" : "png", fullPage: true });
      }
    }
  } finally {
    await browser.close();
  }
}

async function exportSlides(spec: StratusSpec, svg: string, htmlPath: string, outPath: string, title: string, signal?: AbortSignal): Promise<void> {
  const pptxModule = (await import("pptxgenjs")) as unknown as { default?: new () => unknown } & Record<string, unknown>;
  const PptxGenJS = (pptxModule.default ?? pptxModule) as new () => {
    defineLayout: (layout: { name: string; width: number; height: number }) => void;
    layout: string;
    addSlide: () => {
      addText: (text: string, opts: Record<string, unknown>) => void;
      addImage: (opts: Record<string, unknown>) => void;
    };
    writeFile: (opts: { fileName: string }) => Promise<string>;
  };
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "STRATUS", width: 13.333, height: 7.5 });
  pptx.layout = "STRATUS";
  const slide = pptx.addSlide();
  slide.addText(title, { x: 0.5, y: 0.3, w: 12.3, h: 0.6, fontSize: 24, bold: true });
  const pngPath = htmlPath.replace(/\.html$/, ".png");
  await renderWithChrome(htmlPath, pngPath, "png", signal);
  if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
  slide.addImage({ path: pngPath, x: 0.5, y: 1.0, w: 12.3, h: 6.0, sizing: { type: "contain", w: 12.3, h: 6.0 } });
  if (signal?.aborted) throw new DOMException("export cancelled", "AbortError");
  await pptx.writeFile({ fileName: outPath });
}

/** Compile once, then export in the requested format. SVG/HTML are native. */
export async function exportDiagram(request: ExportRequest): Promise<ExportReceipt> {
  // An already-aborted signal rejects before ANY branch (cloud or general).
  if (request.signal?.aborted) {
    return { ok: false, format: request.format, artifacts: [], error: "export cancelled" };
  }
  // General diagrams export through the same interface.
  const exportKind = (request.spec as { kind?: string } | null | undefined)?.kind;
  if (exportKind === "workflow" || exportKind === "sequence" || exportKind === "dataflow" || exportKind === "lifecycle") {
    if (request.signal?.aborted) {
      return { ok: false, format: request.format, artifacts: [], error: "export cancelled" };
    }
    const general = compileGeneralDiagram(request.spec as unknown as Parameters<typeof compileGeneralDiagram>[0], { theme: "light", interactive: false });
    if (!general.ok) {
      // Preserve the general receipt's gates — never discarded.
      return {
        ok: false,
        format: request.format,
        artifacts: [],
        error: general.error ?? "general compile failed",
        gates: general.receipt.gates.map((g) => ({
          id: g.id,
          status: g.status,
          diagnostics: g.diagnostics.map((d) => {
            const diag = d as { code: string; severity: string; message: string; subjects: readonly string[]; pointer?: string; evidence?: { rule: string; actual?: unknown; expected?: unknown }; supportedFixes?: readonly { instruction: string }[] };
            return {
              code: diag.code,
              severity: diag.severity,
              message: diag.message,
              subjects: diag.subjects,
              ...(diag.pointer !== undefined ? { pointer: diag.pointer } : {}),
              ...(diag.evidence !== undefined ? { evidence: diag.evidence } : {}),
              ...(diag.supportedFixes !== undefined && diag.supportedFixes.length > 0 ? { fixes: diag.supportedFixes } : {}),
            };
          }),
        })),
      };
    }
    const outDir = resolve(request.outDir);
    const stem = String((request.spec as { title?: string }).title ?? "diagram").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
    const artifacts: { path: string; bytes: number }[] = [];
    try {
      mkdirSync(outDir, { recursive: true });
      if (request.format === "svg") {
        const p = join(outDir, `${stem}.svg`);
        writeFileSync(p, general.svg);
        artifacts.push({ path: p, bytes: Buffer.byteLength(general.svg) });
      } else if (request.format === "html") {
        const p = join(outDir, `${stem}.html`);
        writeFileSync(p, general.document.html);
        artifacts.push({ path: p, bytes: Buffer.byteLength(general.document.html) });
      } else {
        return { ok: false, format: request.format, artifacts, error: `general diagrams support svg/html export (requested ${request.format})` };
      }
    } catch (err) {
      return { ok: false, format: request.format, artifacts, error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: true, format: request.format, artifacts, referenceGrade: general.receipt.referenceGrade };
  }
  const result: CompileResult = compileDiagram(request.spec, { theme: request.theme ?? "light", interactive: false });
  if (!result.ok) {
    // Preserve the full structured findings through the export interface:
    // severity, pointer, evidence, and fixes — never stripped.
    return {
      ok: false,
      format: request.format,
      artifacts: [],
      error: `compile failed at ${result.stage}`,
      gates: result.receipt.gates.map((g) => ({
        id: g.id,
        status: g.status,
        diagnostics: g.diagnostics.map((d) => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          subjects: d.subjects,
          ...(d.pointer !== undefined ? { pointer: d.pointer } : {}),
          ...(d.evidence !== undefined ? { evidence: d.evidence } : {}),
          ...(d.supportedFixes.length > 0 ? { fixes: d.supportedFixes } : {}),
        })),
      })),
    };
  }
  const outDir = resolve(request.outDir);
  const stem = result.spec.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
  const artifacts: { path: string; bytes: number }[] = [];
  const signal = request.signal;
  // An already-aborted signal rejects before any work.
  if (signal?.aborted) {
    return { ok: false, format: request.format, artifacts, error: "export cancelled" };
  }
  try {
    mkdirSync(outDir, { recursive: true });
    // Unsupported formats are rejected before any file is written.
    if (request.format !== "svg" && request.format !== "html" && request.format !== "pdf" && request.format !== "png" && request.format !== "jpeg" && request.format !== "pptx") {
      return { ok: false, format: request.format, artifacts, error: `unsupported export format: ${String(request.format)}` };
    }
    if (request.format === "svg") {
      const p = join(outDir, `${stem}.svg`);
      writeFileSync(p, result.svg);
      artifacts.push({ path: p, bytes: Buffer.byteLength(result.svg) });
    } else if (request.format === "html") {
      const p = join(outDir, `${stem}.html`);
      writeFileSync(p, result.document.html);
      artifacts.push({ path: p, bytes: Buffer.byteLength(result.document.html) });
    } else {
      const htmlPath = join(outDir, `${stem}.html`);
      writeFileSync(htmlPath, result.document.html);
      if (request.format === "pdf") {
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        const p = join(outDir, `${stem}.pdf`);
        await renderWithChrome(htmlPath, p, "pdf", signal);
        // Post-operation abort check: the artifact counts only when the
        // signal is still live after the browser step completes.
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        artifacts.push({ path: p, bytes: statSync(p).size });
      } else if (request.format === "png" || request.format === "jpeg") {
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        const p = join(outDir, `${stem}.${request.format}`);
        await renderWithChrome(htmlPath, p, request.format, signal);
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        artifacts.push({ path: p, bytes: statSync(p).size });
      } else if (request.format === "pptx") {
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        const p = join(outDir, `${stem}.pptx`);
        await exportSlides(result.spec, result.svg, htmlPath, p, request.slideTitle ?? result.spec.title, signal);
        if (signal?.aborted) return { ok: false, format: request.format, artifacts, error: "export cancelled" };
        artifacts.push({ path: p, bytes: statSync(p).size });
      } else {
        return { ok: false, format: request.format, artifacts, error: `unsupported export format: ${request.format}` };
      }
    }
  } catch (err) {
    return { ok: false, format: request.format, artifacts, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, format: request.format, artifacts, referenceGrade: result.receipt.referenceGrade };
}

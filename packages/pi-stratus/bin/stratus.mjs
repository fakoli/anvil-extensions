#!/usr/bin/env node
// Stratus CLI — thin entry over src/cli.ts.
// Verbs: render, validate, doctor, catalog, network-check, preset, evaluate, export.
// Every command returns a structured receipt; nothing here mutates project state.

import { runCli } from "../src/cli.ts";
import { exportDiagram } from "../src/export.ts";
import { evaluateDiagram } from "../src/evaluate.ts";
import { getPreset, listPresets } from "../src/presets.ts";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const verbs = ["render", "validate", "doctor", "catalog", "network-check", "preset", "evaluate", "export"];

const [verb, ...args] = process.argv.slice(2);

function receipt(ok, command, data, error) {
  const out = { ok, command, data };
  if (error) out.error = error;
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exitCode = ok ? 0 : 1;
}

async function readStdinJson() {
  if (process.stdin.isTTY) return undefined;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text.length > 0 ? JSON.parse(text) : undefined;
}

function parseFlag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  if (!verb || !verbs.includes(verb)) {
    receipt(false, verb ?? "(none)", {}, {
      code: "unknown-verb",
      message: `usage: stratus <${verbs.join("|")}> [args]`,
    });
    return;
  }
  if (verb === "export") {
    const specPath = args[0];
    const format = parseFlag("format") ?? "svg";
    const outDir = parseFlag("out-dir") ?? process.cwd();
    if (!specPath) {
      receipt(false, verb, {}, { code: "missing-spec", message: "usage: stratus export <spec.json> --format svg|html|pdf|png|jpeg|pptx --out-dir <dir>" });
      return;
    }
    let spec;
    try {
      spec = JSON.parse(await readFile(specPath, "utf8"));
    } catch (err) {
      receipt(false, verb, {}, { code: "spec-unreadable", message: String(err?.message ?? err) });
      return;
    }
    try {
      const r = await exportDiagram({ spec, format, outDir });
      if (r.ok) {
        receipt(true, verb, { artifacts: r.artifacts });
      } else {
        // Compile failures carry the full gates — never discarded.
        receipt(false, verb, { gates: r.gates }, r.error);
      }
    } catch (err) {
      receipt(false, verb, {}, { code: "export-failed", message: String(err?.message ?? err) });
    }
    return;
  }
  if (verb === "evaluate") {
    const specPath = args[0];
    if (!specPath) {
      receipt(false, verb, {}, { code: "missing-spec", message: "usage: stratus evaluate <spec.json>" });
      return;
    }
    let spec;
    if (existsSync(specPath)) {
      try {
        spec = JSON.parse(await readFile(specPath, "utf8"));
      } catch (err) {
        receipt(false, verb, {}, { code: "spec-unreadable", message: String(err?.message ?? err) });
        return;
      }
    } else {
      spec = getPreset(specPath);
      if (!spec) {
        receipt(false, verb, {}, { code: "unknown-preset", message: `unknown preset: ${specPath} (available: ${listPresets().map((x) => x.id).join(", ")})` });
        return;
      }
    }
    const r = evaluateDiagram({ spec });
    receipt(r.ok, verb, r.ok ? { overall: r.overall, dimensions: r.dimensions } : undefined, r.ok ? undefined : r.error);
    return;
  }
  if (verb === "preset") {
    const id = args[0] ?? "three-tier";
    const preset = getPreset(id);
    if (!preset) {
      receipt(false, verb, {}, { code: "unknown-preset", message: `unknown preset: ${id} (available: ${listPresets().map((p) => p.id).join(", ")})` });
      return;
    }
    receipt(true, verb, preset);
    return;
  }
  // stdin-fed verbs: render, validate
  if (verb === "render" || verb === "validate" || verb === "evaluate" || verb === "export") {
    let stdinJson;
    try {
      stdinJson = await readStdinJson();
    } catch (err) {
      receipt(false, verb, {}, { code: "stdin-unreadable", message: String(err?.message ?? err) });
      return;
    }
    const out = await runCli([verb, ...args], stdinJson);
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    process.exitCode = out.ok ? 0 : 1;
    return;
  }
  const out = await runCli([verb, ...args]);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exitCode = out.ok ? 0 : 1;
}

main().catch((err) => {
  receipt(false, verb ?? "(none)", {}, { code: "cli-failed", message: String(err?.message ?? err) });
});

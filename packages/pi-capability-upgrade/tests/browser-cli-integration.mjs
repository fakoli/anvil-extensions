#!/usr/bin/env node
// Opt-in local fixture for the package-pinned @playwright/cli binary.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, "..", "..", "..");
const cli = join(bundle, "node_modules", "@playwright", "cli", "playwright-cli.js");
const state = mkdtempSync(join(tmpdir(), "pi-capability-browser-"));
const session = `candidate-fixture-${process.pid}`;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, `-s=${session}`, ...args], { cwd: state, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${args.join(" ")} failed (${code}): ${stderr}`)));
  });
}

const server = http.createServer((request, response) => {
  if (request.url === "/api/fail") {
    response.writeHead(503, { "content-type": "text/plain" }); response.end("fixture failure"); return;
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><button aria-label="Approve">Approve</button><output>pending</output>
    <script>document.querySelector('button').onclick=()=>{document.querySelector('output').textContent='approved'; console.error('candidate-fixture-console-marker');};</script>`);
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await run(["open", `http://127.0.0.1:${port}/`]);
  assert.match(await run(["snapshot"]), /pending/);
  await run(["click", "getByRole('button', { name: 'Approve' })"]);
  assert.match(await run(["snapshot"]), /approved/);
  assert.match(await run(["console", "error"]), /candidate-fixture-console-marker/);
  await run(["goto", `http://127.0.0.1:${port}/api/fail`]);
  assert.match(await run(["requests"]), /503/);
  console.log("Pinned browser CLI fixture passed");
} finally {
  await run(["close"]).catch(() => undefined);
  await new Promise((resolve) => server.close(resolve));
  rmSync(state, { recursive: true, force: true });
}

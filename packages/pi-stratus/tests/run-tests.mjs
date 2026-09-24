// Stratus offline test runner (T001 creates the suite; later tasks extend it).
// Deterministic, offline, no network, no credentials.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const testFiles = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

if (testFiles.length === 0) {
  console.log("no test files yet — suite lands with T001");
  process.exit(0);
}

let failed = 0;
for (const f of testFiles) {
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: "inherit" });
  if (r.status !== 0) failed += 1;
}
process.exit(failed === 0 ? 0 : 1);

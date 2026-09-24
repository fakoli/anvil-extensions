// Astra re-review: executable + packaged-handler regressions. The actual
// subprocess is tested with valid and invalid stdin; the packaged adapter is
// executed against a mock pi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(repoRoot, "bin", "stratus.mjs");

function runCli(args, stdin) {
  return spawnSync(process.execPath, [bin, ...args], {
    input: stdin,
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("executable doctor returns a structured receipt (not a stub)", () => {
  const r = runCli(["doctor"]);
  assert.equal(r.status, 0, `doctor exit: ${r.stderr}`);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.data.notImplemented, undefined, "doctor must not report not-implemented");
  assert.ok(receipt.data.presets.length > 0);
});

test("executable render returns byte counts", () => {
  const r = runCli(["render", "three-tier"]);
  assert.equal(r.status, 0);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.ok, true);
  assert.ok(receipt.data.svgBytes > 0);
  assert.ok(receipt.data.htmlBytes > 0);
});

test("executable validate accepts a preset piped via stdin (object parse-once)", () => {
  // The executable reads stdin once and passes the PARSED object to runCli.
  const preset = JSON.stringify({ schemaVersion: 1, provider: "aws", title: "stdin smoke", cloud: { kind: "aws-cloud", id: "c", label: "C", resources: [], regions: [{ kind: "aws-region", id: "r", label: "R", regionId: "geo", resources: [], vpcs: [] }] }, geography: [], externals: [], policies: [], frames: [], planes: [], edges: [], routingFacts: [], routeCards: [], views: [], presentation: { profile: "normalized", spacing: "comfortable", flow: "top-down" } });
  const r = runCli(["validate"], preset);
  assert.equal(r.status, 0, `validate exit: ${r.stderr} ${r.stdout}`);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.ok, true, `receipt: ${JSON.stringify(receipt).slice(0, 200)}`);
});

test("executable rejects invalid stdin JSON with a structured receipt", () => {
  const r = runCli(["validate"], "{not json");
  assert.equal(r.status, 1, "invalid stdin must exit 1");
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.error.code, "stdin-unreadable");
  assert.ok(receipt.error.message.length > 0);
});

test("executable unknown verb exits 1 with usage", () => {
  const r = runCli(["bogus-verb"]);
  assert.equal(r.status, 1);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.ok, false);
  assert.ok(receipt.error.message.includes("usage"));
});

test("packaged adapter registers tools and commands and executes handlers", async t => {
  // Resolve the actual package: STRATUS_PACKAGE_DIR, or the anvil-extensions
  // worktree when staged. Absent staging is an explicit SKIP, not a pass.
  const candidates = [
    process.env.STRATUS_PACKAGE_DIR,
    // Own package root (portable): this test lives in <package>/tests/.
    join(import.meta.dirname, ".."),
    "/tmp/anvil-extensions-stratus/packages/pi-stratus",
  ].filter(Boolean);
  const pkg = candidates.find((c) => existsSync(join(c, "index.ts")));
  if (!pkg) {
    t.skip("packaged adapter not staged (set STRATUS_PACKAGE_DIR)");
    return;
  }
  let index;
  try {
    index = await import(join(pkg, "index.ts"));
  } catch (err) {
    assert.fail(`packaged index.ts failed to import: ${err}`);
  }
  const registered = { tools: [], commands: [] };
  const pi = {
    registerTool: (t) => registered.tools.push(t),
    registerCommand: (name, def) => registered.commands.push({ name, def }),
    sendUserMessage: () => {},
  };
  index.default(pi);
  assert.equal(registered.tools.length, 8, "8 tools registered");
  assert.equal(registered.commands.length, 2, "/stratus + /stratus-doctor");
  // Schema boundary: every tool registers a proper object JSON Schema
  // (type/properties/required), not a property-descriptor map — pi's
  // Anthropic conversion reads schema.properties, so a descriptor map would
  // advertise zero arguments.
  for (const tool of registered.tools) {
    const schema = tool.parameters;
    assert.ok(schema && typeof schema === "object", `${tool.name}: parameters is an object`);
    assert.equal(schema.type, "object", `${tool.name}: schema.type is object`);
    assert.ok(schema.properties && typeof schema.properties === "object", `${tool.name}: schema.properties present`);
    assert.ok(Array.isArray(schema.required), `${tool.name}: schema.required is an array`);
    for (const [name, prop] of Object.entries(schema.properties)) {
      assert.ok(prop && typeof prop.type === "string" && typeof prop.description === "string", `${tool.name}.${name}: property has type + description`);
    }
  }
  const renderSchema = registered.tools.find((t) => t.name === "stratus_render").parameters;
  assert.ok(renderSchema.properties.spec, "render advertises spec");
  assert.ok(renderSchema.required.includes("spec"), "render requires spec");
  assert.ok(!renderSchema.required.includes("preset"), "preset is optional");
  // Doctor handler executes against a mock ctx without throwing.
  const doctor = registered.commands.find((c) => c.name === "stratus-doctor");
  let notified = null;
  await doctor.def.handler(undefined, { ui: { notify: (t) => { notified = t; } }, isIdle: () => true });
  assert.ok(notified && notified.includes("stratus engine"), `notify: ${notified}`);
  // Render tool executes.
  const renderTool = registered.tools.find((t) => t.name === "stratus_render");
  const result = await renderTool.execute("tc1", { preset: "three-tier" }, undefined, undefined, {});
  assert.equal(result.details.ok, true);
  // The stratus_cli handler awaits the async API: a known verb resolves a
  // structured receipt; an unknown verb returns ok:false (never a serialized
  // Promise).
  const cliTool = registered.tools.find((t) => t.name === "stratus_cli");
  assert.ok(cliTool, "stratus_cli registered");
  const cliOk = await cliTool.execute("tc2", { argv: ["doctor"] }, undefined, undefined, {});
  assert.equal(cliOk.details.ok, true, "stratus_cli doctor resolves");
  const cliBad = await cliTool.execute("tc3", { argv: ["definitely-not-a-verb"] }, undefined, undefined, {});
  assert.equal(cliBad.details.ok, false, "unknown verb returns ok:false");
});

test("batch-T behavioral regressions hold", async t => {
  const { runCli } = await import("../src/cli.ts");
  const { compileAnyDiagram } = await import("../src/pipeline.ts");
  const { wrapText } = await import("../src/metrics.ts");
  const { exportDiagram } = await import("../src/export.ts");
  const { getPreset, listPresets } = await import("../src/presets.ts");

  // 1. CLI positional selection: render simple-vpc renders simple-vpc, not
  // three-tier; a nonexistent preset fails cleanly.
  const simple = await runCli(["render", "simple-vpc"], undefined);
  assert.ok(simple.ok, "render simple-vpc ok");
  const threeTier = await runCli(["render", "three-tier"], undefined);
  assert.ok(threeTier.ok, "render three-tier ok");
  assert.notEqual(simple.data.sceneHash, threeTier.data.sceneHash, "simple-vpc and three-tier render different scenes");
  const bad = await runCli(["render", "definitely-not-a-preset"], undefined);
  assert.equal(bad.ok, false, "nonexistent preset fails cleanly");

  // 2. Decoder hardening: malformed inputs fail cleanly, never throw.
  const malformed = [
    ["missing resource label", () => { const s = getPreset("three-tier"); s.cloud.regions[0].vpcs[0].azs[0].subnets[0].resources.push({ id: "x", service: "lambda", placement: { kind: "single-subnet", attachment: { subnetId: "subnet-public-1" } } }); return s; }],
    ["single-subnet without attachment", () => { const s = getPreset("three-tier"); s.cloud.regions[0].vpcs[0].azs[0].subnets[0].resources.push({ id: "y", service: "lambda", label: "L", placement: { kind: "single-subnet" } }); return s; }],
    ["cloud.resources:[null]", () => { const s = getPreset("three-tier"); s.cloud.resources = [null]; return s; }],
    ["null edge endpoint", () => { const s = getPreset("three-tier"); s.edges[0].from = null; return s; }],
  ];
  for (const [name, make] of malformed) {
    try {
      const r = compileAnyDiagram(make(), { theme: "light", interactive: false });
      assert.equal(r.ok, false, `${name} fails cleanly`);
    } catch (err) {
      assert.fail(`${name} threw: ${err.message}`);
    }
  }

  // Azure vnet.subnets is optional — omitted subnets compile (guards).
  const az = getPreset("azure-vnet");
  delete az.cloud.regions[0].vpcs[0].subnets;
  const azR = compileAnyDiagram(az, { theme: "light", interactive: false });
  assert.ok(azR.ok, "azure vnet with omitted subnets compiles (optional)");

  // 3. GCP placement traversal: network-level and geo-level lambda with a
  // nonexistent target is blocked by the placement gate.
  const gcp = getPreset("gcp-network");
  gcp.cloud.networks[0].resources = [{ id: "net-lambda", service: "aws.lambda", label: "L", tier: "compute", placement: { kind: "network", networkId: "vpc-ghost" } }];
  const gcpR = compileAnyDiagram(gcp, { theme: "light", interactive: false });
  assert.equal(gcpR.ok, false, "gcp network-level ghost target blocked");

  // 4. Long-token wrapping: every returned line is bounded.
  const lines = wrapText("W".repeat(200) + " tail", 220, 15);
  for (const l of lines) {
    assert.ok(wrapText.length > 0);
    const { fallbackMaskW } = await import("../src/metrics.ts");
    assert.ok(fallbackMaskW(l, 15) <= 220, `line bounded: ${fallbackMaskW(l, 15)}`);
  }

  // 5. Export abort: a pre-aborted signal rejects before any work.
  const ac = new AbortController();
  ac.abort();
  const aborted = await exportDiagram({ spec: getPreset("simple-vpc"), format: "pdf", outDir: "/tmp/stratus-regression-abort", signal: ac.signal });
  assert.equal(aborted.ok, false, "pre-aborted export rejects");
  assert.equal(aborted.error, "export cancelled");

  // 5b. GCP null resource entries are rejected by decode (resource must be
  // an object) — never crashing normalize or layout.
  const gcpNulls = getPreset("gcp-network");
  gcpNulls.cloud.networks[0].regions[0].subnets[0].resources = [null];
  gcpNulls.cloud.networks[0].regions[0].resources = [null];
  const gcpNullR = compileAnyDiagram(gcpNulls, { theme: "light", interactive: false });
  assert.equal(gcpNullR.ok, false, "GCP null resource entries rejected cleanly");

  // 5c. Transposed card geometry: headings below the title, first row below
  // the headings.
  const lr = compileAnyDiagram(getPreset("three-tier"), { theme: "light", interactive: false, flow: "left-right" });
  assert.ok(lr.ok, "left-right compiles");
  const card = lr.scene.cards[0];
  const headingYs = [...lr.svg.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" font-family="[^"]*" font-size="11" fill="[^"]*" text-anchor="middle">(?:Destination|Target)<\/text>/g)].map((x) => Number(x[1]));
  assert.equal(headingYs.length, 2, "two column headings painted");
  assert.ok(card.headerLineY !== undefined && card.headingsY !== undefined && card.firstRowY !== undefined, "transposed geometry stored");
  const titleMask = lr.scene.labels.find((x) => x.id === card.labelIds[0]);
  for (const hy of headingYs) {
    assert.ok(hy - 11 >= titleMask.mask.y + titleMask.mask.height, `heading below title mask (${hy - 11} >= ${titleMask.mask.y + titleMask.mask.height})`);
    assert.ok(hy <= card.firstRowY - 12, `heading above first row mask (${hy} <= ${card.firstRowY - 12})`);
  }

  // 5d. Adjacent malformed resources fail cleanly (decode rejects, normalize
  // never crashes).
  const adjacent = [
    ["cloud multi-subnet attachments:[null]", () => { const s = getPreset("three-tier"); s.cloud.resources = [{ id: "cr", service: "lambda", label: "L", tier: "compute", placement: { kind: "multi-subnet", attachments: [null] } }]; return s; }],
    ["GCP network single-subnet missing attachment", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].resources = [{ id: "nr", service: "cloud-router", label: "R", tier: "auxiliary", placement: { kind: "single-subnet" } }]; return s; }],
    ["GCP subnet resources:[{}]", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].subnets[0].resources = [{}]; return s; }],
    ["GCP network-region resources:{}", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].resources = {}; return s; }],
  ];
  for (const [name, make] of adjacent) {
    try {
      const r = compileAnyDiagram(make(), { theme: "light", interactive: false });
      assert.equal(r.ok, false, `${name} fails cleanly`);
    } catch (err) {
      assert.fail(`${name} threw: ${err.message}`);
    }
  }

  // 5e. Card titles stay inside their card in both flows (wrapped to the
  // card width, start-anchored).
  for (const flow of ["top-down", "left-right"]) {
    const scene = compileAnyDiagram(getPreset("three-tier"), { theme: "light", interactive: false, flow });
    assert.ok(scene.ok, `${flow} compiles`);
    let worst = 0;
    for (const cd of scene.scene.cards) {
      for (const id of cd.labelIds) {
        const mk = scene.scene.labels.find((x) => x.id === id);
        if (mk) worst = Math.max(worst, (mk.mask.x + mk.mask.width) - (cd.rect.x + cd.rect.width), cd.rect.x - mk.mask.x);
      }
    }
    assert.ok(worst <= 0.5, `${flow}: card labels inside card (max overflow ${worst.toFixed(1)})`);
  }

  // 5f. GCP subnet/region single-subnet placements without attachment and
  // multi-subnet attachments:[null] fail cleanly (decode rejects).
  const gcpPlacements = [
    ["GCP subnet single-subnet no attachment", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].subnets[0].resources = [{ id: "sr", service: "compute-engine", label: "VM", tier: "compute", placement: { kind: "single-subnet" } }]; return s; }],
    ["GCP region single-subnet no attachment", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].resources = [{ id: "rr", service: "cloud-router", label: "R", tier: "auxiliary", placement: { kind: "single-subnet" } }]; return s; }],
    ["GCP subnet multi-subnet attachments:[null]", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].subnets[0].resources = [{ id: "sr", service: "compute-engine", label: "VM", tier: "compute", placement: { kind: "multi-subnet", attachments: [null] } }]; return s; }],
    ["GCP region multi-subnet attachments:[null]", () => { const s = getPreset("gcp-network"); s.cloud.networks[0].regions[0].resources = [{ id: "rr", service: "cloud-router", label: "R", tier: "auxiliary", placement: { kind: "multi-subnet", attachments: [null] } }]; return s; }],
  ];
  for (const [name, make] of gcpPlacements) {
    try {
      const r = compileAnyDiagram(make(), { theme: "light", interactive: false });
      assert.equal(r.ok, false, `${name} fails cleanly`);
    } catch (err) {
      assert.fail(`${name} threw: ${err.message}`);
    }
  }

  // 5g. Renderer wraps labels to the mask width — the painted extent of
  // every text element stays within the canvas.
  for (const flow of ["top-down", "left-right"]) {
    const scene = compileAnyDiagram(getPreset("three-tier"), { theme: "light", interactive: false, flow });
    assert.ok(scene.ok, `${flow} compiles`);
    const texts = [...scene.svg.matchAll(/<text x="([\d.-]+)" y="[\d.-]+" font-family="[^"]*" font-size="([\d.-]+)" fill="[^"]*" text-anchor="middle">\s*((?:<tspan[^>]*>[^<]*<\/tspan>)+)\s*<\/text>/g)];
    assert.ok(texts.length > 0, `${flow} paints wrapped labels`);
    for (const t of texts) {
      const x = Number(t[1]);
      const fs = Number(t[2]);
      const spans = [...t[3].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((s2) => s2[1]);
      const widest = Math.max(...spans.map((s2) => s2.length * fs * 0.52));
      assert.ok(x - widest / 2 >= 0, `${flow}: rendered text starts inside the canvas (${(x - widest / 2).toFixed(1)})`);
    }
  }

  // 5h. Card labels never overlap pairwise and stay inside their card in
  // BOTH flows across ALL presets (top-down rows side-by-side; left-right
  // stacked).
  for (const info of listPresets()) {
    for (const flow of ["top-down", "left-right"]) {
      const scene = compileAnyDiagram(getPreset(info.id), { theme: "light", interactive: false, flow });
      assert.ok(scene.ok, `${info.id} ${flow} compiles`);
      let overlaps = 0, worstOut = 0;
      for (const cd of scene.scene.cards) {
        const labels = cd.labelIds.map((id) => scene.scene.labels.find((x) => x.id === id)).filter(Boolean);
        for (let i = 0; i < labels.length; i++) {
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i].mask;
            const b = labels[j].mask;
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps += 1;
          }
        }
        for (const mk of labels) {
          worstOut = Math.max(worstOut, cd.rect.x - mk.mask.x, (mk.mask.x + mk.mask.width) - (cd.rect.x + cd.rect.width), cd.rect.y - mk.mask.y, (mk.mask.y + mk.mask.height) - (cd.rect.y + cd.rect.height));
        }
      }
      assert.equal(overlaps, 0, `${info.id} ${flow}: no card label overlaps`);
      assert.ok(worstOut <= 0.5, `${info.id} ${flow}: card labels inside card (max overflow ${worstOut.toFixed(1)})`);
    }
  }

  // 5i. Zero intersecting label-mask pairs across ALL presets and proof
  // fixtures in both flows (card labels are fixed anchors; the repair moves
  // the non-card side).
  const { readFileSync } = await import("node:fs");
  const fixtureSpecs = listPresets().map((info) => [info.id, getPreset(info.id)]);
  const diagramDir = new URL("../diagrams/", import.meta.url);
  for (const name of ["eks-ipv6.spec.json", "firewalls-centralized.spec.json", "firewalls-distributed.spec.json", "vpc-lattice.spec.json"]) {
    fixtureSpecs.push([name, JSON.parse(readFileSync(new URL(name, diagramDir), "utf8"))]);
  }
  for (const [name, spec] of fixtureSpecs) {
    for (const flow of ["top-down", "left-right"]) {
      const scene = compileAnyDiagram(spec, { theme: "light", interactive: false, flow });
      assert.ok(scene.ok, `${name} ${flow} compiles`);
      const labels = scene.scene.labels;
      let overlaps = 0;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i].mask;
          const b = labels[j].mask;
          if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps += 1;
        }
      }
      assert.equal(overlaps, 0, `${name} ${flow}: zero intersecting label pairs`);
    }
  }

  // 5i. Headings clear the first row; many-row cards grow to contain their
  // labels; separator lines use the stored baselines.
  {
    const scene = compileAnyDiagram(getPreset("three-tier"), { theme: "light", interactive: false, flow: "top-down" });
    assert.ok(scene.ok, "top-down compiles");
    const cd = scene.scene.cards[0];
    const titleMask = scene.scene.labels.find((x) => x.id === cd.labelIds[0]);
    const dest0 = scene.scene.labels.find((x) => x.id === cd.labelIds[1]);
    assert.ok(dest0.mask.y >= (cd.headingsY ?? 0), `first row below headings (${dest0.mask.y} >= ${cd.headingsY})`);
    // Many-row card: 5 rows grow the card, no overflow.
    const spec5 = getPreset("three-tier");
    const table5 = spec5.cloud.regions[0].vpcs[0].routeTables?.[0];
    if (table5) {
      for (let i = 0; i < 3; i++) {
        table5.rows.push({ id: "row-x" + i, destination: { kind: "cidr", cidr: { value: "10." + i + ".0.0/16" } }, target: { status: "known", value: { kind: "local" } } });
      }
    }
    for (const flow of ["top-down", "left-right"]) {
      const many = compileAnyDiagram(spec5, { theme: "light", interactive: false, flow });
      assert.ok(many.ok, `${flow} many-row compiles`);
      let worstOut = 0;
      for (const c2 of many.scene.cards) {
        for (const id of c2.labelIds) {
          const mk = many.scene.labels.find((x) => x.id === id);
          if (mk) worstOut = Math.max(worstOut, c2.rect.x - mk.mask.x, (mk.mask.x + mk.mask.width) - (c2.rect.x + c2.rect.width), c2.rect.y - mk.mask.y, (mk.mask.y + mk.mask.height) - (c2.rect.y + c2.rect.height));
        }
      }
      assert.ok(worstOut <= 0.5, `${flow} many-row: card labels inside card (${worstOut.toFixed(1)})`);
      assert.ok(many.scene.cards.every((c2) => (c2.rowBaselines ?? []).length > 0 || c2.labelIds.length <= 1), `${flow}: row baselines stored`);
    }
  }

  // 6. Full 8-preset ladder compiles eligible in both flows.
  assert.equal(listPresets().length, 8, "8 presets registered");
  for (const info of listPresets()) {
    for (const flow of ["top-down", "left-right"]) {
      const r = compileAnyDiagram(getPreset(info.id), { theme: "light", interactive: false, flow });
      assert.ok(r.ok, `${info.id} compiles eligible (${flow})`);
    }
  }
});

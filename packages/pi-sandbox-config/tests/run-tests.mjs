// pi-sandbox-config tests. Plain node + jiti (same harness convention as
// pi-voice-clone). Module-level coverage for config + anvil plumbing; the
// cross-check/preview paths run against the REAL anvil validator when a
// sibling anvil checkout is available, and skip otherwise.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? "/data/apps/devtools/node-24.20.0/lib/node_modules/@earendil-works/pi-coding-agent";

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  ({ createJiti } = await import(`${PI_INSTALL_DIR}/node_modules/jiti/lib/jiti.mjs`));
}

const jiti = createJiti(fileURLToPath(new URL("../index.ts", import.meta.url)), {
  moduleCache: false,
  interopDefault: true,
  alias: {
    // typebox has no "main" — alias the module entry directly
    typebox: `${PI_INSTALL_DIR}/node_modules/typebox/build/index.mjs`,
    "@earendil-works/pi-coding-agent": PI_INSTALL_DIR,
  },
});
const configMod = await jiti.import("./src/config.ts");
const anvilMod = await jiti.import("./src/anvil.ts");

const {
  CAPS_PRESETS,
  MAX_CONTAINERS_MAX,
  MAX_CONTAINERS_MIN,
  USER_CONFIG_PATH,
  effectiveConfig,
  projectConfigPath,
  readConfigFile,
  validateConfigDoc,
  writeConfigAtomic,
} = configMod;
const { AnvilError, crossCheckConfig, findSandboxPolicy, resolvePreview } = anvilMod;

const DIGEST = "sha256:" + "a".repeat(64);
const DIGEST_IMAGE = `ghcr.io/example/anvil-pi-sandbox@${DIGEST}`;

// ---------- fixtures ---------------------------------------------------------

function tmpdirCase(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeUserConfig(doc) {
  const home = tmpdirCase("psc-home-");
  mkdirSync(join(home, ".config", "anvil"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, ".config", "anvil", "sandbox.config.json"), JSON.stringify(doc, null, 2) + "\n", { mode: 0o600 });
  return home;
}

function writeProjectConfig(ws, doc) {
  mkdirSync(join(ws, ".pi"), { recursive: true });
  writeFileSync(join(ws, ".pi", "sandbox.config.json"), JSON.stringify(doc, null, 2) + "\n");
}

function makeFakeRepo() {
  const root = tmpdirCase("psc-anvil-");
  mkdirSync(join(root, "packaging", "pi", "sandbox"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "packaging", "pi", "sandbox", "allowlist.json"),
    JSON.stringify({
      version: 1,
      profiles: {
        "unattended-exec": { description: "exec child", tools: ["read"], skills: [], network: "none" },
        "inference-profile": { description: "hypothetical", tools: ["read"], skills: [], network: "inference" },
      },
    }),
  );
  return root;
}

// The real anvil checkout (for live validator cross-checks). Skipped when absent.
function realAnvilRoot() {
  const candidates = [process.env.ANVIL_TEST_ROOT, "/data/workspaces/anvil-sandbox-config-wt", "/data/workspaces/anvil"];
  for (const c of candidates) {
    if (c) {
      try {
        statSync(join(c, "scripts", "pi-sandbox-config.mjs"));
        return c;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failures.push({ name, error: e });
    console.log(`FAIL - ${name}: ${e.message}`);
  }
}

// ---------- validateConfigDoc ------------------------------------------------

await test("user scope: all fields valid", () => {
  const r = validateConfigDoc({ image: DIGEST_IMAGE, network: "none", caps: "docker-default", max_containers: 4 }, "user");
  assert.deepEqual(r, { ok: true, errors: [] });
});

await test("user scope: unknown key refused", () => {
  const r = validateConfigDoc({ volumes: ["/etc"] }, "user");
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /unknown key "volumes"/);
});

await test("image must be digest-pinned (bad forms refused)", () => {
  for (const bad of ["anvil-pi-sandbox:latest", "--privileged", `repo@${"z".repeat(64)}`, "repo@sha256:abc", ""]) {
    const r = validateConfigDoc({ image: bad }, "user");
    assert.equal(r.ok, false, `expected refusal for ${bad}`);
    assert.match(r.errors.join(" "), /digest-pinned/);
  }
});

await test("image: private-registry + tag+digest forms accepted (greptile P2 mirror)", () => {
  const d = DIGEST;
  for (const ref of [
    "localhost:5000/anvil@" + d,
    "registry.example:5000/team/anvil:stable@" + d,
    "registry.example:5000/team/deep/anvil@" + d,
    DIGEST_IMAGE,
  ]) {
    assert.equal(validateConfigDoc({ image: ref }, "user").ok, true, ref);
  }
  for (const bad of ["--privileged", "a b@sha256:" + d, "host:/img@sha256:" + d, "anvil:latest@sha256:"]) {
    assert.equal(validateConfigDoc({ image: bad }, "user").ok, false, bad);
  }
});

await test("network: only none; inference reserved", () => {
  assert.equal(validateConfigDoc({ network: "none" }, "user").ok, true);
  const r = validateConfigDoc({ network: "inference" }, "user");
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /reserved/);
});

await test("caps: presets enforced", () => {
  for (const caps of CAPS_PRESETS) assert.equal(validateConfigDoc({ caps }, "user").ok, true);
  assert.equal(validateConfigDoc({ caps: "keep-net-raw" }, "user").ok, false);
});

await test("max_containers bounds", () => {
  assert.equal(validateConfigDoc({ max_containers: MAX_CONTAINERS_MIN }, "user").ok, true);
  assert.equal(validateConfigDoc({ max_containers: MAX_CONTAINERS_MAX }, "user").ok, true);
  for (const bad of [0, MAX_CONTAINERS_MAX + 1, "3", 1.5]) {
    const r = validateConfigDoc({ max_containers: bad }, "user");
    assert.equal(r.ok, false, `expected refusal for ${JSON.stringify(bad)}`);
    assert.match(r.errors[0], /must be an integer/);
  }
});

await test("project scope: max_containers only — security fields refused", () => {
  assert.deepEqual(validateConfigDoc({ max_containers: 2 }, "project"), { ok: true, errors: [] });
  const r = validateConfigDoc({ image: DIGEST_IMAGE, network: "none", caps: "all-dropped", max_containers: 2 }, "project");
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /trusted-scope only/);
  assert.equal(validateConfigDoc({ caps: "docker-default" }, "project").ok, false);
  assert.equal(validateConfigDoc({ network: "none" }, "project").ok, false);
});

// ---------- readConfigFile -----------------------------------------------------

await test("readConfigFile: missing file → exists:false, ok", () => {
  const r = readConfigFile(join(tmpdirCase("psc-none-"), "x.json"), "user");
  assert.equal(r.exists, false);
  assert.equal(r.validation.ok, true);
});

await test("readConfigFile: malformed JSON flagged", () => {
  const dir = tmpdirCase("psc-bad-");
  const p = join(dir, "c.json");
  writeFileSync(p, "{not json");
  const r = readConfigFile(p, "user");
  assert.equal(r.exists, true);
  assert.equal(r.validation.ok, false);
  assert.match(r.validation.errors[0], /invalid JSON/);
});

await test("readConfigFile: non-object JSON flagged", () => {
  const dir = tmpdirCase("psc-arr-");
  const p = join(dir, "c.json");
  writeFileSync(p, "[1,2]");
  const r = readConfigFile(p, "user");
  assert.match(r.validation.errors[0], /JSON object/);
});

await test("readConfigFile: oversized config refused", () => {
  const dir = tmpdirCase("psc-big-");
  const p = join(dir, "c.json");
  writeFileSync(p, JSON.stringify({ max_containers: 1 }) + " ".repeat(70 * 1024));
  assert.throws(() => readConfigFile(p, "user"), /config cap/);
});

// ---------- writeConfigAtomic --------------------------------------------------

await test("writeConfigAtomic: content + 0600 mode + no tmp leftovers", () => {
  const dir = join(tmpdirCase("psc-write-"), "deep", "nest");
  const p = join(dir, "sandbox.config.json");
  writeConfigAtomic(p, { caps: "docker-default" });
  assert.equal(readConfigFile(p, "user").doc.caps, "docker-default");
  assert.equal(statSync(p).mode & 0o777, 0o600);
  const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftovers, []);
});

// ---------- effectiveConfig ----------------------------------------------------

await test("effectiveConfig: defaults when nothing saved", () => {
  const eff = effectiveConfig(
    { path: "u", exists: false, doc: null, validation: { ok: true, errors: [] } },
    { path: "p", exists: false, doc: null, validation: { ok: true, errors: [] } },
  );
  assert.equal(eff.image, "");
  assert.equal(eff.caps, "all-dropped");
  assert.equal(eff.maxContainers, null);
  assert.equal(eff.source, "defaults");
});

await test("effectiveConfig: trusted caps/image apply; min-max merge both ways", () => {
  const mkUser = (doc) => ({ path: "u", exists: true, doc, validation: validateConfigDoc(doc, "user") });
  const mkProj = (doc) => ({ path: "p", exists: true, doc, validation: validateConfigDoc(doc, "project") });
  const eff = effectiveConfig(mkUser({ caps: "docker-default", image: DIGEST_IMAGE, max_containers: 4 }), mkProj({ max_containers: 2 }));
  assert.equal(eff.caps, "docker-default");
  assert.equal(eff.image, DIGEST_IMAGE);
  assert.equal(eff.maxContainers, 2);
  const eff2 = effectiveConfig(mkUser({ max_containers: 4 }), mkProj({ max_containers: 9 }));
  assert.equal(eff2.maxContainers, 4);
  assert.match(eff2.source, /project\(max_containers\)/);
});

await test("effectiveConfig: invalid trusted doc ignored (defaults)", () => {
  const bad = { path: "u", exists: true, doc: { caps: "nonsense" }, validation: { ok: false, errors: ["bad"] } };
  const eff = effectiveConfig(bad, null);
  assert.equal(eff.caps, "all-dropped");
});

// ---------- anvil discovery + live validator ------------------------------------

await test("findSandboxPolicy: explicit allowlist env", () => {
  const root = makeFakeRepo();
  process.env.ANVIL_SANDBOX_ALLOWLIST = join(root, "packaging", "pi", "sandbox", "allowlist.json");
  delete process.env.ANVIL_CHECKOUT;
  try {
    const p = findSandboxPolicy("/tmp");
    assert.ok(p);
    assert.deepEqual(p.profiles.map((x) => x.name).sort(), ["inference-profile", "unattended-exec"]);
    assert.equal(p.profiles[0].network, "none");
  } finally {
    delete process.env.ANVIL_SANDBOX_ALLOWLIST;
    rmSync(root, { recursive: true, force: true });
  }
});

await test("findSandboxPolicy: ANVIL_CHECKOUT env", () => {
  const root = makeFakeRepo();
  process.env.ANVIL_CHECKOUT = root;
  delete process.env.ANVIL_SANDBOX_ALLOWLIST;
  try {
    assert.ok(findSandboxPolicy("/tmp"));
  } finally {
    delete process.env.ANVIL_CHECKOUT;
    rmSync(root, { recursive: true, force: true });
  }
});

await test("findSandboxPolicy: walk-up discovery from nested cwd", () => {
  const root = makeFakeRepo();
  delete process.env.ANVIL_CHECKOUT;
  delete process.env.ANVIL_SANDBOX_ALLOWLIST;
  try {
    const deep = join(root, "a", "b", "c");
    mkdirSync(deep, { recursive: true });
    const p = findSandboxPolicy(deep);
    assert.ok(p, "expected walk-up to find the fixture repo");
    assert.equal(p.repoRoot, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("findSandboxPolicy: nothing found → null", () => {
  delete process.env.ANVIL_CHECKOUT;
  delete process.env.ANVIL_SANDBOX_ALLOWLIST;
  const isolated = tmpdirCase("psc-isolated-");
  const prevHome = process.env.HOME;
  process.env.HOME = isolated; // defeat the ~/code/anvil default fallback
  try {
    assert.equal(findSandboxPolicy(isolated), null);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(isolated, { recursive: true, force: true });
  }
});

await test("buildPolicy: allowlist without profiles refused", async () => {
  const root = tmpdirCase("psc-empty-");
  const al = join(root, "packaging", "pi", "sandbox", "allowlist.json");
  mkdirSync(join(root, "packaging", "pi", "sandbox"), { recursive: true });
  writeFileSync(al, JSON.stringify({ version: 1, profiles: {} }));
  process.env.ANVIL_SANDBOX_ALLOWLIST = al;
  try {
    assert.throws(() => findSandboxPolicy("/tmp"), /exposes no profiles/);
  } finally {
    delete process.env.ANVIL_SANDBOX_ALLOWLIST;
    rmSync(root, { recursive: true, force: true });
  }
});

const liveRoot = realAnvilRoot();
if (liveRoot) {
  await test("crossCheckConfig: valid bytes pass against the REAL validator", async () => {
    const policy = findSandboxPolicy(liveRoot);
    const dir = tmpdirCase("psc-cc-");
    const p = join(dir, "sandbox.config.json");
    writeFileSync(p, JSON.stringify({ caps: "docker-default", max_containers: 4 }));
    const cc = await crossCheckConfig(policy, p, { profile: "unattended-exec" });
    assert.equal(cc.ok, true, cc.message);
    rmSync(dir, { recursive: true, force: true });
  });

  await test("crossCheckConfig: invalid bytes fail against the REAL validator", async () => {
    const policy = findSandboxPolicy(liveRoot);
    const dir = tmpdirCase("psc-cc2-");
    const p = join(dir, "sandbox.config.json");
    writeFileSync(p, JSON.stringify({ image: "unpinned:latest" }));
    const cc = await crossCheckConfig(policy, p, { profile: "unattended-exec" });
    assert.equal(cc.ok, false);
    assert.match(cc.message, /digest-pinned/);
    rmSync(dir, { recursive: true, force: true });
  });

  await test("resolvePreview: defaults match the anvil resolver", async () => {
    const policy = findSandboxPolicy(liveRoot);
    const ws = tmpdirCase("psc-ws-");
    const preview = await resolvePreview(policy, { profile: "unattended-exec", workspace: ws });
    assert.equal(preview.network, "none");
    assert.equal(preview.caps, "all-dropped");
    assert.equal(preview.maxContainers, "");
    assert.equal(preview.configSource, "defaults");
    rmSync(ws, { recursive: true, force: true });
  });

  await test("resolvePreview: refuses unknown profile", async () => {
    const policy = findSandboxPolicy(liveRoot);
    const ws = tmpdirCase("psc-ws2-");
    await assert.rejects(
      () => resolvePreview(policy, { profile: "nope", workspace: ws }),
      (e) => e instanceof AnvilError && /not found/.test(e.message),
    );
    rmSync(ws, { recursive: true, force: true });
  });
} else {
  console.log("skip - live anvil validator tests (no sibling checkout found)");
}

// ---------- harness shape (imports resolve; registrations present) --------------

await test("index.ts registers 3 tools + /sandbox", async () => {
  const tools = [];
  const commands = [];
  const fakePi = {
    registerTool: (t) => tools.push(t.name),
    registerCommand: (name) => commands.push(name),
    registerShortcut: () => {},
    registerFlag: () => {},
    on: () => {},
  };
  const mod = await jiti.import("../index.ts");
  const def = mod.default ?? mod;
  await def(fakePi);
  assert.deepEqual([...tools].sort(), ["sandbox_config_read", "sandbox_config_write", "sandbox_precheck"]);
  assert.deepEqual(commands, ["sandbox"]);
});

// ---------- summary -------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.error.stack}`);
  process.exit(1);
}
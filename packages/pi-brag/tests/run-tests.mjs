// pi-brag — offline logic + wiring tests. Plain node + jiti.
// Run: node tests/run-tests.mjs
// No network, no engine calls, no real ffmpeg: all process execution is
// injected; filesystem tests use planted temp trees.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

const execFileP = promisify(execFileCb);

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? (() => {
    // pi-coding-agent is a root devDependency; its ESM "." export resolves,
    // and the bundle dir (with nested jiti/pi-tui/typebox) sits above it.
    let dir = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
    while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
    return dir;
  })();

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  ({ createJiti } = await import(`${PI_INSTALL_DIR}/node_modules/jiti/lib/jiti.mjs`));
}

const pkgRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const jiti = createJiti(join(pkgRoot, "index.ts"), {
  interopDefault: true,
  fsCache: false,
  alias: {
    "@earendil-works/pi-tui": `${PI_INSTALL_DIR}/node_modules/@earendil-works/pi-tui`,
    "@earendil-works/pi-ai": `${PI_INSTALL_DIR}/node_modules/@earendil-works/pi-ai`,
  },
});

const flags = await jiti.import("../src/flags.ts");
const paths = await jiti.import("../src/paths.ts");
const doctor = await jiti.import("../src/doctor.ts");
const render = await jiti.import("../src/render.ts");
const poster = await jiti.import("../src/poster.ts");
const fetchAssetsMod = await jiti.import("../src/fetch-assets.ts");
const indexMod = await jiti.import("../index.ts");

let passed = 0;
async function atest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function plantTree(base, entries) {
  for (const [rel, content] of Object.entries(entries)) {
    const file = join(base, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content ?? "x");
  }
}

// --- flags -------------------------------------------------------------------

await atest("flags: tokenize respects quotes", async () => {
  assert.deepEqual(flags.tokenize('a "b c" \'d e\' f'), ["a", "b c", "d e", "f"]);
  assert.deepEqual(flags.tokenize(""), []);
});

await atest("flags: contractions do not open quoted spans", async () => {
  // An apostrophe inside a word is a literal character, not a quote opener.
  assert.deepEqual(flags.tokenize("make it feel like it's alive --no-music"), ["make", "it", "feel", "like", "it's", "alive", "--no-music"]);
  const opts = flags.parseBragInvocation("make it feel like it's alive --no-music");
  assert.equal(opts.music, false);
  assert.equal(opts.direction, "make it feel like it's alive");
  // A quote that opens a token still spans whitespace; unmatched keeps the rest.
  assert.deepEqual(flags.tokenize("'hello world"), ["hello world"]);
});

await atest("flags: empty invocation -> defaults", async () => {
  const opts = flags.parseBragInvocation("");
  assert.equal(opts.music, true);
  assert.equal(opts.sfx, true);
  assert.equal(opts.voice, false);
  assert.equal(opts.tone, undefined);
  assert.equal(opts.format, undefined);
  assert.equal(opts.duration, undefined);
  assert.deepEqual(opts.unknownFlags, []);
});

await atest("flags: tone preset vs freeform", async () => {
  assert.equal(flags.parseBragInvocation("--tone chaotic").tonePreset, "chaotic");
  const free = flags.parseBragInvocation('--tone "fake Series A launch from 2016"');
  assert.equal(free.tone, "fake Series A launch from 2016");
  assert.equal(free.tonePreset, undefined);
});

await atest("flags: format validation", async () => {
  assert.equal(flags.parseBragInvocation("--format vertical").format, "vertical");
  assert.equal(flags.parseBragInvocation("--format=square").format, "square");
  const bad = flags.parseBragInvocation("--format widescreen");
  assert.equal(bad.format, undefined);
  assert.ok(bad.unknownFlags[0].includes("widescreen"));
});

await atest("flags: duration clamp + malformed", async () => {
  assert.equal(flags.parseBragInvocation("--duration 20").duration, 20);
  const high = flags.parseBragInvocation("--duration 200");
  assert.equal(high.duration, flags.DURATION_MAX);
  assert.equal(high.durationClamped, true);
  const low = flags.parseBragInvocation("--duration 2");
  assert.equal(low.duration, flags.DURATION_MIN);
  assert.equal(low.durationClamped, true);
  assert.equal(flags.parseBragInvocation("--duration 30s").duration, 30);
  const bad = flags.parseBragInvocation("--duration abc");
  assert.equal(bad.duration, undefined);
  assert.ok(bad.unknownFlags[0].includes("abc"));
});

await atest("flags: boolean flags and title", async () => {
  const opts = flags.parseBragInvocation("--no-music --no-sfx --voice --title 'Ship It'");
  assert.equal(opts.music, false);
  assert.equal(opts.sfx, false);
  assert.equal(opts.voice, true);
  assert.equal(opts.title, "Ship It");
});

await atest("flags: freeform direction + unknown flags", async () => {
  const opts = flags.parseBragInvocation("--foo bar make it feel like a ridiculous startup launch");
  assert.equal(opts.direction, "bar make it feel like a ridiculous startup launch");
  assert.deepEqual(opts.unknownFlags, ["--foo"]);
});

await atest("flags: missing values land in unknownFlags", async () => {
  const opts = flags.parseBragInvocation("--tone");
  assert.equal(opts.tone, undefined);
  assert.equal(opts.unknownFlags.length, 1);
  assert.ok(opts.unknownFlags[0].includes("--tone"));
});

await atest("flags: empty = values and boolean-with-value land in unknownFlags", async () => {
  const empty = flags.parseBragInvocation("--tone= --title=");
  assert.equal(empty.tone, undefined);
  assert.equal(empty.title, undefined);
  assert.equal(empty.unknownFlags.length, 2);
  const boolVal = flags.parseBragInvocation("--no-music=true --voice=false");
  assert.equal(boolVal.music, true);
  assert.equal(boolVal.voice, false);
  assert.equal(boolVal.unknownFlags.length, 2);
});

await atest("flags: formatBragOptions covers resolved options", async () => {
  const lines = flags.formatBragOptions(flags.parseBragInvocation("--tone polished --format vertical --duration 20 --no-music extra direction"));
  const joined = lines.join("\n");
  assert.ok(joined.includes("Tone: polished (preset)"));
  assert.ok(joined.includes("Format: vertical (1080x1920)"));
  assert.ok(joined.includes("Duration: 20s"));
  assert.ok(joined.includes("Music: off"));
  assert.ok(joined.includes("Voiceover: off"));
  assert.ok(joined.includes("Creative direction: extra direction"));
});

// --- paths -------------------------------------------------------------------

await atest("paths: package layout resolves inside the package", async () => {
  assert.ok(existsSync(paths.PACKAGE_ROOT));
  assert.ok(existsSync(paths.SKILL_ENTRY));
  assert.ok(paths.DEFAULT_ASSETS_DIR.endsWith(join("skills", "brag", "assets")));
});

await atest("paths: inventoryAssets counts planted tree (upstream layout)", async () => {
  const base = mkdtempSync(join(tmpdir(), "brag-inv-"));
  try {
    plantTree(base, {
      "music/a.mp3": "a",
      "music/b.mp3": "b",
      "music/README.md": "readme",
      "music/cues/a.music-cues.json": "{}",
      "music/cues/a.music-cues.md": "cues",
      "music/cues/b.music-cues.json": "{}",
      "sfx/interface/x.ogg": "x",
      "sfx/keyboard/y.ogg": "y",
      "sfx/sfx-analysis.md": "analysis",
    });
    mkdirSync(join(base, "sfx", "empty"), { recursive: true }); // truly empty dir -> excluded
    const inv = paths.inventoryAssets(base);
    assert.equal(inv.present, true);
    // README.md is not a track; only audio extensions count.
    assert.deepEqual(inv.music, ["a.mp3", "b.mp3"]);
    assert.deepEqual(inv.sfxDirs, ["interface", "keyboard"]);
    assert.equal(inv.sfxFiles, 2);
    assert.deepEqual(inv.cues, ["a.music-cues.json", "b.music-cues.json"]);
    assert.equal(inv.hasSfxAnalysis, true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

await atest("paths: inventoryAssets tolerates missing dir", async () => {
  const inv = paths.inventoryAssets(join(tmpdir(), "brag-does-not-exist-xyz"));
  assert.equal(inv.present, false);
  assert.equal(inv.music.length, 0);
  assert.equal(inv.sfxFiles, 0);
});

await atest("paths: findDomainSkill scans standard dirs", async () => {
  const home = mkdtempSync(join(tmpdir(), "brag-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "brag-cwd-"));
  try {
    assert.equal(paths.findDomainSkill("hyperframes-core", home, cwd), null);
    plantTree(home, { ".pi/agent/skills/hyperframes-core/SKILL.md": "# core" });
    const found = paths.findDomainSkill("hyperframes-core", home, cwd);
    assert.ok(found && found.includes(join(".pi", "agent", "skills", "hyperframes-core")));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

await atest("paths: augmentPath appends only existing extra dirs, deduped", async () => {
  const home = mkdtempSync(join(tmpdir(), "brag-path-home-"));
  try {
    // Only .pi/agent/bin exists in the planted home; .local/bin does not.
    plantTree(home, { ".pi/agent/bin/ffmpeg": "#!sh\n" });
    const piBin = join(home, ".pi", "agent", "bin");
    const localBin = join(home, ".local", "bin");
    const out = paths.augmentPath("/usr/bin:/bin", { home, delimiter: ":" });
    assert.equal(out, `/usr/bin:/bin:${piBin}`);
    // Already-present entries are not duplicated.
    assert.equal(paths.augmentPath(`/bin:${piBin}`, { home, delimiter: ":" }), `/bin:${piBin}`);
    // A missing PATH becomes just the existing extras.
    assert.equal(paths.augmentPath(undefined, { home, delimiter: ":" }), piBin);
    // Pure exists override: both extras appended in order.
    const both = paths.augmentPath("", { home, exists: () => true, delimiter: ":" });
    assert.equal(both, `${piBin}:${localBin}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

await atest("paths: childEnv augments the PATH-like key without mutating input", async () => {
  const home = mkdtempSync(join(tmpdir(), "brag-env-home-"));
  try {
    plantTree(home, { ".local/bin/.keep": "" });
    const localBin = join(home, ".local", "bin");
    // Windows-style casing is preserved.
    const winEnv = Object.freeze({ Path: "C:\\Windows", HOME: home });
    const winOut = paths.childEnv(winEnv, { home, delimiter: ":" });
    assert.ok(winOut.Path.includes(localBin));
    assert.equal(winOut.Path, `C:\\Windows:${localBin}`);
    assert.equal(winEnv.Path, "C:\\Windows"); // input untouched
    // POSIX default key.
    const posixOut = paths.childEnv({ PATH: "/usr/bin", HOME: home }, { home, delimiter: ":" });
    assert.equal(posixOut.PATH, `/usr/bin:${localBin}`);
    // No PATH at all still yields an augmented PATH key.
    const bare = paths.childEnv({ HOME: home }, { home, delimiter: ":" });
    assert.equal(bare.PATH, localBin);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// --- doctor ------------------------------------------------------------------

const okExec = async (cmd) =>
  cmd === "ffmpeg"
    ? { code: 0, stdout: "ffmpeg version 7.1.1", stderr: "" }
    : { code: 0, stdout: "ffprobe version 7.1.1", stderr: "" };

await atest("doctor: all-ok report with injected deps", async () => {
  const home = mkdtempSync(join(tmpdir(), "brag-doc-home-"));
  const assets = mkdtempSync(join(tmpdir(), "brag-doc-assets-"));
  try {
    plantTree(home, { ".agents/skills/hyperframes-core/SKILL.md": "# core" });
    plantTree(assets, { "music/t.mp3": "m", "sfx/ui/click.ogg": "c" });
    const report = await doctor.runDoctor({
      exec: okExec,
      home,
      cwd: home,
      assetsDir: assets,
      nodeVersion: "v24.20.0",
      skipEngineProbe: true,
    });
    assert.equal(report.ok, true);
    assert.equal(report.okCount, report.total);
    const names = report.checks.map((c) => c.name);
    assert.ok(names.includes("node") && names.includes("ffmpeg") && names.includes("skill assets") && names.includes("engine domain skills"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(assets, { recursive: true, force: true });
  }
});

await atest("doctor: missing ffmpeg carries install hint", async () => {
  const report = await doctor.runDoctor({
    exec: async (cmd) => (cmd === "ffmpeg" ? { code: null, stdout: "", stderr: "", error: "not found: ffmpeg" } : { code: 0, stdout: "", stderr: "" }),
    home: tmpdir(),
    cwd: tmpdir(),
    assetsDir: join(tmpdir(), "brag-no-assets"),
    nodeVersion: "v24.20.0",
    skipEngineProbe: true,
  });
  const ffmpeg = report.checks.find((c) => c.name === "ffmpeg");
  assert.equal(ffmpeg.ok, false);
  assert.ok(ffmpeg.hint.includes("ffmpeg"));
  assert.equal(report.ok, false);
});

await atest("doctor: nonzero-exit ffmpeg/ffprobe is not healthy", async () => {
  const brokenFfmpeg = await doctor.runDoctor({
    exec: async (cmd) => (cmd === "ffmpeg" ? { code: 1, stdout: "", stderr: "segmentation fault" } : { code: 0, stdout: "", stderr: "" }),
    home: tmpdir(),
    cwd: tmpdir(),
    assetsDir: join(tmpdir(), "brag-no-assets"),
    nodeVersion: "v24.20.0",
    skipEngineProbe: true,
  });
  const ffmpeg = brokenFfmpeg.checks.find((c) => c.name === "ffmpeg");
  assert.equal(ffmpeg.ok, false);
  assert.ok(ffmpeg.detail.includes("broken"));

  const brokenProbe = await doctor.runDoctor({
    exec: async (cmd) => (cmd === "ffmpeg" ? { code: 0, stdout: "ffmpeg version 7.1\n", stderr: "" } : { code: 1, stdout: "", stderr: "ffprobe crashed" }),
    home: tmpdir(),
    cwd: tmpdir(),
    assetsDir: join(tmpdir(), "brag-no-assets"),
    nodeVersion: "v24.20.0",
    skipEngineProbe: true,
  });
  const probe = brokenProbe.checks.find((c) => c.name === "ffmpeg");
  assert.equal(probe.ok, false);
  assert.ok(probe.detail.includes("ffprobe"));
});

await atest("doctor: old node fails the runtime check", async () => {
  const report = await doctor.runDoctor({
    exec: okExec,
    home: tmpdir(),
    cwd: tmpdir(),
    assetsDir: join(tmpdir(), "brag-no-assets"),
    nodeVersion: "v18.0.0",
    skipEngineProbe: true,
  });
  assert.equal(report.checks.find((c) => c.name === "node").ok, false);
});

await atest("doctor: missing assets point at brag_fetch_assets", async () => {
  const report = await doctor.runDoctor({
    exec: okExec,
    home: tmpdir(),
    cwd: tmpdir(),
    assetsDir: join(tmpdir(), "brag-no-assets"),
    nodeVersion: "v24.20.0",
    skipEngineProbe: true,
  });
  const assets = report.checks.find((c) => c.name === "skill assets");
  assert.equal(assets.ok, false);
  assert.ok(assets.hint.includes("brag_fetch_assets"));
});

await atest("doctor: formatReport renders FAIL lines and hints", async () => {
  const text = doctor.formatReport({
    checks: [{ name: "ffmpeg", ok: false, detail: "not on PATH", hint: "install ffmpeg" }],
    ok: false,
    okCount: 0,
    total: 1,
  });
  assert.ok(text.includes("brag doctor: 0/1"));
  assert.ok(text.includes("FAIL ffmpeg"));
  assert.ok(text.includes("hint: install ffmpeg"));
});

// --- render ------------------------------------------------------------------

class FakeChild extends EventEmitter {
  constructor({ pid = 4242, neverClose = false } = {}) {
    super();
    this.pid = pid;
    this.neverClose = neverClose;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.signalCode = null;
    this.killCalls = [];
  }
  kill(sig) {
    this.killCalls.push(sig ?? "SIGTERM");
    if (this.neverClose) return; // emulate descendants holding the pipes
    // A real child dies shortly after SIGTERM; emulate that so runners resolve.
    setTimeout(() => this.close(null, sig ?? "SIGTERM"), 5);
  }
  close(code, sig) {
    this.exitCode = code;
    this.signalCode = sig ?? null;
    this.emit("close", code, sig ?? null);
  }
}

await atest("render: buildHyperframesArgs maps subcommands", async () => {
  assert.deepEqual(render.buildHyperframesArgs({ subcommand: "check" }), ["hyperframes", "check"]);
  assert.deepEqual(render.buildHyperframesArgs({ subcommand: "render" }), ["hyperframes", "render", "--output", "../brag.mp4"]);
  assert.deepEqual(
    render.buildHyperframesArgs({ subcommand: "render", quality: "high", output: "../out.mp4", args: ["--no-open"] }),
    ["hyperframes", "render", "--output", "../out.mp4", "--quality", "high", "--no-open"],
  );
});

await atest("render: validateCwd rejects missing/non-directory", async () => {
  assert.throws(() => render.validateCwd(join(tmpdir(), "brag-missing-cwd")), /does not exist/);
  assert.throws(() => render.validateCwd(join(pkgRoot, "package.json")), /not a directory/);
  render.validateCwd(pkgRoot); // does not throw
});

await atest("render: successful run streams and resolves", async () => {
  const child = new FakeChild();
  const updates = [];
  const spawnFn = () => child;
  const promise = render.runHyperframes({ subcommand: "check", cwd: pkgRoot }, (u) => updates.push(u.text), undefined, { spawnFn });
  await new Promise((r) => setTimeout(r, 20));
  child.stdout.emit("data", Buffer.from("checking contrast... ok"));
  child.close(0, null);
  const result = await promise;
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdoutTail.includes("checking contrast"));
  assert.ok(updates.length >= 1);
  assert.ok(updates.some((t) => t.includes("checking contrast")));
});

await atest("render: timeout kills the child and reports timedOut", async () => {
  const child = new FakeChild();
  const promise = render.runHyperframes({ subcommand: "render", cwd: pkgRoot, timeoutSeconds: 0.05 }, undefined, undefined, { spawnFn: () => child });
  const result = await promise;
  assert.equal(result.timedOut, true);
  assert.equal(result.ok, false);
  assert.ok(child.killCalls.includes("SIGTERM"));
});

await atest("render: abort signal kills the child and reports aborted", async () => {
  const child = new FakeChild();
  const controller = new AbortController();
  const promise = render.runHyperframes({ subcommand: "render", cwd: pkgRoot, timeoutSeconds: 30 }, undefined, controller.signal, { spawnFn: () => child });
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  const result = await promise;
  assert.equal(result.aborted, true);
  assert.equal(result.ok, false);
  assert.ok(child.killCalls.length >= 1);
});

await atest("render: non-zero exit is a structured failure", async () => {
  const child = new FakeChild();
  const promise = render.runHyperframes({ subcommand: "check", cwd: pkgRoot }, undefined, undefined, { spawnFn: () => child });
  await new Promise((r) => setTimeout(r, 10));
  child.stderr.emit("data", Buffer.from("contrast failure: #777 on #999"));
  child.close(1, null);
  const result = await promise;
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderrTail.includes("contrast failure"));
});

await atest("render: spawns detached on POSIX so kills reach the whole tree", async () => {
  const child = new FakeChild();
  const seen = [];
  const spawnFn = (cmd, argv, opts) => {
    seen.push({ cmd, argv, opts });
    return child;
  };
  const promise = render.runHyperframes({ subcommand: "check", cwd: pkgRoot }, undefined, undefined, { spawnFn });
  await new Promise((r) => setTimeout(r, 10));
  child.close(0, null);
  await promise;
  assert.equal(seen[0].cmd, "npx");
  if (process.platform !== "win32") assert.equal(seen[0].opts.detached, true);
});

await atest("render: spawned engine gets an augmented child env", async () => {
  const home = mkdtempSync(join(tmpdir(), "brag-render-home-"));
  try {
    plantTree(home, { ".pi/agent/bin/ffmpeg": "#!sh\n" });
    const piBin = join(home, ".pi", "agent", "bin");
    const child = new FakeChild();
    const seen = [];
    const spawnFn = (cmd, argv, opts) => {
      seen.push({ cmd, argv, opts });
      return child;
    };
    const promise = render.runHyperframes(
      { subcommand: "check", cwd: pkgRoot },
      undefined,
      undefined,
      { spawnFn, childEnvOpts: { home, delimiter: ":" } },
    );
    await new Promise((r) => setTimeout(r, 10));
    child.close(0, null);
    const result = await promise;
    assert.ok(result.ok);
    const opts = seen[0].opts;
    assert.ok(opts.env, "child receives an env");
    // Case-insensitive key lookup: Windows-style envs keep the `Path` casing.
    const pathKey = Object.keys(opts.env).find((k) => k.toUpperCase() === "PATH");
    assert.ok(pathKey, "child env has a PATH-like key");
    const pathValue = opts.env[pathKey];
    assert.ok(typeof pathValue === "string" && pathValue.length > 0, "child PATH is a non-empty string");
    // The planted user-bin dir is appended after the parent PATH (paths-level
    // dedupe/missing-dir handling is covered by the paths tests above).
    const parentPath = process.env.PATH ?? "";
    assert.ok(pathValue.startsWith(parentPath), "parent PATH is preserved as a prefix");
    assert.ok(pathValue.endsWith(piBin), "planted ~/.pi/agent/bin is appended");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

await atest("render: settle guard finishes after kill even when close never fires", async () => {
  // Descendants inheriting stdio keep 'close' pending forever after a kill;
  // the runner must still settle instead of hanging the tool.
  const child = new FakeChild({ pid: 2140000000, neverClose: true });
  const promise = render.runHyperframes(
    { subcommand: "check", cwd: pkgRoot, timeoutSeconds: 0.05 },
    undefined,
    undefined,
    { spawnFn: () => child, settleGraceMs: 50 },
  );
  const result = await promise;
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, "SIGKILL");
  assert.ok(child.killCalls.includes("SIGTERM"));
});

await atest("render: appendBounded keeps only the tail within the cap", async () => {
  const cap = 64 * 1024;
  const kept = render.appendBounded("", "x".repeat(70_000));
  assert.equal(kept.length, cap);
  assert.ok(kept.endsWith("x".repeat(10)));
  const both = render.appendBounded(render.appendBounded("", "a".repeat(60_000)), "b".repeat(10_000));
  assert.equal(both.length, cap);
  assert.ok(both.endsWith("b".repeat(10_000)));
  assert.ok(render.appendBounded("short", " chunk").startsWith("short chunk"));
});

// --- poster ------------------------------------------------------------------

await atest("poster: command builders match the upstream recipe", async () => {
  assert.deepEqual(
    poster.buildExtractArgs("../brag.mp4", 3.2, "../brag.jpg"),
    ["-y", "-ss", "3.2", "-i", "../brag.mp4", "-frames:v", "1", "-q:v", "2", "../brag.jpg"],
  );
  const bake = poster.buildBakeArgs("brag.mp4", "brag.jpg", ".brag.bake.mp4");
  assert.ok(bake.includes("-filter_complex"));
  assert.ok(bake.includes("[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]"));
  assert.ok(bake.includes("-c:a"));
  assert.ok(bake.includes("copy"));
});

await atest("poster: makePoster extracts and bakes atomically", async () => {
  const calls = [];
  const renames = [];
  const result = await poster.makePoster(
    { video: "brag.mp4", timestamp: 3.2 },
    {
      run: async (args) => {
        calls.push(args);
        return { code: 0, stderr: "" };
      },
      exists: () => true,
      rename: (from, to) => renames.push([from, to]),
    },
  );
  assert.equal(result.baked, true);
  assert.equal(calls.length, 2);
  assert.equal(renames.length, 1);
  assert.ok(renames[0][1].endsWith("brag.mp4"));
  assert.ok(renames[0][0].includes(".bake.mp4"));
});

await atest("poster: bake failure keeps video untouched", async () => {
  const renames = [];
  let call = 0;
  const result = await poster.makePoster(
    { video: "brag.mp4", timestamp: 1 },
    {
      run: async () => (++call === 1 ? { code: 0, stderr: "" } : { code: 1, stderr: "boom" }),
      exists: () => true,
      rename: (from, to) => renames.push([from, to]),
    },
  );
  assert.equal(result.baked, false);
  assert.ok(result.bakeError.includes("frame-0 bake failed"));
  assert.equal(renames.length, 0);
});

await atest("poster: validation errors", async () => {
  await assert.rejects(
    () => poster.makePoster({ video: "missing.mp4", timestamp: 1 }, { exists: () => false }),
    /not found/,
  );
  await assert.rejects(
    () => poster.makePoster({ video: "x.mp4", timestamp: -1 }, { exists: () => true }),
    /timestamp/,
  );
});

await atest("poster: default poster path sits beside the video", async () => {
  assert.equal(poster.defaultPosterPath("brag-output/brag.mp4"), join("brag-output", "brag.jpg"));
});

// --- fetch-assets ------------------------------------------------------------

function makeBody(text) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeErroringBody() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial bytes"));
      controller.error(new Error("connection reset mid-stream"));
    },
  });
}

await atest("fetch-assets: tarball url and extraction locator", async () => {
  // Default ref is the pinned upstream commit; classic codeload form resolves
  // branches, tags, and SHAs alike.
  assert.equal(
    fetchAssetsMod.tarballUrl(),
    "https://codeload.github.com/latent-spaces/brag/tar.gz/1f8d9ade17d0ad4419cca9305fbc1398a4dd5b39",
  );
  assert.equal(fetchAssetsMod.tarballUrl("v0.2.2"), "https://codeload.github.com/latent-spaces/brag/tar.gz/v0.2.2");

  const root = mkdtempSync(join(tmpdir(), "brag-extract-"));
  try {
    assert.equal(fetchAssetsMod.locateExtractedAssets(root), null);
    plantTree(root, { "brag-main/skills/brag/assets/music/t.mp3": "m" });
    const found = fetchAssetsMod.locateExtractedAssets(root);
    assert.ok(found && found.includes(join("skills", "brag", "assets")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await atest("render: default timeouts match the documented values", async () => {
  assert.deepEqual(render.DEFAULT_TIMEOUT_SECONDS, {
    check: 120,
    render: 1200,
    snapshot: 120,
    beats: 120,
    preview: 1200,
    tts: 300,
    doctor: 120,
  });
});

await atest("render: summarizeRun covers ok/timeout/abort/failure", async () => {
  const base = { command: "npx hyperframes check", exitCode: 0, signal: null, stdoutTail: "", stderrTail: "", durationMs: 1500 };
  assert.ok(render.summarizeRun({ ...base, ok: true, timedOut: false, aborted: false }, 120).includes("ok (exit 0, 1.5s)"));
  const timeoutLine = render.summarizeRun({ ...base, ok: false, timedOut: true, aborted: false, exitCode: null }, 120);
  assert.ok(timeoutLine.includes("TIMED OUT after 120s"));
  const defaultTimeoutLine = render.summarizeRun({ ...base, ok: false, timedOut: true, aborted: false, exitCode: null }, undefined);
  assert.ok(defaultTimeoutLine.includes("the configured limit"));
  assert.ok(render.summarizeRun({ ...base, ok: false, timedOut: false, aborted: true, exitCode: null }).includes("aborted"));
  assert.ok(render.summarizeRun({ ...base, ok: false, timedOut: false, aborted: false, exitCode: 1 }).includes("exit 1"));
});

await atest("render: pre-aborted signal never spawns", async () => {
  const controller = new AbortController();
  controller.abort();
  let spawned = false;
  const result = await render.runHyperframes({ subcommand: "check", cwd: pkgRoot }, undefined, controller.signal, {
    spawnFn: () => {
      spawned = true;
      return new FakeChild();
    },
  });
  assert.equal(spawned, false);
  assert.equal(result.aborted, true);
  assert.equal(result.ok, false);
});

await atest("render: stream buffers are capped", async () => {
  const child = new FakeChild();
  const promise = render.runHyperframes({ subcommand: "check", cwd: pkgRoot }, undefined, undefined, { spawnFn: () => child });
  await new Promise((r) => setTimeout(r, 20));
  child.stdout.emit("data", Buffer.from("x".repeat(200 * 1024)));
  child.close(0, null);
  const result = await promise;
  assert.ok(result.stdoutTail.length <= 64 * 1024 + 100);
  assert.ok(result.stdoutTail.endsWith("x"));
});

await atest("poster: extract that writes no file is an error", async () => {
  await assert.rejects(
    () =>
      poster.makePoster(
        { video: "brag.mp4", timestamp: 9999, bake: false },
        { run: async () => ({ code: 0, stderr: "" }), exists: (p) => String(p).endsWith("brag.mp4") },
      ),
    /produced no file/,
  );
});

await atest("poster: abort before bake never renames", async () => {
  const controller = new AbortController();
  let renames = 0;
  const run = async (args) => {
    if (args.includes("-frames:v")) {
      controller.abort(); // caller gave up after extraction
      return { code: 0, stderr: "" };
    }
    return { code: 0, stderr: "" };
  };
  const err = await poster
    .makePoster(
      { video: "/tmp/fake/brag.mp4", timestamp: 3, signal: controller.signal },
      { run, exists: (p) => !p.endsWith(".bake.mp4"), rename: () => { renames += 1; } },
    )
    .catch((e) => e);
  assert.ok(err.message.includes("aborted"));
  assert.equal(renames, 0);
});

await atest("poster: abort after bake completes never publishes", async () => {
  const controller = new AbortController();
  let renames = 0;
  const unlinked = [];
  const run = async (args) => {
    if (args.includes("-filter_complex")) controller.abort(); // bake finished, caller gone
    return { code: 0, stderr: "" };
  };
  const err = await poster
    .makePoster(
      { video: "/tmp/fake/brag.mp4", timestamp: 3, signal: controller.signal },
      {
        run,
        exists: (p) => !p.endsWith(".bake.mp4"),
        rename: () => {
          renames += 1;
        },
        unlink: (p) => unlinked.push(p),
      },
    )
    .catch((e) => e);
  assert.ok(err.message.includes("aborted"));
  assert.equal(renames, 0); // the video is never replaced after cancellation
  assert.equal(unlinked.length, 1);
  assert.ok(unlinked[0].endsWith(".bake.mp4"));
});

await atest("poster: summarizePoster covers baked/failed/skipped", async () => {
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: true }).includes("bake: done"));
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: false, bakeError: "boom" }).includes("boom"));
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: false }).includes("skipped"));
});

await atest("fetch-assets: real tar extraction into a dir that did not exist", async () => {
  // End-to-end with the production extractor: tar -C fails unless the target
  // directory exists, so this pins the mkdir fix (injected extractors hid it).
  const scratch = mkdtempSync(join(tmpdir(), "brag-realtar-"));
  try {
    const payload = join(scratch, "payload");
    plantTree(payload, {
      "brag-1f8d9ad/skills/brag/assets/music/a.mp3": "a",
      "brag-1f8d9ad/skills/brag/assets/music/cues/a.music-cues.json": "{}",
      "brag-1f8d9ad/skills/brag/assets/sfx/ui/x.ogg": "x",
      "brag-1f8d9ad/skills/brag/assets/sfx/sfx-analysis.md": "guide",
    });
    const tarball = join(scratch, "brag.tar.gz");
    await execFileP("tar", ["-czf", tarball, "-C", payload, "brag-1f8d9ad"]);
    const dest = join(scratch, "dest");
    const result = await fetchAssetsMod.fetchAssets(
      { dest, ref: "1f8d9ade17d0ad4419cca9305fbc1398a4dd5b39" },
      {
        fetchImpl: async (url) => {
          assert.ok(String(url).endsWith("/tar.gz/1f8d9ade17d0ad4419cca9305fbc1398a4dd5b39"));
          return { ok: true, status: 200, body: makeBody(readFileSync(tarball)) };
        },
        // extract + copy: production defaults on purpose
      },
    );
    assert.ok(result.summary.includes("1 music track(s)"));
    assert.ok(existsSync(join(dest, "music", "a.mp3")));
    assert.ok(existsSync(join(dest, "music", "cues", "a.music-cues.json")));
    assert.ok(existsSync(join(dest, "sfx", "sfx-analysis.md")));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

await atest("fetch-assets: read-only destination gets an actionable error", async () => {
  const err = await fetchAssetsMod
    .fetchAssets(
      { dest: join(tmpdir(), "brag-ro-dest") },
      {
        fetchImpl: async () => ({ ok: true, status: 200, body: makeBody("bytes") }),
        extract: async (_t, extractDir) => plantTree(extractDir, { "brag-main/skills/brag/assets/music/t.mp3": "m" }),
        copy: () => {
          const e = new Error("permission denied");
          e.code = "EACCES";
          throw e;
        },
      },
    )
    .catch((e) => e);
  assert.ok(err instanceof Error);
  assert.ok(err.message.includes("EACCES"));
  assert.ok(err.message.includes("pass dest"));
});

await atest("fetch-assets: non-404 download errors surface once (no retry)", async () => {
  let calls = 0;
  const err = await fetchAssetsMod
    .fetchAssets(
      { dest: join(tmpdir(), "brag-net-dest") },
      {
        fetchImpl: async () => {
          calls += 1;
          return { ok: false, status: 503, body: null };
        },
      },
    )
    .catch((e) => e);
  assert.equal(calls, 1);
  assert.ok(err.message.includes("HTTP 503"));
});

await atest("fetch-assets: mid-stream download failure is a structured error", async () => {
  const err = await fetchAssetsMod
    .fetchAssets(
      { dest: join(tmpdir(), "brag-dl-fail") },
      { fetchImpl: async () => ({ ok: true, status: 200, body: makeErroringBody() }) },
    )
    .catch((e) => e);
  assert.ok(err.message.includes("asset download failed"));
  assert.ok(err.message.includes("connection reset"));
});

await atest("fetch-assets: aborted signal aborts the download", async () => {
  const controller = new AbortController();
  controller.abort();
  let fetched = 0;
  const err = await fetchAssetsMod
    .fetchAssets(
      { dest: join(tmpdir(), "brag-dl-abort"), signal: controller.signal },
      {
        fetchImpl: async () => {
          fetched += 1;
          return { ok: true, status: 200, body: makeBody("never written") };
        },
      },
    )
    .catch((e) => e);
  assert.equal(fetched, 1);
  assert.ok(err.message.includes("aborted"));
});

// --- extension wiring --------------------------------------------------------

await atest("index: registers /brag, /brag-doctor and the four tools", async () => {
  const commands = [];
  const tools = [];
  const sentViaPi = [];
  const mockPi = {
    registerCommand: (name, def) => commands.push({ name, def }),
    registerTool: (def) => tools.push(def),
    sendUserMessage: (msg, opts) => sentViaPi.push({ msg, opts }),
  };
  indexMod.default(mockPi);
  assert.deepEqual(commands.map((c) => c.name).sort(), ["brag", "brag-doctor"]);
  assert.deepEqual(tools.map((t) => t.name).sort(), ["brag_doctor", "brag_fetch_assets", "brag_poster", "brag_render"]);

  // Real command contexts expose isIdle() and no sendUserMessage — the
  // handler must route through the extension API.
  await commands.find((c) => c.name === "brag").def.handler("--tone chaotic --no-sfx", { isIdle: () => true });
  assert.equal(sentViaPi.length, 1);
  assert.equal(sentViaPi[0].opts?.deliverAs, undefined);
  const prompt = sentViaPi[0].msg;
  assert.ok(prompt.includes(paths.SKILL_ENTRY));
  assert.ok(prompt.includes("Tone: chaotic (preset)"));
  assert.ok(prompt.includes("SFX: off"));
  assert.ok(prompt.includes("brag_doctor"));
  assert.ok(prompt.includes("vision-capable subagent"));

  // While streaming, the message is queued as a follow-up.
  await commands.find((c) => c.name === "brag").def.handler("", { isIdle: () => false });
  assert.equal(sentViaPi[1].opts?.deliverAs, "followUp");
});

await atest("UPSTREAM: verbatim files match the recorded integrity hashes", async () => {
  const text = readFileSync(join(pkgRoot, "UPSTREAM.md"), "utf8");
  const block = text.split("```").find((s) => s.includes("  skills/brag/"));
  assert.ok(block, "UPSTREAM.md is missing the integrity hash block");
  const lines = block.trim().split("\n").filter((l) => l.trim());
  assert.ok(lines.length >= 6, "expected at least six integrity lines");
  for (const line of lines) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+(.+)$/);
    assert.ok(m, `unparseable integrity line: ${line}`);
    const [, hash, rel] = m;
    const file = join(pkgRoot, rel);
    assert.ok(existsSync(file), `missing verbatim file: ${rel}`);
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    assert.equal(actual, hash, `integrity mismatch for ${rel}`);
  }
});

console.log(`\n${passed} tests passed${process.exitCode ? " (with failures above)" : ""}`);
if (process.exitCode) process.exit(1);
// pi-brag — offline logic + wiring tests. Plain node + jiti.
// Run: node tests/run-tests.mjs
// No network, no engine calls, no real ffmpeg: all process execution is
// injected; filesystem tests use planted temp trees.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { EventEmitter } from "node:events";

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

await atest("paths: inventoryAssets counts planted tree", async () => {
  const base = mkdtempSync(join(tmpdir(), "brag-inv-"));
  try {
    plantTree(base, {
      "music/a.mp3": "a",
      "music/b.mp3": "b",
      "sfx/interface/x.ogg": "x",
      "sfx/keyboard/y.ogg": "y",
      "cues/a.music-cues.json": "{}",
      "sfx-analysis.md": "analysis",
    });
    mkdirSync(join(base, "sfx", "empty"), { recursive: true }); // truly empty dir -> excluded
    const inv = paths.inventoryAssets(base);
    assert.equal(inv.present, true);
    assert.deepEqual(inv.music, ["a.mp3", "b.mp3"]);
    assert.deepEqual(inv.sfxDirs, ["interface", "keyboard"]);
    assert.equal(inv.sfxFiles, 2);
    assert.deepEqual(inv.cues, ["a.music-cues.json"]);
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
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.signalCode = null;
    this.killCalls = [];
  }
  kill(sig) {
    this.killCalls.push(sig ?? "SIGTERM");
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
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    getReader() {
      return {
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      };
    },
  };
}
const copyCalls = [];

await atest("fetch-assets: tarball url and extraction locator", async () => {
  assert.equal(fetchAssetsMod.tarballUrl(), "https://codeload.github.com/latent-spaces/brag/tar.gz/refs/heads/main");
  assert.equal(fetchAssetsMod.tarballUrl("v0.2.2"), "https://codeload.github.com/latent-spaces/brag/tar.gz/refs/heads/v0.2.2");

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

await atest("poster: summarizePoster covers baked/failed/skipped", async () => {
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: true }).includes("bake: done"));
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: false, bakeError: "boom" }).includes("boom"));
  assert.ok(poster.summarizePoster({ poster: "p.jpg", video: "v.mp4", baked: false }).includes("skipped"));
});

await atest("fetch-assets: tag refs fall back to refs/tags", async () => {
  const urls = [];
  const result = await fetchAssetsMod.fetchAssets(
    { dest: join(tmpdir(), "brag-fetch-dest-unused"), ref: "v0.2.2" },
    {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (String(url).includes("refs/heads/")) return { ok: false, status: 404, body: null };
        return { ok: true, status: 200, body: makeBody("tarball-bytes") };
      },
      extract: async (tarball, extractDir) => {
        plantTree(extractDir, { "brag-v0.2.2/skills/brag/assets/music/t.mp3": "m" });
        assert.ok(tarball.endsWith(".tar.gz"));
      },
      copy: (source, dest) => {
        copyCalls.push([source, dest]);
        plantTree(dest, { "music/t.mp3": "m" }); // emulate the real copy
      },
    },
  );
  assert.deepEqual(urls, [
    "https://codeload.github.com/latent-spaces/brag/tar.gz/refs/heads/v0.2.2",
    "https://codeload.github.com/latent-spaces/brag/tar.gz/refs/tags/v0.2.2",
  ]);
  assert.equal(copyCalls.length, 1);
  assert.ok(copyCalls[0][0].includes(join("skills", "brag", "assets")));
  assert.ok(result.summary.includes("1 music track(s)"));
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

await atest("fetch-assets: non-404 download errors are not retried as tags", async () => {
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

console.log(`\n${passed} tests passed${process.exitCode ? " (with failures above)" : ""}`);
if (process.exitCode) process.exit(1);
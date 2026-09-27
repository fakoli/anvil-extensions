// pi-handoff tests. Plain node + jiti (bundle convention).
// Covers: key resolution (remote/local/non-git + hash parity with
// git hash-object), frontmatter, meta capture, freshness flags, save/read
// plumbing, and the extension factory surface (tools + banner injection).
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { execSync as run } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? (() => {
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

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(fileURLToPath(new URL("../index.ts", import.meta.url)), {
  moduleCache: false,
  interopDefault: true,
  alias: {
    typebox: `${PI_INSTALL_DIR}/node_modules/typebox/build/index.mjs`,
    "@earendil-works/pi-coding-agent": PI_INSTALL_DIR,
  },
});

const pathMod = await jiti.import("./src/path.ts");
const metaMod = await jiti.import("./src/meta.ts");
const freshMod = await jiti.import("./src/freshness.ts");
const noteMod = await jiti.import("./src/note.ts");

const { normalizeRemote, gitBlobSha1Prefix, resolveHandoffPath, parseFrontmatter, noteProse } = pathMod;
const { captureMeta } = metaMod;
const { checkFreshness } = freshMod;
const { saveNote, readNote } = noteMod;

let passed = 0;
let failed = 0;
async function ok(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL - ${name}: ${e.message}`);
  }
}

const DATA_DIR = mkdtempSync(join(tmpdir(), "handoff-data-"));
process.env.HANDOFF_DATA_DIR = DATA_DIR;

function git(dir, ...args) {
  return run(`git ${args.join(" ")}`, { cwd: dir, encoding: "utf8" });
}

function makeRepo({ remote = null, commits = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "handoff-repo-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "c1");
  if (commits > 1) {
    writeFileSync(join(dir, "b.txt"), "b\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "c2");
  }
  if (remote) git(dir, "remote", "add", "origin", remote);
  return dir;
}

// ---------- key resolution --------------------------------------------------

console.log("# key resolution");

await ok("normalizeRemote reduces the four remote spellings", async () => {
  // github.com paths are lowercased end-to-end (host AND path) — same as the
  // original bash normalize_remote()
  assert.equal(normalizeRemote("git@github.com:Example/MyRepo.git"), "github.com/example/myrepo");
  assert.equal(normalizeRemote("ssh://git@github.com/Example/MyRepo.git"), "github.com/example/myrepo");
  assert.equal(normalizeRemote("https://github.com/Example/MyRepo.git"), "github.com/example/myrepo");
  assert.equal(normalizeRemote("git@github.com:Example/MyRepo"), "github.com/example/myrepo");
  assert.equal(normalizeRemote("git@gitlab.example.com:Team/Repo.git"), "gitlab.example.com/Team/Repo");
  assert.equal(normalizeRemote("/plain/path.git"), "/plain/path.git");
});

await ok("key hash matches `git hash-object --stdin` (blob framing)", async () => {
  const source = "remote:github.com/myrepo";
  const gitHash = run(`printf '%s' "${source}" | git hash-object --stdin | cut -c1-12`, {
    encoding: "utf8",
  }).trim();
  assert.equal(gitBlobSha1Prefix(source), gitHash);
});

await ok("remote repo keys by normalized remote (case-insensitive github path)", async () => {
  const repo = makeRepo({ remote: "git@github.com:Example/MyRepo.git" });
  const p = resolveHandoffPath(repo);
  assert.match(p.key, /^myrepo-[0-9a-f]{12}$/);
  assert.equal(p.migratedFromLegacy, false);
  rmSync(repo, { recursive: true, force: true });
});

await ok("two clones of the same remote resolve to the same file", async () => {
  const a = makeRepo({ remote: "https://github.com/Example/MyRepo.git" });
  const b = makeRepo({ remote: "git@github.com:Example/MyRepo.git" });
  assert.equal(resolveHandoffPath(a).file, resolveHandoffPath(b).file);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

await ok("local repo (no remote) keys by the repo root, shared by worktrees", async () => {
  const repo = makeRepo();
  const wt = mkdtempSync(join(tmpdir(), "handoff-wt-"));
  git(repo, "worktree", "add", "-q", wt, "-b", "side");
  assert.equal(resolveHandoffPath(repo).file, resolveHandoffPath(wt).file);
  rmSync(repo, { recursive: true, force: true });
  rmSync(wt, { recursive: true, force: true });
});

await ok("non-git directory keys by its physical path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "handoff-nogit-"));
  const p = resolveHandoffPath(dir);
  assert.match(p.key, /-[0-9a-f]{12}$/);
  rmSync(dir, { recursive: true, force: true });
});

await ok("symlinked project dir keys to the same file as its real path", async () => {
  // Regression: a lexical resolve keyed a symlink to a different file than
  // the physical directory it points at (the original used pwd -P / Path.resolve()).
  const real = mkdtempSync(join(tmpdir(), "handoff-symreal-"));
  const link = join(tmpdir(), `handoff-sym-${process.pid}-${Date.now()}`);
  symlinkSync(real, link, "dir");
  try {
    assert.equal(
      resolveHandoffPath(real).file,
      resolveHandoffPath(link).file,
      "symlink and real path must share one handoff file",
    );
  } finally {
    rmSync(link, { force: true });
    rmSync(real, { recursive: true, force: true });
  }
});

await ok("legacy (repo-root) notes migrate to the remote key once", async () => {
  const repo = makeRepo({ remote: "git@github.com:Example/MyRepo.git" });
  // simulate a pre-remote-keying note: key by repo root only
  const legacySource = repo;
  const legacyKey = `${repo.split("/").pop()}-${gitBlobSha1Prefix(legacySource)}`;
  const legacyDir = join(DATA_DIR, legacyKey);
  mkdirSync(legacyDir, { recursive: true });
  writeFileSync(join(legacyDir, "handoff.md"), "legacy note\n");
  const p1 = resolveHandoffPath(repo);
  assert.equal(p1.migratedFromLegacy, true);
  assert.equal(readFileSync(p1.file, "utf8"), "legacy note\n");
  // second resolve: no re-migration (new file now has content)
  const p2 = resolveHandoffPath(repo);
  assert.equal(p2.migratedFromLegacy, false);
  rmSync(repo, { recursive: true, force: true });
});

// ---------- frontmatter ------------------------------------------------------

console.log("# frontmatter");

await ok("parseFrontmatter reads a closed block, rejects unterminated/absent", async () => {
  assert.deepEqual(parseFrontmatter("---\nsaved_at: x\nbranch: main\n---\nprose"), {
    saved_at: "x",
    branch: "main",
  });
  assert.equal(parseFrontmatter("---\nsaved_at: x\nprose"), null);
  assert.equal(parseFrontmatter("no frontmatter"), null);
});

await ok("noteProse strips the frontmatter block", async () => {
  assert.equal(noteProse("---\nsaved_at: x\n---\nResume:\n- do thing\n"), "Resume:\n- do thing\n");
  assert.equal(noteProse("plain"), "plain");
});

// ---------- meta capture -----------------------------------------------------

console.log("# meta capture");

await ok("captures branch/head/dirty in a git repo", async () => {
  const repo = makeRepo();
  const block = captureMeta(repo);
  const fm = parseFrontmatter(block);
  assert.equal(fm.branch, "main");
  assert.match(fm.head, /^[0-9a-f]{40}$/);
  assert.match(fm.dirty_files, /^[0-9]+$/);
  assert.match(fm.saved_at, /^\d{4}-\d{2}-\d{2}T/);
  rmSync(repo, { recursive: true, force: true });
});

await ok("degrades to saved_at-only outside a git repo (never throws)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "handoff-meta-"));
  const block = captureMeta(dir);
  const fm = parseFrontmatter(block);
  assert.equal(fm.branch, undefined);
  assert.equal(fm.head, undefined);
  assert.ok(fm.saved_at);
  rmSync(dir, { recursive: true, force: true });
});

// ---------- freshness --------------------------------------------------------

console.log("# freshness");

await ok("fresh note reports fresh", async () => {
  const repo = makeRepo();
  saveNote(repo, "Resume:\n- continue\n");
  const r = checkFreshness(repo);
  assert.equal(r.available, true);
  assert.equal(r.fresh, true);
  assert.equal(r.flags.length, 0);
  rmSync(repo, { recursive: true, force: true });
});

await ok("missing note reports unavailable", async () => {
  const repo = makeRepo();
  const r = checkFreshness(repo);
  assert.equal(r.available, false);
  assert.match(r.note, /no handoff note/);
  rmSync(repo, { recursive: true, force: true });
});

await ok("branch move is flagged", async () => {
  const repo = makeRepo();
  saveNote(repo, "note\n");
  git(repo, "checkout", "-q", "-b", "feature");
  const r = checkFreshness(repo);
  assert.equal(r.fresh, false);
  assert.ok(r.flags.some((f) => f.includes("branch moved")));
  rmSync(repo, { recursive: true, force: true });
});

await ok("HEAD advanced (ancestor) is distinguished from diverged", async () => {
  const repo = makeRepo();
  // advance, THEN save: the note records the advanced head
  writeFileSync(join(repo, "c.txt"), "c\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "c3");
  saveNote(repo, "note\n");
  const r1 = checkFreshness(repo);
  assert.equal(r1.flags.length, 0, "saved at current head is fresh");

  // diverge: go back one commit and make a side commit — the saved head is
  // now NOT an ancestor of the current head
  git(repo, "reset", "-q", "--hard", "HEAD~1");
  writeFileSync(join(repo, "d.txt"), "d\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "side");
  const r = checkFreshness(repo);
  assert.ok(r.flags.some((f) => f.includes("diverged")), "diverged");
  rmSync(repo, { recursive: true, force: true });
});

await ok("old note age is flagged via maxAgeDays", async () => {
  const repo = makeRepo();
  saveNote(repo, "note\n");
  const p = resolveHandoffPath(repo);
  const content = readFileSync(p.file, "utf8");
  const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  writeFileSync(p.file, content.replace(/^saved_at: .*$/m, `saved_at: ${oldDate}`));
  const r = checkFreshness(repo);
  assert.ok(r.flags.some((f) => f.includes("30 days old")));
  rmSync(repo, { recursive: true, force: true });
});

await ok("legacy note (no frontmatter) reports freshness unavailable", async () => {
  const repo = makeRepo();
  const p = resolveHandoffPath(repo);
  writeFileSync(p.file, "old-style note without metadata\n");
  const r = checkFreshness(repo);
  assert.equal(r.available, false);
  assert.match(r.note, /legacy note/);
  rmSync(repo, { recursive: true, force: true });
});

// ---------- save/read plumbing ------------------------------------------------

console.log("# save/read");

await ok("saveNote writes meta + prose atomically; readNote returns prose only", async () => {
  const repo = makeRepo();
  const s = saveNote(repo, "Resume:\n- ship it\n", "Shipped half of it");
  assert.equal(s.previousProse, null);
  const raw = readFileSync(s.path, "utf8");
  assert.match(raw, /^---\n/);
  const n = readNote(repo);
  assert.equal(n.exists, true);
  assert.equal(n.prose, "Shipped half of it\n\nResume:\n- ship it\n");
  assert.ok(n.frontmatter.saved_at);
  rmSync(repo, { recursive: true, force: true });
});

await ok("second save reports the previous prose for preservation", async () => {
  const repo = makeRepo();
  saveNote(repo, "v1\n");
  const s = saveNote(repo, "v2\n");
  assert.equal(s.previousProse, "v1");
  assert.equal(readNote(repo).prose, "v2\n");
  rmSync(repo, { recursive: true, force: true });
});

await ok("empty save is refused", async () => {
  const repo = makeRepo();
  assert.throws(() => saveNote(repo, "   "), /nothing to save/);
  rmSync(repo, { recursive: true, force: true });
});

// ---------- extension factory -------------------------------------------------

console.log("# extension factory");

{
  const factory = (await jiti.import("../index.ts")).default;
  const tools = new Map();
  const handlers = new Map();
  const fakePi = {
    registerTool: (def) => tools.set(def.name, def),
    registerCommand: () => {},
    on: (name, h) => handlers.set(name, h),
  };
  factory(fakePi);

  await ok("registers handoff_save and handoff_recall tools", async () => {
    assert.ok(tools.has("handoff_save"));
    assert.ok(tools.has("handoff_recall"));
  });

  await ok("handoff_recall tool degrades cleanly with no note", async () => {
    const repo = makeRepo();
    const out = await tools
      .get("handoff_recall")
      .execute("t1", { project: repo }, new AbortController().signal, undefined, { cwd: repo });
    assert.match(out.content[0].text, /no saved handoff/);
    rmSync(repo, { recursive: true, force: true });
  });

  await ok("handoff_save + handoff_recall round-trip through the tools", async () => {
    const repo = makeRepo();
    const saved = await tools
      .get("handoff_save")
      .execute("t2", { project: repo, prose: "Resume:\n- next step\n" }, new AbortController().signal, undefined, { cwd: repo });
    assert.match(saved.content[0].text, /handoff saved/);
    const recalled = await tools
      .get("handoff_recall")
      .execute("t3", { project: repo }, new AbortController().signal, undefined, { cwd: repo });
    assert.match(recalled.content[0].text, /next step/);
    assert.match(recalled.content[0].text, /fresh:|freshness/);
    rmSync(repo, { recursive: true, force: true });
  });

  await ok("banner injects once per session on the first agent start", async () => {
    const repo = makeRepo();
    saveNote(repo, "Resume:\n- banner test\n");
    const sessionFile = join(tmpdir(), "handoff-test-session.jsonl");
    const mkCtx = () => ({
      cwd: repo,
      sessionManager: { getSessionFile: () => sessionFile },
    });
    handlers.get("session_start")({ reason: "startup" }, mkCtx());
    const r1 = await handlers.get("before_agent_start")({}, mkCtx());
    assert.ok(r1?.message, "first start injects the banner");
    assert.match(r1.message.content, /HANDOFF - saved context/);
    assert.match(r1.message.content, /banner test/);
    assert.equal(r1.message.display, true);
    const r2 = await handlers.get("before_agent_start")({}, mkCtx());
    assert.equal(r2, undefined, "second start is quiet (once per session)");
    // a new session re-arms
    handlers.get("session_start")({ reason: "new" }, mkCtx());
    const r3 = await handlers.get("before_agent_start")({}, mkCtx());
    assert.ok(r3?.message, "new session re-arms the banner");
    // reload never banners
    handlers.get("session_start")({ reason: "reload" }, mkCtx());
    const r4 = await handlers.get("before_agent_start")({}, mkCtx());
    assert.equal(r4, undefined, "reload is quiet");
    rmSync(repo, { recursive: true, force: true });
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

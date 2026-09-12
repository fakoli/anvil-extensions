// pi-voice-clone tests. Plain node + jiti (same harness convention as
// pi-commentary). The clone.py path is exercised against a SYNTHETIC fixture
// skill dir — the real private corpus is never touched by tests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PI_INSTALL_DIR = process.env.PI_INSTALL_DIR
  ?? (() => {
    try {
      // Any host where the pi bundle is resolvable from node_modules.
      return dirname(createRequire(import.meta.url).resolve("@earendil-works/pi-coding-agent/package.json"));
    } catch {
      return undefined;
    }
  })()
  ?? "/data/apps/devtools/node-24.20.0/lib/node_modules/@earendil-works/pi-coding-agent";

let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  ({ createJiti } = await import(`${PI_INSTALL_DIR}/node_modules/jiti/lib/jiti.mjs`));
}

const jiti = createJiti(fileURLToPath(new URL("../index.ts", import.meta.url)), { moduleCache: false, interopDefault: true });
const { assemblePrompt, ClonePyError } = await jiti.import("./src/clone.ts");
const { lintVoice, formatFindings } = await jiti.import("./src/lint.ts");
const { resolveSkillDir, expandHome, SkillDirError, DEFAULT_SKILL_DIR } = await jiti.import("./src/skill-dir.ts");

// ---------- synthetic fixture skill dir ----------
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "voice-clone-fixture-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "assets", "registers"), { recursive: true });
  mkdirSync(join(root, "assets", "sources"), { recursive: true });
  writeFileSync(
    join(root, "scripts", "clone.py"),
    `import argparse, json, sys, os, stat
from pathlib import Path
ap = argparse.ArgumentParser()
ap.add_argument("--assets-dir")
ap.add_argument("--facts-file")
ap.add_argument("--register")
ap.add_argument("--context"); ap.add_argument("--audience")
ap.add_argument("--task", default=""); ap.add_argument("--example", action="append", default=[])
ap.add_argument("--n", type=int, default=3); ap.add_argument("--out")
ap.add_argument("--list-registers", action="store_true")
a = ap.parse_args()
base = Path(a.assets_dir) if a.assets_dir else Path(__file__).resolve().parent.parent / "assets"
if a.list_registers:
    recs = [json.loads(l) for l in (base/"corpus.jsonl").read_text().splitlines() if l.strip()]
    regs = sorted({r["register"] for r in recs})
    print("\\n".join(f"{x}  doc(s)" for x in regs)); raise SystemExit(0)
recs = [json.loads(l) for l in (base/"corpus.jsonl").read_text().splitlines() if l.strip()]
pool = [r for r in recs if r["register"] == a.register]
if not pool:
    print(f"no documents in register '{a.register}'. available: "
          + str(sorted({r['register'] for r in recs})), file=sys.stderr); raise SystemExit(1)
picked = ([r for r in pool if r["id"] in a.example] + [r for r in pool if r["id"] not in a.example])[:max(a.n, len(a.example))]
profile = json.loads((base/"registers"/f"{a.register}.json").read_text())
facts = ""
if a.facts_file:
    facts = Path(a.facts_file).read_text()
    print("FACTS_MODE", oct(stat.S_IMODE(os.stat(a.facts_file).st_mode)))
parts = [f"## Current task\\nUse the {a.register} register:\\n{a.task}",
         f"## Current-task evidence\\n{facts or 'Only facts explicitly supplied in the current task are authorized.'}",
         "## His register profile (measured)"]
for i, ex in enumerate(picked, 1):
    parts.append(f"### Example {i} — his {ex['context']['type']}\\n\\"\\"\\"\\n{ex['text']}\\n\\"\\"\\"")
parts += ["## Corpus style preferences", (base/"style-grammar.md").read_text(), "## Output rules", "- Write ONLY the finished piece."]
print("\\n".join(parts))
`,
    { mode: 0o755 }
  );
  const rec = (id, text, type) =>
    JSON.stringify({ id, register: "work-email", context: { type, audience: "recruiter", year: 2026 }, source_file: `${id}.txt`, text, stats: { words: 60, sentences: 4 }, signature_hits: [] });
  const corpus = [
    rec("01_alpha-email", "I am selectively exploring the role. The team owns networking and reliability across three regions. Would you be comfortable sharing how the team thinks about the role?", "recruiter_outreach"),
    rec("02_beta-email", "Following up on our conversation about capacity planning. One forward step: a 20 minute call next week. Does Thursday work?", "recruiter_followup"),
  ].join("\n");
  writeFileSync(join(root, "assets", "corpus.jsonl"), corpus + "\n");
  writeFileSync(
    join(root, "assets", "registers", "work-email.json"),
    JSON.stringify({ register: "work-email", documents: 2, total_words: 120, doc_ids: ["01_alpha-email", "02_beta-email"], contexts: ["recruiter_outreach", "recruiter_followup"], sent_len_avg_range: [10, 14], pronouns_per_100w: { i: 4.2, we: 0.5, you: 1.1 }, punct_per_100w: { comma: 5.0 }, dashes_avg: 0.0, parentheticals_avg: 0.0, exclamations_total: 0, numbers_per_100w: 2.0, signature_frequency: { "low-pressure close": 2 } })
  );
  writeFileSync(join(root, "assets", "style-grammar.md"), "# Style Grammar\n\n1. **Never use exclamation marks.**\n2. **Quantify, don't puff.**\n");
  return root;
}

let fixture;
let pass = 0;
let fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`ok - ${name}`); })
    .catch((err) => { fail++; console.error(`FAIL - ${name}\n  ${err?.message ?? err}`); });
}

await test("expandHome expands ~/ and leaves absolute paths", () => {
  assert.equal(expandHome("~/code"), join(process.env.HOME ?? "", "code"));
  assert.equal(expandHome("/abs/path"), "/abs/path");
  assert.equal(expandHome(DEFAULT_SKILL_DIR).includes("voice-clone"), true);
});

await test("resolveSkillDir throws fixable SkillDirError when missing", () => {
  const prev = process.env.VOICE_SKILL_DIR;
  process.env.VOICE_SKILL_DIR = "/nonexistent/voice-clone";
  try {
    assert.throws(() => resolveSkillDir(), (e) => e instanceof SkillDirError && e.message.includes("VOICE_SKILL_DIR"));
  } finally {
    if (prev === undefined) delete process.env.VOICE_SKILL_DIR; else process.env.VOICE_SKILL_DIR = prev;
  }
});

await test("resolveSkillDir accepts fixture and requires clone.py", () => {
  fixture = makeFixture();
  const prev = process.env.VOICE_SKILL_DIR;
  process.env.VOICE_SKILL_DIR = fixture;
  try {
    const info = resolveSkillDir();
    assert.equal(info.clonePy, join(fixture, "scripts", "clone.py"));
    // pointing at the parent (no SKILL.md contract dir) must fail
    process.env.VOICE_SKILL_DIR = join(fixture, "scripts");
    assert.throws(() => resolveSkillDir(), SkillDirError);
  } finally {
    if (prev === undefined) delete process.env.VOICE_SKILL_DIR; else process.env.VOICE_SKILL_DIR = prev;
  }
});

await test("assemblePrompt embeds task, facts, examples, and grammar", async () => {
  const out = await assemblePrompt(join(fixture, "scripts", "clone.py"), {
    register: "work-email",
    task: "Reply to recruiter about scope",
    facts: "Company: Acme. Role: Staff SRE.",
    examples: ["02_beta-email"],
    n: 1,
  });
  assert.match(out, /Reply to recruiter about scope/);
  assert.match(out, /Company: Acme\. Role: Staff SRE\./);
  assert.match(out, /Example 1 — his recruiter_followup/);
  assert.match(out, /low-pressure close|Following up/);
  assert.match(out, /Never use exclamation marks/);
  assert.match(out, /Write ONLY the finished piece/);
});

await test("assemblePrompt --list-registers lists fixture registers", async () => {
  const out = await assemblePrompt(join(fixture, "scripts", "clone.py"), { register: "", listRegisters: true });
  assert.match(out, /work-email/);
});

await test("assemblePrompt surfaces clone.py register errors", async () => {
  await assert.rejects(
    () => assemblePrompt(join(fixture, "scripts", "clone.py"), { register: "nope", task: "x" }),
    (e) => e instanceof ClonePyError && /exited|no documents/.test(e?.message)
  );
});

await test("assemblePrompt: facts file is 0600 mid-run and temp dir is cleaned up", async () => {
  const tmpBefore = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith("voice-clone-")));
  const out = await assemblePrompt(join(fixture, "scripts", "clone.py"), {
    register: "work-email",
    task: "t",
    facts: "secret facts",
  });
  // mid-run perms: the fixture clone.py stats the file while it exists
  assert.match(out, /FACTS_MODE 0o600/);
  // cleanup: no voice-clone-* temp dirs leaked after the call
  const leaked = readdirSync(tmpdir()).filter((n) => n.startsWith("voice-clone-") && !tmpBefore.has(n));
  assert.deepEqual(leaked, []);
});

await test("lintVoice: exclamation marks are violations with corpus note", () => {
  const f = lintVoice("This is great! Let me know.", "work-email");
  const v = f.find((x) => x.rule === "no-exclamation-marks");
  assert.ok(v && v.severity === "violation");
  assert.match(v.detail, /Eat !!!|exactly one/);
});

await test("lintVoice: filler pleasantry detection", () => {
  const f = lintVoice("I hope this email finds you well. The team owns networking.", "work-email");
  assert.ok(f.some((x) => x.rule === "no-filler-pleasantries" && x.severity === "violation"));
});

await test("lintVoice: puffery detection", () => {
  const f = lintVoice("We built a seamless integration across regions.", "technical-prose");
  assert.ok(f.some((x) => x.rule === "numbers-over-adjectives" && /seamless/.test(x.detail)));
});

await test("lintVoice: hedging stacks flagged, overlapping single hedge not", () => {
  const stacked = lintVoice("It might possibly be worth considering a change.", "work-email");
  assert.ok(stacked.some((x) => x.rule === "no-hedging-stacks"));
  // regression: 'it may be worth' subsumes 'worth considering' — a single
  // hedge must NOT be reported as a stack
  const single = lintVoice("It may be worth considering a pilot.", "work-email");
  assert.ok(!single.some((x) => x.rule === "no-hedging-stacks"));
  const gracious = lintVoice("Perhaps our paths will cross again someday.", "formal-gracious");
  assert.ok(!gracious.some((x) => x.rule === "no-hedging-stacks"));
});

await test("lintVoice: unknown/typo'd register warns instead of silently skipping", () => {
  const f = lintVoice("A clean draft that ends with a close line.", "work_email");
  const unknown = f.find((x) => x.rule === "unknown-register");
  assert.ok(unknown && unknown.severity === "warning");
  assert.match(unknown.detail, /SKIPPED/);
  // universal checks still ran, register-specific ones did not
  assert.ok(!f.some((x) => x.rule === "register-close"));
});

await test("lintVoice: every match reported, not just the first", () => {
  const f = lintVoice("We built a seamless and state of the art platform.", "technical-prose");
  const puffy = f.filter((x) => x.rule === "numbers-over-adjectives");
  assert.equal(puffy.length, 2);
  assert.ok(puffy.some((x) => /state of the art/.test(x.detail)));
});

await test("lintVoice: self-passive heuristic is warning only", () => {
  const f = lintVoice("The configurations were made by the platform team. I was promoted to staff engineer last year.", "professional-narrative");
  const w = f.find((x) => x.rule === "i-active-verb");
  assert.ok(w && w.severity === "warning");
});

await test("lintVoice: formal-gracious requires signature close", () => {
  const bad = lintVoice("Thank you for the opportunity. I wish you and the team all the best.", "formal-gracious");
  assert.ok(bad.some((x) => x.rule === "register-close" && x.severity === "violation"));
  const good = lintVoice("Thank you for the opportunity.\n\nWith Gratitude,\nA. Author", "formal-gracious");
  assert.ok(!good.some((x) => x.rule === "register-close" && x.severity === "violation"));
});

await test("lintVoice: work-email wants a low-pressure closing question", () => {
  const bad = lintVoice("I am selectively exploring the role. Let me know your thoughts soon.", "work-email");
  assert.ok(bad.some((x) => x.rule === "register-close" && x.severity === "violation"));
  const good = lintVoice("I am selectively exploring the role. Would you be comfortable sharing how the team thinks about the role?", "work-email");
  assert.ok(!good.some((x) => x.rule === "register-close" && x.severity === "violation"));
});

await test("lintVoice: em-dash restraint warns at 3+ in formal registers only", () => {
  const formal = lintVoice("A — B — C — D. Regards.", "formal-gracious");
  assert.ok(formal.some((x) => x.rule === "em-dash-restraint"));
  const notes = lintVoice("A — B — C — D.", "interview-notes");
  assert.ok(!notes.some((x) => x.rule === "em-dash-restraint"));
});

await test("lintVoice: judgment reminders always present, empty draft is violation", () => {
  assert.ok(lintVoice("Clean draft, no issues to find here for the check.", "technical-prose").some((x) => x.rule === "self-check-remaining"));
  const empty = lintVoice("   ", "work-email");
  assert.ok(empty.some((x) => x.rule === "empty" && x.severity === "violation"));
});

await test("formatFindings summarizes violations and warnings", () => {
  const text = formatFindings(lintVoice("This is great! I hope this email finds you well. Would you be open to a quick call?", "work-email"));
  assert.match(text, /2 violation/);
  assert.match(text, /VIOLATION/);
});

// fixture cleanup
try { rmSync(fixture, { recursive: true, force: true }); } catch { /* fixture may be undefined */ }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
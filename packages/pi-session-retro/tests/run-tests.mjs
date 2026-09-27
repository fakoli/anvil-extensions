// pi-session-retro tests. Plain node + jiti (bundle convention).
// Synthetic Pi/Claude/Codex fixtures cover the parsers, aggregate
// (fork exclusion + integrity guard), report rendering, discovery, and
// the extension factory surface.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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

const parseMod = await jiti.import("./src/parse.ts");
const aggMod = await jiti.import("./src/aggregate.ts");
const reportMod = await jiti.import("./src/report.ts");
const discoverMod = await jiti.import("./src/discover.ts");
const expandMod = await jiti.import("./src/expand.ts");

const { parse, isCodex } = parseMod;
const { aggregate } = aggMod;
const { reportMd, reportHtml, mdToHtml } = reportMod;
const { head, listSessions, findSessions } = discoverMod;
const { expandPaths } = expandMod;

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

const T = mkdtempSync(join(tmpdir(), "session-retro-fixtures-"));
const j = (o) => JSON.stringify(o);

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function piSession(path, { subagents = 0 } = {}) {
  const lines = [
    j({ type: "session", version: 3, id: "pi-1", timestamp: "2026-09-26T10:00:00.000Z", cwd: "/tmp/proj" }),
    j({ type: "message", timestamp: "2026-09-26T10:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "build the thing" }] } }),
    j({
      type: "message",
      timestamp: "2026-09-26T10:00:05.000Z",
      message: {
        role: "assistant",
        model: "test-model",
        usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, reasoning: 7, totalTokens: 172, cost: { total: 0.01 } },
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "ok" },
          { type: "toolCall", id: "t1", name: "read", arguments: {} },
          { type: "toolCall", id: "t2", name: "bash", arguments: {} },
        ],
      },
    }),
    j({ type: "message", timestamp: "2026-09-26T10:00:06.000Z", message: { role: "toolResult", content: [{ type: "text", text: "result" }] } }),
  ];
  for (let i = 0; i < subagents; i++) {
    lines.push(
      j({
        type: "message",
        timestamp: `2026-09-26T10:0${i + 1}:00.000Z`,
        message: {
          role: "assistant",
          model: "test-model",
          usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 30 },
          content: [
            {
              type: "toolCall",
              id: `s${i}`,
              name: "subagent",
              arguments: { agent: "reviewer", task: "review the diff" },
            },
          ],
        },
      }),
    );
  }
  lines.push(
    j({
      type: "message",
      timestamp: "2026-09-26T10:09:00.000Z",
      message: {
        role: "assistant",
        model: "test-model",
        usage: { input: 200, output: 80, cacheRead: 90, cacheWrite: 0, reasoning: 3, totalTokens: 273, cost: { total: 0.02 } },
        content: [{ type: "text", text: "done" }],
      },
    }),
  );
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function claudeSession(path) {
  const lines = [
    j({ type: "user", timestamp: "2026-09-26T11:00:00.000Z", cwd: "/tmp/proj2", gitBranch: "main", message: { role: "user", content: "do the thing" } }),
    j({
      type: "assistant",
      timestamp: "2026-09-26T11:00:05.000Z",
      message: {
        role: "assistant",
        model: "claude-x",
        usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 500, cache_creation_input_tokens: 60 },
        content: [
          { type: "text", text: "on it" },
          { type: "tool_use", id: "a1", name: "Skill", input: { skill: "debugging" } },
          { type: "tool_use", id: "a2", name: "Agent", input: { subagent_type: "researcher" } },
        ],
      },
    }),
    j({
      type: "user",
      timestamp: "2026-09-26T11:00:30.000Z",
      message: {
        role: "user",
        content: "<usage><summary>did stuff</summary><agent_count>2</agent_count><subagent_tokens>1234</subagent_tokens><tool_uses>9</tool_uses><duration_ms>25000</duration_ms></usage>",
      },
    }),
  ];
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

function codexSession(path, { foreignReplay = false } = {}) {
  const lines = [
    j({
      type: "session_meta",
      timestamp: "2026-09-26T12:00:00.000Z",
      payload: { id: "roll-1", session_id: "sess-1", cwd: "/tmp/proj3", source: {} },
    }),
    j({
      type: "response_item",
      timestamp: "2026-09-26T12:00:01.000Z",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "implement feature X" }] },
    }),
    j({
      type: "response_item",
      timestamp: "2026-09-26T12:00:05.000Z",
      payload: {
        type: "function_call",
        name: "spawn_agent",
        arguments: JSON.stringify({ message: "adversarial review the change", agent_type: "explorer" }),
      },
    }),
    j({
      type: "response_item",
      timestamp: "2026-09-26T12:05:00.000Z",
      payload: { type: "token_count", info: { total_token_usage: { input_tokens: 5000, output_tokens: 700, reasoning_output_tokens: 50, cached_input_tokens: 400 }, last_token_usage: { output_tokens: 700 } } },
    }),
  ];
  if (foreignReplay) {
    // a foreign rollout's session_meta replayed into this one: forked
    lines.push(
      j({
        type: "session_meta",
        timestamp: "2026-09-26T12:05:01.000Z",
        payload: { id: "roll-OTHER", session_id: "sess-OTHER", cwd: "/tmp/other" },
      }),
    );
  }
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

const pi1 = piSession(join(T, "pi1.jsonl"), { subagents: 2 });
const pi2 = piSession(join(T, "pi2.jsonl"));
const cl1 = claudeSession(join(T, "cl1.jsonl"));
const cx1 = codexSession(join(T, "cx1.jsonl"));
const cxFork = codexSession(join(T, "cxFork.jsonl"), { foreignReplay: true });

// ---------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------

console.log("# parsers");

await ok("pi parser: usage accounting (reasoning counts as generated)", async () => {
  const s = parse(pi1);
  assert.equal(s.runtime, "pi");
  // out: 50+7 (first) + 20+20 (two subagents) + 80+3 (last) = 180
  assert.equal(s.out, 180); // 57 + 20 + 20 + 83
  assert.equal(s.inp, 100 + 10 + 10 + 200);
  assert.equal(s.cr, 10 + 90);
  assert.equal(s.cc, 5);
  assert.equal(s.asst, 4);
  assert.equal(s.cost_total, 0.03);
  assert.equal(s.cwd, "/tmp/proj");
  assert.deepEqual([...(s.models ?? [])], ["test-model"]);
  assert.equal(s.user_turns.length, 1);
  assert.equal(s.user_turns[0], "build the thing");
});

await ok("pi parser: toolCall + subagent counting", async () => {
  const s = parse(pi1);
  assert.equal(s.tools.read, 1);
  assert.equal(s.tools.bash, 1);
  assert.equal(s.tools.subagent, 2);
  assert.equal(s.agent_types.reviewer, 2);
  assert.equal(s.workflows.length, 2);
  assert.equal(s.workflows[0].kind, "review"); // "adversarial"? no: task "review the diff" -> review
});

await ok("pi parser: duration from first/last ts", async () => {
  const s = parse(pi2);
  assert.equal(s.duration_ms, 9 * 60_000);
});

await ok("claude parser: usage + tools + workflow blocks", async () => {
  const s = parse(cl1);
  assert.equal(s.runtime, "claude");
  assert.equal(s.out, 40);
  assert.equal(s.inp, 300);
  assert.equal(s.cr, 500);
  assert.equal(s.cc, 60);
  assert.equal(s.branch, "main");
  assert.equal(s.tools.Skill, 1);
  assert.equal(s.skills.debugging, 1);
  assert.equal(s.agent_types.researcher, 1);
  assert.equal(s.workflows.length, 1);
  assert.equal(s.workflows[0].tokens, 1234);
  assert.equal(s.user_turns.length, 1); // <usage> block is not a human turn
});

await ok("codex parser: cumulative usage + spawn pairing data", async () => {
  const s = parse(cx1);
  assert.equal(s.runtime, "codex");
  assert.equal(s.out, 750); // 700 + 50 reasoning
  assert.equal(s.inp, 5000);
  assert.equal(s.cr, 400);
  assert.equal(s.codex_forked, false);
  assert.equal(s.codex_is_subagent, false);
  assert.equal(s.workflows.length, 1);
  assert.equal(s.workflows[0].codex_spawn, true);
  assert.equal(s.workflows[0].kind, "review");
});

await ok("codex parser: foreign session_meta replay marks forked", async () => {
  const s = parse(cxFork);
  assert.equal(s.codex_forked, true);
  assert.equal(s.meta_foreign_ids, 1);
});

await ok("isCodex discrimination", async () => {
  assert.equal(isCodex(cx1), true);
  assert.equal(isCodex(pi1), false);
  assert.equal(isCodex(cl1), false);
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

console.log("# aggregate");

await ok("aggregate combines pi + claude + codex without double counting", async () => {
  const agg = aggregate([parse(pi1), parse(pi2), parse(cl1), parse(cx1)]);
  assert.deepEqual(agg.runtimes, ["claude", "codex", "pi"]);
  // main_output = pi1.out(160) + pi2.out(50+20+80=150... recompute: 50+7? no subagents in pi2: 50+80 + reasoning 7+3) + claude.out(40) + codex.out(750)
  // pi2: first msg out 50+7reasoning=57, last 80+3=83 => 140
  assert.equal(agg.main_output_tokens, 180 + 140 + 40 + 750);
  assert.equal(agg.assistant_turns, 4 + 2 + 1 + 0); // pi1: 4 (incl 2 subagent), pi2: 2, claude: 1, codex: 0
  assert.equal(agg.user_turns, 1 + 1 + 1 + 1);
  assert.equal(agg.workflows, 2 + 1 + 1); // pi subagents + claude usage block + codex spawn
  assert.ok(agg.tools.read && agg.tools.bash && agg.tools.Skill && agg.tools.spawn_agent);
  assert.ok(agg.measurement_notes.length >= 1, "delegated totals unavailable note (pi subagents are null-token)");
});

await ok("forked codex rollouts are excluded from additive sums", async () => {
  const withFork = aggregate([parse(cx1), parse(cxFork)]);
  const without = aggregate([parse(cx1)]);
  assert.equal(withFork.main_output_tokens, without.main_output_tokens);
  assert.ok(withFork.measurement_notes.some((n) => n.includes("foreign-ID replay")));
});

await ok("integrity warning when every source is excluded", async () => {
  const agg = aggregate([parse(cxFork)]); // the only session is forked
  assert.ok(
    agg.measurement_notes.some((n) => n.startsWith("INTEGRITY WARNING")),
    "integrity warning present",
  );
});

await ok("workflow token-availability semantics (unknown -> null, not 0)", async () => {
  const agg = aggregate([parse(pi1)]);
  const review = agg.workflow_by_type.review;
  assert.equal(review.unknown_runs, 2);
  assert.equal(review.tokens, null);
});

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------

console.log("# reports");

await ok("reportMd renders all sections + fill-in scaffolds", async () => {
  const md = reportMd(aggregate([parse(pi1), parse(cl1)]));
  for (const section of [
    "## Session shape",
    "## Token economy",
    "## Workflow analysis",
    "## Tool distribution",
    "## Agents & skills",
    "## Interaction analysis (fill in)",
    "## Retrospective (fill in)",
    "## Recommendations (fill in)",
    "What went well",
    "Where we got lucky",
    "Five Whys",
  ]) {
    assert.ok(md.includes(section), `missing section: ${section}`);
  }
  assert.ok(md.includes("build the thing"), "human turn listed");
});

await ok("reportHtml embeds data safely and the narrative", async () => {
  const html = reportHtml(aggregate([parse(pi1)]), mdToHtml("# My retro\n\n- **good**"));
  assert.ok(html.includes("Session Retro"));
  assert.ok(html.includes("__NARRATIVE__") === false);
  assert.ok(html.includes("<strong>good</strong>"));
  const m = html.match(/const D = (.*), fmt =/s);
  const data = JSON.parse(m[1]);
  assert.equal(data.main_output_tokens, 180);
  assert.ok(!html.includes("</script>const"), "no script breakout");
});

await ok("reportHtml survives sentinel collision in data and narrative", async () => {
  // Regression: sequential .replace("__DATA__").replace("__NARRATIVE__") let
  // embedded data containing the other sentinel (or $-tokens in the narrative)
  // corrupt the page. The single-pass function replacer must embed both verbatim.
  const agg = aggregate([parse(pi1)]);
  agg.__sentinel_probe = "x__NARRATIVE__y";
  const narrative = mdToHtml("narrative with __DATA__ and $& $$ tokens");
  const html = reportHtml(agg, narrative);
  const m = html.match(/const D = (.*), fmt =/s);
  const data = JSON.parse(m[1]);
  assert.equal(data.__sentinel_probe, "x__NARRATIVE__y", "data containing the narrative sentinel embeds verbatim");
  assert.ok(html.includes("__DATA__ and $&amp; $$ tokens"), "narrative containing $-tokens and the data sentinel embeds verbatim (mdToHtml escapes & to &amp;)");
  assert.ok(!html.includes('id="narrative">__NARRATIVE__</div>'), "the narrative placeholder was replaced (the sentinel text inside the embedded data JSON is content, not a leftover placeholder)");
});

await ok("mdToHtml handles headings/lists/bold/code/links", async () => {
  const h = mdToHtml("# T\n\n- a **b** `c`\n- [l](https://x.y)\n- bad [j](javascript:alert(1))\n");
  assert.ok(h.includes("<h1>T</h1>"));
  assert.ok(h.includes("<strong>b</strong>"));
  assert.ok(h.includes('<a href="https://x.y">l</a>'));
  assert.ok(!h.includes('href="javascript:'), "javascript: links are not made clickable");
});

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

console.log("# discovery");

await ok("head() extracts pi breadcrumbs (cwd, topic, runtime)", async () => {
  const h = head(pi1);
  assert.equal(h.runtime, "pi");
  assert.equal(h.cwd, "/tmp/proj");
  assert.equal(h.topic, "build the thing");
  assert.ok(h.ts);
});

await ok("head() extracts claude breadcrumbs (branch + topic)", async () => {
  const h = head(cl1);
  assert.equal(h.runtime, "claude");
  assert.equal(h.branch, "main");
  assert.equal(h.topic, "do the thing");
});

await ok("head() extracts codex breadcrumbs", async () => {
  const h = head(cx1);
  assert.equal(h.runtime, "codex");
  assert.equal(h.cwd, "/tmp/proj3");
  assert.equal(h.topic, "implement feature X");
});

await ok("listSessions runs over the real home dirs without crashing", async () => {
  const out = listSessions("");
  assert.equal(typeof out, "string");
});

await ok("findSessions returns formatted output (matches or clean no-match)", async () => {
  // A timestamped keyword cannot appear in OLD session logs; the live
  // session log for THIS run may contain the test source, so accept either
  // a formatted hit list or the clean no-match line.
  const out = findSessions(`zzz-impossible-${Date.now()}`);
  assert.equal(typeof out, "string");
  assert.match(out, /zzz-impossible-|no sessions mention/);
});

// ---------------------------------------------------------------------------
// expansion
// ---------------------------------------------------------------------------

console.log("# expansion");

await ok("expandPaths passes pi/claude files through, dedupes", async () => {
  const out = expandPaths([pi1, cl1, pi1]);
  assert.deepEqual(out, [pi1, cl1]);
});

await ok("expandPaths expands a codex rollout to siblings of the same session", async () => {
  const sub = codexSession(join(T, "cxSub.jsonl"));
  // give the sub the same session_id and a parent_thread_id
  const raw = readFileSync(sub, "utf8");
  writeFileSync(
    sub,
    raw.replace(
      '"source": {}',
      '"source": {"subagent": {"thread_spawn": {"nickname": "rev"}}}, "parent_thread_id": "roll-1"',
    ),
  );
  const out = expandPaths([sub], [T]);
  assert.ok(out.includes(cx1), `expected main rollout in expansion: ${out.join(", ")}`);
  assert.ok(out.includes(sub));
});

// ---------------------------------------------------------------------------
// extension factory
// ---------------------------------------------------------------------------

console.log("# extension factory");

{
  const factory = (await jiti.import("../index.ts")).default;
  const tools = new Map();
  const fakePi = {
    registerTool: (def) => tools.set(def.name, def),
    registerCommand: () => {},
    on: () => {},
  };
  factory(fakePi);

  await ok("registers the session_retro tool", async () => {
    assert.ok(tools.has("session_retro"));
  });

  await ok("tool: report mode renders a pi session", async () => {
    const out = await tools
      .get("session_retro")
      .execute("t1", { mode: "report", paths: [pi1] }, new AbortController().signal);
    assert.match(out.content[0].text, /## Session shape/);
    assert.match(out.content[0].text, /test-model|Runtime\(s\)/);
  });

  await ok("tool: stats mode returns parseable JSON", async () => {
    const out = await tools
      .get("session_retro")
      .execute("t2", { mode: "stats", paths: [pi1] }, new AbortController().signal);
    const data = JSON.parse(out.content[0].text);
    assert.equal(data.main_output_tokens, 180);
  });

  await ok("tool: html mode with writeHtml writes the site", async () => {
    const outPath = join(T, "site.html");
    const out = await tools
      .get("session_retro")
      .execute("t3", { mode: "html", paths: [pi1], narrative: "# retro", writeHtml: outPath }, new AbortController().signal);
    assert.match(out.content[0].text, /wrote interactive retro site/);
    assert.match(readFileSync(outPath, "utf8"), /Session Retro/);
  });

  await ok("tool: missing paths degrade cleanly", async () => {
    const out = await tools
      .get("session_retro")
      .execute("t4", { mode: "report" }, new AbortController().signal);
    assert.match(out.content[0].text, /needs paths/);
  });

  await ok("tool: list mode returns session breadcrumbs", async () => {
    const out = await tools
      .get("session_retro")
      .execute("t5", { mode: "list" }, new AbortController().signal);
    assert.equal(typeof out.content[0].text, "string");
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
rmSync(T, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

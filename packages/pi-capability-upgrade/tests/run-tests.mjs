import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const pkg = join(root, "packages", "pi-capability-upgrade");
const jiti = createJiti(join(pkg, "index.ts"), { moduleCache: false, interopDefault: true });
const receipt = await jiti.import(join(pkg, "src", "receipt.ts"));
const policy = await jiti.import(join(pkg, "src", "mcp-policy.ts"));
const docs = await jiti.import(join(pkg, "src", "docs-guard.ts"));

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failures.push({ name, error }); console.log(`FAIL - ${name}: ${error.message}`); }
}

function nextLine(child) {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const timeout = setTimeout(() => reject(new Error("fixture server did not reply")), 5_000);
    child.stdout.on("data", function onData(chunk) {
      buffered += chunk;
      const end = buffered.indexOf("\n");
      if (end < 0) return;
      clearTimeout(timeout); child.stdout.off("data", onData);
      resolve(JSON.parse(buffered.slice(0, end)));
    });
    child.once("error", reject);
  });
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pi-capability-receipt-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Synthetic");
  git("config", "user.email", "synthetic@example.invalid");
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, "app.txt"), "baseline\n");
  writeFileSync(join(dir, ".claude", "gate-router.local.md"), "---\nrules:\n  - ** => true\n---\n");
  git("add", "."); git("commit", "-qm", "initial");
  return { dir, git };
}

function approved(gates) { return { approvedGates: gates }; }

await test("receipt runs gates over a stable snapshot without mutating the real index", async () => {
  const { dir, git } = tempRepo();
  try {
    writeFileSync(join(dir, "untracked file.txt"), "candidate\n");
    const before = git("diff", "--cached", "--name-only");
    const policyPath = ".claude/gate-router.local.md";
    const trustedPolicyIdentity = receipt.policyIdentity(dir, policyPath);
    const created = await receipt.runVerifiedGates({
      root: dir,
      taskId: "T100",
      claimId: "C100",
      policyPath,
      trustedPolicyIdentity,
      gates: [{ command: process.execPath, args: ["-e", "process.stdout.write('gate passed')"] }],
      ...approved([{ command: process.execPath, args: ["-e", "process.stdout.write('gate passed')"] }]),
    });
    assert.equal(git("diff", "--cached", "--name-only"), before);
    const validation = { root: dir, taskId: "T100", claimId: "C100", baseline: created.baseline, policyPath, trustedPolicyIdentity, ...approved([{ command: process.execPath, args: ["-e", "process.stdout.write('gate passed')"] }]) };
    assert.equal(receipt.validateReceipt(created, validation).ok, true);
    writeFileSync(join(dir, "untracked file.txt"), "later edit\n");
    assert.match(receipt.validateReceipt(created, validation).reason, /candidate content changed/);
    writeFileSync(join(dir, ".claude", "gate-router.local.md"), "---\nrules:\n  - ** => false\n---\n");
    assert.match(receipt.validateReceipt(created, validation).reason, /policy identity/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("receipt rejects failed gates, cancellation, and a mutable policy", async () => {
  const { dir } = tempRepo();
  try {
    const policyPath = ".claude/gate-router.local.md";
    const trustedPolicyIdentity = receipt.policyIdentity(dir, policyPath);
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [], ...approved([]) }), /at least one/);
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "bad task", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [{ command: process.execPath, args: ["-e", ""] }], ...approved([{ command: process.execPath, args: ["-e", ""] }]) }), /taskId/);
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [{ command: process.execPath, args: ["-e", "process.exit(1)"] }], ...approved([{ command: process.execPath, args: ["-e", "process.exit(1)"] }]) }), /gate failed/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [{ command: process.execPath, args: ["-e", ""] }], ...approved([{ command: process.execPath, args: ["-e", ""] }]), signal: controller.signal }), /cancelled before start/);
    writeFileSync(join(dir, ".claude", "gate-router.local.md"), "changed\n");
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [{ command: process.execPath, args: ["-e", ""] }], ...approved([{ command: process.execPath, args: ["-e", ""] }]) }), /externally trusted/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("receipt detects changes made during a gate and rejects wrong bindings", async () => {
  const { dir, git } = tempRepo();
  try {
    const policyPath = ".claude/gate-router.local.md";
    const trustedPolicyIdentity = receipt.policyIdentity(dir, policyPath);
    await assert.rejects(receipt.runVerifiedGates({
      root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity,
      gates: [{ command: process.execPath, args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'changed\\n')", join(dir, "app.txt")] }],
      ...approved([{ command: process.execPath, args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'changed\\n')", join(dir, "app.txt")] }]),
    }), /candidate content changed during verification/);
    writeFileSync(join(dir, "app.txt"), "baseline\n");
    const noOp = [{ command: process.execPath, args: ["-e", ""] }];
    const created = await receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: noOp, ...approved(noOp) });
    const validation = { root: dir, taskId: "T100", claimId: "C100", baseline: created.baseline, policyPath, trustedPolicyIdentity, ...approved(noOp) };
    assert.match(receipt.validateReceipt(created, { ...validation, taskId: "T101" }).reason, /task, claim, or baseline/);
    assert.match(receipt.validateReceipt({ ...created, gates: [{ ...created.gates[0], outputIdentity: "nope" }] }, validation).reason, /malformed/);
    assert.match(receipt.validateReceipt({ ...created, gates: [] }, validation).reason, /malformed/);
    const original = receipt.candidateContentIdentity(dir);
    chmodSync(join(dir, "app.txt"), 0o755);
    assert.notEqual(receipt.candidateContentIdentity(dir), original);
    git("add", "app.txt"); git("commit", "-qm", "mode change");
    const beforeRename = receipt.candidateContentIdentity(dir);
    git("mv", "app.txt", "renamed.txt");
    assert.notEqual(receipt.candidateContentIdentity(dir), beforeRename);
    unlinkSync(join(dir, "renamed.txt"));
    assert.notEqual(receipt.candidateContentIdentity(dir), beforeRename);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("receipt policy identity refuses symlinks outside the repository", () => {
  const { dir } = tempRepo();
  const outside = mkdtempSync(join(tmpdir(), "pi-capability-outside-"));
  try {
    writeFileSync(join(outside, "policy.md"), "external\n");
    symlinkSync(join(outside, "policy.md"), join(dir, ".claude", "linked-policy.md"));
    assert.throws(() => receipt.policyIdentity(dir, ".claude/linked-policy.md"), /escapes/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

await test("receipt binds argv to approved gates and bounds timeout, child cancellation, and output", async () => {
  const { dir } = tempRepo();
  try {
    const policyPath = ".claude/gate-router.local.md";
    const trustedPolicyIdentity = receipt.policyIdentity(dir, policyPath);
    const noOp = [{ command: process.execPath, args: ["-e", ""] }];
    const different = [{ command: process.execPath, args: ["-e", "process.stdout.write('unapproved')"] }];
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: different, ...approved(noOp) }), /approved gate policy/);
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: [{ command: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(300000))"] }], ...approved([{ command: process.execPath, args: ["-e", "process.stdout.write('x'.repeat(300000))"] }]) }), /output exceeded/);
    const pidFile = join(dir, "child.pid");
    const hanging = [{ command: process.execPath, timeoutMs: 100, args: ["-e", "const fs=require('node:fs'); const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(process.argv[1],String(c.pid)); setInterval(()=>{},1000)", pidFile] }];
    await assert.rejects(receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates: hanging, ...approved(hanging) }), /timed out/);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.ok(existsSync(pidFile));
    assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0), /ESRCH/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("receipt validation binds every result field and rejects symlinked gate directories", async () => {
  const { dir } = tempRepo();
  const outside = mkdtempSync(join(tmpdir(), "pi-capability-gate-outside-"));
  try {
    const policyPath = ".claude/gate-router.local.md";
    const trustedPolicyIdentity = receipt.policyIdentity(dir, policyPath);
    const gates = [{ command: process.execPath, args: ["-e", ""], timeoutMs: 500 }];
    const created = await receipt.runVerifiedGates({ root: dir, taskId: "T100", claimId: "C100", policyPath, trustedPolicyIdentity, gates, ...approved(gates) });
    const validation = { root: dir, taskId: "T100", claimId: "C100", baseline: created.baseline, policyPath, trustedPolicyIdentity, ...approved(gates) };
    for (const replacement of [
      { command: "other" }, { args: ["other"] }, { cwd: join(dir, ".claude") }, { timeoutMs: 1 },
      { exitCode: 1 }, { startedAt: "not-a-date" }, { finishedAt: "not-a-date" }, { outputIdentity: "0".repeat(64) },
    ]) {
      const tampered = { ...created, gates: [{ ...created.gates[0], ...replacement }] };
      assert.equal(receipt.validateReceipt(tampered, validation).ok, false);
    }
    symlinkSync(outside, join(dir, "linked-outside"));
    const escaped = [{ command: process.execPath, args: ["-e", "require('node:fs').writeFileSync('outside.txt','bad')"], cwd: "linked-outside" }];
    assert.throws(() => receipt.gateIdentity(dir, escaped), /escapes/);
    assert.equal(existsSync(join(outside, "outside.txt")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

await test("MCP policy gives direct and proxy calls identical allow decisions", () => {
  const rules = [{ server: "serving", operations: ["status"], requiredScope: "ops-readonly" }];
  for (const source of ["direct", "proxy"]) {
    const result = policy.authorizeMcpCall({ server: "serving", operation: "status", args: {}, callerScope: ["ops-readonly"], source }, rules);
    assert.equal(result.allowed, true);
  }
});

await test("MCP policy rejects renamed writes, repaired targets, child scope escape, and unresolved identities before execution", () => {
  const rules = [{ server: "serving", operations: ["status"], requiredScope: "ops-readonly" }];
  const denied = [
    { server: "serving", operation: "restart", args: {}, callerScope: ["ops-readonly"], source: "proxy" },
    { server: "serving", operation: "restart", args: { repaired: true }, callerScope: ["ops-readonly"], source: "repair" },
    { server: "serving", operation: "status", args: {}, callerScope: ["coding"], source: "child" },
    { server: "new-server", operation: "status", args: {}, callerScope: ["ops-readonly"], source: "proxy" },
  ];
  let fakeServerCalls = 0;
  for (const call of denied) {
    if (policy.authorizeMcpCall(call, rules).allowed) fakeServerCalls++;
  }
  assert.equal(fakeServerCalls, 0);
});

await test("MCP output is bounded and the default adapter configuration is isolated and inert", () => {
  assert.equal(policy.boundedOutput("x".repeat(20), 10).truncated, true);
  const source = readFileSync(join(pkg, "index.ts"), "utf8");
  assert.match(source, /hostConfigDiscovery: "off"/);
  assert.match(source, /scriptMode: false/);
  assert.match(source, /sampling: false/);
  assert.match(source, /mcpServers: \{\}/);
});

await test("documentation guard refuses private-looking questions and accepts bounded public version requests", () => {
  assert.equal(docs.isSafeDocumentationQuestion("How does package 1.2.3 configure retries?"), true);
  assert.equal(docs.isSafeDocumentationQuestion("token=abc"), false);
  assert.equal(docs.isSafeDocumentationQuestion("https://private.ts.net/v1"), false);
});

await test("candidate extension loads the pinned native documentation and isolated adapter resources once", async () => {
  const extension = (await jiti.import(join(pkg, "index.ts"))).default;
  const tools = []; const flags = []; const commands = []; const listeners = [];
  const pi = {
    registerTool(tool) { tools.push(tool); },
    registerFlag(name, value) { flags.push([name, value]); },
    registerCommand(name, value) { commands.push([name, value]); },
    on(event, handler) { listeners.push([event, handler]); },
    events: { on(event, handler) { listeners.push([event, handler]); }, emit() {} },
    getAllTools() { return tools; },
    getActiveTools() { return tools.map((tool) => tool.name); },
    setActiveTools() {},
  };
  extension(pi);
  assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
  assert.ok(tools.some((tool) => tool.name === "resolve-library-id"));
  assert.ok(tools.some((tool) => tool.name === "query-docs"));
  assert.ok(tools.some((tool) => tool.name === "mcp"));
  assert.ok(flags.some(([name]) => name === "mcp-config"));
  const queryDocs = tools.find((tool) => tool.name === "query-docs");
  await assert.rejects(
    queryDocs.execute("test", { libraryId: "/owner/package", version: "1.2.3", query: "token=private" }),
    /bounded public package question/,
  );
  const approval = listeners.find(([event]) => event === "pi-mcp-adapter:tool-approval-request")?.[1];
  let fakeServerExecutions = 0;
  for (const origin of ["direct", "proxy"]) {
    let policyHandler;
    approval({
      serverName: "unreviewed", originalToolName: "write", args: { target: "x" }, origin,
      claim(handler) { policyHandler = handler; return true; },
    });
    if (policyHandler() === "allow_once") fakeServerExecutions++;
  }
  assert.equal(fakeServerExecutions, 0);
});

await test("the real adapter approval boundary denies direct and proxy calls before a fake MCP server receives them", async () => {
  const extension = (await jiti.import(join(pkg, "index.ts"))).default;
  const listeners = [];
  const pi = {
    registerTool() {}, registerFlag() {}, registerCommand() {}, on() {},
    events: { on(event, handler) { listeners.push([event, handler]); } },
    getAllTools() { return []; }, getActiveTools() { return []; }, setActiveTools() {},
  };
  extension(pi);
  const approval = listeners.find(([event]) => event === "pi-mcp-adapter:tool-approval-request")?.[1];
  assert.equal(typeof approval, "function");
  const adapterApproval = await jiti.import(join(root, "node_modules", "pi-mcp-adapter", "tool-approval.ts"));
  const server = spawn(process.execPath, [join(pkg, "tests", "fake-mcp-server.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
  try {
    assert.deepEqual(await nextLine(server), { ready: true });
    for (const origin of ["direct", "proxy"]) {
      const approvalEvents = { emit(event, request) { if (event === "pi-mcp-adapter:tool-approval-request") approval(request); } };
      const state = {
        approvalEvents,
        config: { settings: { approveTools: true }, mcpServers: { fixture: { approveTools: true } } },
      };
      const result = await adapterApproval.ensureToolCallApproved(
        state, "fixture", { name: "fixture__write", originalName: "write" }, { target: "candidate" }, undefined, origin,
      );
      assert.deepEqual(result, { ok: false, reason: "denied" });
      if (result.ok) server.stdin.write(`${JSON.stringify({ method: "tools/call" })}\n`);
    }
    server.stdin.write(`${JSON.stringify({ method: "fixture/count" })}\n`);
    assert.deepEqual(await nextLine(server), { calls: 0 });
  } finally {
    server.kill("SIGTERM");
  }
});

await test("gate router preserves unusual filenames as data and rejects bad refs", () => {
  const { dir, git } = tempRepo();
  try {
    writeFileSync(join(dir, ".claude", "gate-router.local.md"), "---\nrules:\n  - **/*.py => printf '%s\\n' {files}\n---\n");
    writeFileSync(join(dir, "semi; name.py"), "pass\n");
    git("add", "semi; name.py");
    const script = join(pkg, "scripts", "gate-router.py");
    const listed = spawnSync("python3", [script, dir, "--json"], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(JSON.parse(listed.stdout).gates[0].files, ["semi; name.py"]);
    const badBase = spawnSync("python3", [script, dir, "--base", "--bad", "--json"], { encoding: "utf8" });
    assert.equal(badBase.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await test("State proof workflow checks content, policy, argv, and process bounds", () => {
  const result = spawnSync("python3", [join(pkg, "tests", "test_state_proof_workflow.py")], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
});

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exitCode = 1;
} else console.log(`\n${passed} tests passed`);

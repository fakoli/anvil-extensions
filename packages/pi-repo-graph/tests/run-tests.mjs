import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(pkg, '../..');
const product = resolve(bundle, 'node_modules/repo-graph-agent');
const rootManifest = JSON.parse(readFileSync(resolve(bundle, 'package.json'), 'utf8'));
const adapterManifest = JSON.parse(readFileSync(resolve(pkg, 'package.json'), 'utf8'));
const productManifest = JSON.parse(readFileSync(resolve(product, 'package.json'), 'utf8'));
const productLock = JSON.parse(readFileSync(resolve(bundle, 'package-lock.json'), 'utf8')).packages['node_modules/repo-graph-agent'];
assert.equal(productLock?.version, '0.6.0');
assert.match(productLock.resolved, /^git\+[^#]+github\.com[/:]fakoli\/repo-graph\.git#b21a7c19fc3f068d3b0227ba1fa6acd5eda17280$/);
assert.equal(productManifest.name, 'repo-graph-agent');
assert.equal(productManifest.version, '0.6.0');
assert.equal(rootManifest.dependencies['repo-graph-agent'], adapterManifest.dependencies['repo-graph-agent']);
assert.equal(rootManifest.dependencies['repo-graph-agent'], 'git+https://github.com/fakoli/repo-graph.git#v0.6.0');
assert.ok(rootManifest.pi.skills.includes('./node_modules/repo-graph-agent/skills'));
assert.deepEqual(productManifest.pi.skills, ['./skills']);
assert.equal(existsSync(resolve(pkg, 'repo_graph')), false, 'the adapter must not carry copied runtime');
assert.equal(existsSync(resolve(pkg, 'skills')), false, 'the adapter must not carry copied skill');
for (const script of ['repo_graph.py', 'build_repo_graph.py']) {
  const checked = spawnSync('python3', [resolve(pkg, 'scripts', script), '--help'], { cwd: bundle, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
}

// Real Pi discovery and bash execution, isolated from user settings and providers.
const scratch = mkdtempSync(resolve(tmpdir(), 'pi-repo-graph-'));
const home = resolve(scratch, 'home'), agentDir = resolve(home, '.pi/agent');
const repo = resolve(scratch, 'caller repo'), output = resolve(scratch, 'diagram output');
const standalone = resolve(scratch, 'standalone adapter');
mkdirSync(resolve(standalone, 'scripts'), { recursive: true });
for (const script of ['repo_graph.py', 'build_repo_graph.py']) {
  copyFileSync(resolve(pkg, 'scripts', script), resolve(standalone, 'scripts', script));
  const missing = spawnSync('python3', [resolve(standalone, 'scripts', script), '--help'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /dependency is missing; reinstall/);
}
mkdirSync(resolve(standalone, 'node_modules'), { recursive: true });
symlinkSync(product, resolve(standalone, 'node_modules/repo-graph-agent'), 'dir');
for (const script of ['repo_graph.py', 'build_repo_graph.py']) {
  const local = spawnSync('python3', [resolve(standalone, 'scripts', script), '--help'], { encoding: 'utf8' });
  assert.equal(local.status, 0, local.stderr);
}
mkdirSync(agentDir, { recursive: true });
mkdirSync(resolve(repo, 'src'), { recursive: true });
writeFileSync(resolve(repo, 'src/main.py'), 'import src.helper\n');
writeFileSync(resolve(repo, 'src/helper.py'), 'value = 1\n');
writeFileSync(resolve(agentDir, 'settings.json'), JSON.stringify({
  packages: [{ source: bundle, extensions: [], prompts: [], themes: [], skills: ['node_modules/repo-graph-agent/skills/**'] }],
}));
const piArgs = ['--mode', 'rpc', '--offline', '--no-session', '--no-extensions', '--no-context-files', '--no-prompt-templates', '--no-themes'];
const command = process.env.PI_TEST_BINARY ?? process.execPath;
const args = process.env.PI_TEST_BINARY ? piArgs : [resolve(bundle, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'), ...piArgs];
const child = spawn(command, args, { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'], env: {
  PATH: process.env.PATH, HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1',
} });
const closed = once(child, 'close');
let stderr = '', serial = 0;
child.stderr.on('data', data => { stderr += data; });
const lines = createInterface({ input: child.stdout });
function request(type, extra = {}) {
  return new Promise((accept, reject) => {
    const id = String(++serial);
    const timer = setTimeout(() => finish(new Error(`Pi ${type} timed out: ${stderr}`)), 30000);
    const onExit = () => finish(new Error(`Pi exited during ${type}: ${stderr}`));
    const onLine = line => {
      let value; try { value = JSON.parse(line); } catch { return; }
      if (value.type === 'response' && value.id === id) finish(null, value);
    };
    function finish(error, value) {
      clearTimeout(timer); lines.off('line', onLine); child.off('close', onExit);
      error ? reject(error) : accept(value);
    }
    lines.on('line', onLine); child.once('close', onExit);
    child.stdin.write(JSON.stringify({ id, type, ...extra }) + '\n');
  });
}
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
try {
  const commands = await request('get_commands');
  assert.equal(commands.success, true);
  const skill = commands.data.commands.find(entry => entry.name === 'skill:repo-graph');
  assert.ok(skill, 'root bundle must discover /skill:repo-graph');
  assert.equal(resolve(skill.sourceInfo.path), resolve(product, 'skills/repo-graph/SKILL.md'));
  const script = resolve(pkg, 'scripts/build_repo_graph.py');
  const adapterCli = resolve(pkg, 'scripts/repo_graph.py');
  const cli = resolve(dirname(skill.sourceInfo.path), '../../scripts/repo_graph.py');
  const command = `python3 ${quote(script)} --output ${quote(output)}`;
  for (let run = 0; run < 2; run++) {
    const result = await request('bash', { command });
    assert.equal(result.success, true);
    assert.equal(result.data.exitCode, 0, result.data.output);
    const graph = JSON.parse(readFileSync(resolve(output, 'graph.json'), 'utf8'));
    assert.equal(graph.name, 'caller repo');
    assert.deepEqual(graph.files, ['src/helper.py', 'src/main.py']);
    assert.equal(graph.scan.reused, run ? 2 : 0);
    assert.equal(graph.search.documents, 2);
    assert.equal(graph.search.reused, run ? 2 : 0);
    assert.equal(graph.jev, 'off');
    for (const file of ['architecture.html', 'graph.html', 'architecture.mmd', 'architecture.md']) {
      assert.ok(readFileSync(resolve(output, file)).length > 0, file);
    }
  }
  for (const runner of [cli, adapterCli]) {
    const mapped = await request('bash', { command: `python3 ${quote(runner)} map --output ${quote(output)}` });
    assert.equal(mapped.data.exitCode, 0, mapped.data.output);
  }
  const found = await request('bash', { command: `python3 ${quote(cli)} search ${quote(output)} helper --mode keyword --limit 1` });
  assert.equal(found.data.exitCode, 0, found.data.output);
  const hits = JSON.parse(found.data.output);
  assert.equal(hits.documents, 2);
  assert.equal(hits.results.length, 1);
  assert.equal(hits.results[0].path, 'src/helper.py');
  const rejected = await request('bash', { command: `python3 ${quote(script)} --output .` });
  assert.notEqual(rejected.data.exitCode, 0, 'output inside source must be refused');
  const rejectedCli = await request('bash', { command: `python3 ${quote(cli)} map --output src` });
  assert.notEqual(rejectedCli.data.exitCode, 0, 'shared CLI must refuse output inside source');
  console.log('Canonical Pi skill discovery, compatibility entrypoints, caller directory, artifacts, keyword search, cache reuse and source-output rejection passed (no model calls)');
} finally {
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await closed;
  clearTimeout(killTimer); lines.close();
  rmSync(scratch, { recursive: true, force: true });
}

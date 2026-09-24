import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(pkg, '../..');
for (const [command, args] of [
  ['python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-v']],
  [process.execPath, ['tests/test_repo_graph_views.cjs']],
]) {
  const result = spawnSync(command, args, { cwd: pkg, stdio: 'inherit' });
  assert.equal(result.status, 0, result.error?.message ?? command);
}
for (const [, digest, path] of readFileSync(resolve(pkg, 'UPSTREAM.md'), 'utf8').matchAll(/^([a-f0-9]{64})  (.+)$/gm)) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(pkg, path))).digest('hex'), digest, path);
}

// Real Pi discovery and bash execution, isolated from user settings and providers.
const scratch = mkdtempSync(resolve(tmpdir(), 'pi-repo-graph-'));
const home = resolve(scratch, 'home'), agentDir = resolve(home, '.pi/agent');
const repo = resolve(scratch, 'caller repo'), output = resolve(scratch, 'diagram output');
mkdirSync(agentDir, { recursive: true });
mkdirSync(resolve(repo, 'src'), { recursive: true });
writeFileSync(resolve(repo, 'src/main.py'), 'import src.helper\n');
writeFileSync(resolve(repo, 'src/helper.py'), 'value = 1\n');
writeFileSync(resolve(agentDir, 'settings.json'), JSON.stringify({
  packages: [{ source: bundle, extensions: [], prompts: [], themes: [], skills: ['packages/pi-repo-graph/skills/**'] }],
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
  const script = resolve(dirname(skill.sourceInfo.path), '../../scripts/build_repo_graph.py');
  const command = `python3 ${quote(script)} --output ${quote(output)}`;
  for (let run = 0; run < 2; run++) {
    const result = await request('bash', { command });
    assert.equal(result.success, true);
    assert.equal(result.data.exitCode, 0, result.data.output);
    const graph = JSON.parse(readFileSync(resolve(output, 'graph.json'), 'utf8'));
    assert.equal(graph.name, 'caller repo');
    assert.deepEqual(graph.files, ['src/helper.py', 'src/main.py']);
    assert.equal(graph.scan.reused, run ? 2 : 0);
    assert.equal(graph.jev, 'off');
    for (const file of ['architecture.html', 'graph.html', 'architecture.mmd', 'architecture.md']) {
      assert.ok(readFileSync(resolve(output, file)).length > 0, file);
    }
  }
  const rejected = await request('bash', { command: `python3 ${quote(script)} --output .` });
  assert.notEqual(rejected.data.exitCode, 0, 'output inside source must be refused');
  console.log('Pi package discovery, caller-directory execution, artifacts and cache reuse passed (no model calls)');
} finally {
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await closed;
  clearTimeout(killTimer); lines.close();
  rmSync(scratch, { recursive: true, force: true });
}

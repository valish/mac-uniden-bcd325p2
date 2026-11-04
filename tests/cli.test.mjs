import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/plan.json', import.meta.url));
function invoke(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(Error('CLI did not finish'));
    }, 10000);
    child.on('error', reject);
    child.stdout.setEncoding('utf8').on('data', (data) => (stdout += data));
    child.stderr.setEncoding('utf8').on('data', (data) => (stderr += data));
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
async function temporary(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bcd325p2-cli-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test('CLI help, validation and invalid-input exit codes work in a real process', async () => {
  const help = await invoke(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /agent-config/);
  const good = await invoke(['validate', fixture]);
  assert.equal(good.code, 0);
  assert.equal(JSON.parse(good.stdout).valid, true);
  const bad = await invoke(['validate']);
  assert.equal(bad.code, 1);
  assert.equal(bad.stdout, '');
  assert.match(JSON.parse(bad.stderr).error, /exactly one input file/);
});
test('CLI stages a portable plan, returns MCP config, and refuses overwriting exports', () =>
  temporary(async (dir) => {
    const staged = await invoke(['stage', fixture, '--data-dir', dir]);
    assert.equal(staged.code, 0);
    const record = JSON.parse(staged.stdout);
    assert.equal(JSON.parse(await fs.readFile(record.path, 'utf8')).compiled.id, record.planId);
    const config = await invoke(['agent-config', '--data-dir', dir]);
    const entry = JSON.parse(config.stdout).mcpServers['uniden-bcd325p2'];
    assert.equal(entry.command, process.execPath);
    assert.deepEqual(entry.args, [cli, 'mcp', '--data-dir', dir]);
    const out = path.join(dir, 'export.json');
    assert.equal((await invoke(['compile', fixture, '--out', out])).code, 0);
    const first = await fs.readFile(out, 'utf8');
    assert.equal((await invoke(['compile', fixture, '--out', out])).code, 1);
    assert.equal(await fs.readFile(out, 'utf8'), first);
  }));
test('MCP CLI exchanges newline-framed JSON-RPC without stdout chatter', () =>
  temporary(async (dir) => {
    const messages = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'synthetic-test', version: '1' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'scanner_list_plans', arguments: {} },
      },
    ];
    const response = await invoke(
      ['mcp', '--data-dir', dir],
      messages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    );
    assert.equal(response.code, 0);
    assert.equal(response.stderr, '');
    const lines = response.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      lines.map((m) => m.id),
      [1, 2, 3],
    );
    assert.equal(lines[0].result.protocolVersion, '2025-11-25');
    assert.equal(lines[1].result.tools.length, 7);
    assert.equal(lines[2].result.isError, false);
  }));

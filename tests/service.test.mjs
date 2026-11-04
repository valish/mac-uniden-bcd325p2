import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { Store } from '../src/store.mjs';
import { createHandler } from '../src/server.mjs';
import { MCPServer, runMCP } from '../src/mcp.mjs';
const input = JSON.parse(
  await fs.readFile(new URL('./fixtures/plan.json', import.meta.url), 'utf8'),
);
async function temporary(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bcd325p2-test-'));
  try {
    return await fn(await new Store(dir).init());
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function request(store, method, url, payload, headers = {}) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.url = url;
  req.headers = {
    host: '127.0.0.1:8326',
    origin: 'http://127.0.0.1:8326',
    'x-scanner-token': 'test-token',
    'content-type': 'application/json',
    ...headers,
  };
  const response = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  await createHandler({ store, token: 'test-token', getPort: () => 8326 })(req, response);
  return { ...response, json: () => JSON.parse(response.body.toString()) };
}
test('private durable store stages immutable plans and rejects traversal/symlink reads', () =>
  temporary(async (store) => {
    const staged = await store.stage(input);
    assert.equal((await store.plans()).length, 1);
    assert.equal((await store.read(staged.file)).compiled.id, staged.planId);
    assert.equal((await fs.stat(staged.path)).mode & 0o777, 0o600);
    assert.throws(() => store.filename('../outside.json'));
    const name = 'plan-symlink.json';
    await fs.symlink(staged.path, path.join(store.directory, name));
    await assert.rejects(store.read(name), /symlink/);
  }));
test('recovery uses matching incomplete receipt, preserves prior managed records, and clears after completion', () =>
  temporary(async (store) => {
    const staged = await store.stage(input),
      identity = { model: 'BCD325P2', firmware: 'Version 1.11.11' },
      a = { name: 'UT A', index: 0, quickKey: 1 },
      b = { name: 'UT B', index: 4, quickKey: 2 };
    await store.save('receipt', {
      planId: staged.planId,
      identity,
      status: 'incomplete',
      systems: [b],
      resume: { systems: [a] },
    });
    assert.equal((await store.recovery(staged.planId)).systems.length, 2);
    await store.save('receipt', {
      planId: staged.planId,
      identity,
      status: 'complete',
      systems: [a, b],
    });
    assert.equal(await store.recovery(staged.planId), null);
  }));
test('HTTP boundaries reject cross-origin writes, wrong hosts and filesystem escape', () =>
  temporary(async (store) => {
    assert.equal(
      (await request(store, 'GET', '/api/session', undefined, { host: 'attacker.test' })).status,
      403,
    );
    assert.equal(
      (
        await request(
          store,
          'POST',
          '/api/stage',
          { plan: input },
          { origin: 'https://attacker.test' },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request(store, 'POST', '/api/stage', { plan: input }, { 'x-scanner-token': 'wrong' }))
        .status,
      403,
    );
    assert.equal((await request(store, 'GET', '/api/record?file=../../secret.json')).status, 400);
    assert.equal((await request(store, 'GET', '/../LICENSE')).status, 404);
    assert.equal((await store.plans()).length, 0);
  }));
test('receipt recovery orders actual writes rather than random filename suffixes', () =>
  temporary(async (store) => {
    const { planId } = await store.stage(input);
    const receipt = {
      planId,
      identity: { model: 'BCD325P2', firmware: 'Version 1.11.11' },
      systems: [{ name: 'UT A', index: 0, quickKey: 1 }],
    };
    const older = store.filename('receipt-20260101000000000-ffff.json');
    const newer = store.filename('receipt-20260101000000000-0000.json');
    await fs.writeFile(older, JSON.stringify({ ...receipt, status: 'incomplete' }));
    await fs.writeFile(newer, JSON.stringify({ ...receipt, status: 'complete' }));
    await fs.utimes(older, 1, 1);
    await fs.utimes(newer, 2, 2);
    assert.equal(await store.recovery(planId), null);
    assert.equal((await store.history())[0].status, 'complete');
  }));
test('HTTP plan validation, staging, inbox and record read share the same compiled identity', () =>
  temporary(async (store) => {
    const validated = await request(store, 'POST', '/api/validate', { plan: input });
    assert.equal(validated.status, 200);
    const staged = await request(store, 'POST', '/api/stage', { plan: input });
    assert.equal(staged.status, 200);
    const inbox = await request(store, 'GET', '/api/plans');
    assert.equal(inbox.json()[0].id, validated.json().plan.id);
    const loaded = await request(store, 'GET', '/api/record?file=' + staged.json().file);
    assert.deepEqual(loaded.json().input, input);
    const bad = structuredClone(input);
    bad.systems[0].groups[0].channels[0].frequencyMHz = '880.0000';
    assert.equal((await request(store, 'POST', '/api/stage', { plan: bad })).status, 400);
  }));
test('HTTP assets include the runtime policy headers and do not expose arbitrary source files', () =>
  temporary(async (store) => {
    for (const file of [
      '/',
      '/app.mjs',
      '/style.css',
      '/icon.svg',
      '/fonts/IBMPlexSans-Regular.woff2',
      '/fonts/IBMPlexSans-SemiBold.woff2',
      '/src/plan.mjs',
      '/src/schema.mjs',
      '/src/protocol.mjs',
      '/src/transport.mjs',
      '/example.json',
      '/agent-start',
      '/llms.txt',
    ]) {
      const r = await request(store, 'GET', file);
      assert.equal(r.status, 200, file);
      assert.equal(r.headers['Cache-Control'], 'no-store');
      assert.ok(r.headers['Content-Security-Policy'].includes("script-src 'self'"));
      if (file.endsWith('.woff2')) {
        assert.equal(r.headers['Content-Type'], 'font/woff2');
        assert.equal(r.body.subarray(0, 4).toString(), 'wOF2');
      }
    }
    assert.equal((await request(store, 'GET', '/src/store.mjs')).status, 404);
  }));
async function initialize(service) {
  const init = await service.dispatch({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  });
  assert.equal(init.result.protocolVersion, '2025-11-25');
  await service.dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' });
}
test('MCP lifecycle negotiates versions and lists tools without a hardware-write capability', () =>
  temporary(async (store) => {
    const mcp = new MCPServer(store);
    assert.equal(
      (await mcp.dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).error.code,
      -32002,
    );
    await initialize(mcp);
    const response = await mcp.dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(response.result.tools.length, 7);
    assert.ok(response.result.tools.every((x) => !x.name.includes('program')));
    assert.equal(
      (await mcp.dispatch({ jsonrpc: '2.0', id: 3, method: 'unknown' })).error.code,
      -32601,
    );
  }));
test('MCP validates and stages plans, reports source errors, and reads schema/prompt resources', () =>
  temporary(async (store) => {
    const mcp = new MCPServer(store);
    await initialize(mcp);
    const call = (name, args) =>
      mcp.dispatch({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name, arguments: args },
      });
    const valid = await call('scanner_validate_plan', { plan: input });
    assert.equal(valid.result.isError, false);
    assert.equal((await store.plans()).length, 0);
    const staged = await call('scanner_stage_plan', { plan: input });
    assert.equal(staged.result.structuredContent.staged, true);
    assert.equal((await store.plans()).length, 1);
    const bad = await call('scanner_validate_plan', { plan: {} });
    assert.equal(bad.result.isError, true);
    const arbitrary = await call('scanner_read_plan', { file: '../../private.json' });
    assert.equal(arbitrary.result.isError, true);
    const schema = await mcp.dispatch({
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'scanner://schema/plan' },
    });
    assert.ok(schema.result.contents[0].text.includes('bcd325p2-plan-v1'));
    const prompt = await mcp.dispatch({
      jsonrpc: '2.0',
      id: 6,
      method: 'prompts/get',
      params: { name: 'plan_listening_area', arguments: { areas: 'Example County' } },
    });
    assert.ok(prompt.result.messages[0].content.text.includes('Example County'));
  }));
test('MCP stdio emits only newline-delimited JSON-RPC and recovers from malformed input', () =>
  temporary(async (store) => {
    const messages = [
      'not json',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ];
    let output = '';
    const sink = new Writable({
      write(chunk, encoding, done) {
        output += chunk.toString();
        done();
      },
    });
    await runMCP({
      directory: store.directory,
      input: Readable.from([messages.join('\n') + '\n']),
      output: sink,
    });
    const replies = output
      .trim()
      .split('\n')
      .map((x) => JSON.parse(x));
    assert.equal(replies.length, 3);
    assert.equal(replies[0].error.code, -32700);
    assert.equal(replies[1].result.protocolVersion, '2025-06-18');
    assert.equal(replies[2].result.tools.length, 7);
  }));

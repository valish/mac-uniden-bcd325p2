import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Programmer, setCommand, parseResponse, quickPosition } from '../src/protocol.mjs';
import { compilePlan } from '../src/plan.mjs';
import { Radio } from './radio.mjs';
const input = JSON.parse(fs.readFileSync(new URL('./fixtures/plan.json', import.meta.url)));
const { plan } = await compilePlan(input);
function setup(radio = new Radio(), failSave) {
  const saved = [];
  const p = new Programmer(radio, {
    save: async (kind, data) => {
      if (failSave) await failSave(kind, data);
      saved.push({ kind, data: structuredClone(data) });
      return { file: 'simulated.json' };
    },
  });
  return { radio, p, saved };
}
function ticket(receipt) {
  return {
    planId: plan.id,
    model: receipt.identity.model,
    firmware: receipt.identity.firmware,
    systems: receipt.systems,
  };
}
const count = (radio, kind) => [...radio.nodes.values()].filter((n) => n.kind === kind).length;
test('complete conventional/P25 upload, persisted finalization, verification, then duplicate refusal', async () => {
  const { radio, p, saved } = setup(),
    receipt = await p.install(plan);
  assert.equal(receipt.status, 'complete');
  assert.equal(radio.program, false);
  assert.equal(saved[0].kind, 'backup');
  assert.equal(count(radio, 'CIN'), 2);
  assert.equal(count(radio, 'TIN'), 1);
  assert.equal(count(radio, 'SIF'), 2);
  assert.equal(count(radio, 'TFQ'), 3);
  assert.equal(radio.pages[0], '1000020000');
  const q = radio.commands.findIndex((c) => c.startsWith('QSL,')),
    channel = radio.commands.findLastIndex((c) => /^(CIN|TIN),/.test(c));
  assert.ok(
    radio.commands
      .slice(
        radio.commands.findIndex((c) => c.startsWith('ACT,')),
        q,
      )
      .includes('EPG'),
  );
  assert.ok(radio.commands.slice(q, channel).includes('EPG'));
  assert.equal((await p.verify(plan)).enabledNames.length, 1);
  await assert.rejects(p.install(plan), /Matching system names/);
  assert.equal(radio.systems.length, 2);
  assert.ok(!radio.commands.some((c) => /^(CLR|DSY|DGR|DCH|POF)(,|$)/.test(c)));
});
test('zero is a valid allocated memory handle; -1 is only an end/failure sentinel', async () => {
  const { radio, p } = setup();
  radio.next = 0;
  const receipt = await p.install(plan);
  assert.equal(receipt.systems[0].index, 0);
  assert.equal(p.index('0', false), 0);
  assert.equal(p.index('-1'), -1);
  assert.throws(() => p.index('-1', false));
  assert.throws(() => p.index(''));
});
test('preserves existing systems, global settings and an occupied quick key', async () => {
  const { radio, p } = setup();
  await radio.exchange('PRG');
  const id = +(await radio.exchange('CSY,CNV,0')).split(',')[1];
  await radio.exchange(
    setCommand('SIN', id, { name: 'Existing user', quickKey: 1, delay: 5, lockout: 0 }),
  );
  await radio.exchange('EPG');
  const receipt = await p.install(plan);
  assert.equal(receipt.quickKeys[plan.systems[0].name], 10);
  assert.equal(radio.nodes.get(id).r[2], 'Existing user');
  assert.equal(radio.nodes.get(id).r[6], '5');
  assert.equal(radio.pages[0][0], '1');
});
test('wrong model and failed durable backup prevent allocation', async () => {
  const wrong = setup();
  wrong.radio.model = 'BC125AT';
  await assert.rejects(wrong.p.install(plan), /requires a BCD325P2/);
  assert.ok(!wrong.radio.commands.includes('PRG'));
  const disk = setup(new Radio(), () => {
    throw Error('disk full');
  });
  await assert.rejects(disk.p.install(plan), /disk full/);
  assert.equal(disk.radio.systems.length, 0);
  assert.equal(disk.radio.program, false);
});
test('command errors and corrupted readbacks stop before the next channel', async () => {
  for (const type of ['error', 'corrupt']) {
    const { radio, p } = setup();
    if (type === 'error') radio.fail = (c) => c.startsWith('CIN,') && c.split(',').length > 2;
    else
      radio.corrupt = (c, line) =>
        c.startsWith('CIN,') ? line.replace('01551000', '01551010') : line;
    await assert.rejects(p.install(plan), type === 'error' ? /rejected CIN/ : /frequency/);
    assert.equal(radio.commands.filter((c) => c.startsWith('ACC,')).length, 1);
    assert.equal(radio.program, false);
    assert.equal(p.receipt.status, 'incomplete');
  }
});
test('stop request exits Remote Mode without another allocation', async () => {
  const { radio, p } = setup(),
    exchange = radio.exchange.bind(radio);
  radio.exchange = async (c) => {
    const r = await exchange(c);
    if (c.startsWith('ACC,')) p.cancelled = true;
    return r;
  };
  await assert.rejects(p.install(plan), /Stopped by user/);
  assert.equal(radio.program, false);
  assert.equal(count(radio, 'CIN'), 1);
});
test('reserved P25 fields are omitted while applicable receive settings remain strict', async () => {
  const { radio, p } = setup();
  await p.install(plan);
  const digital = [...radio.nodes.values()].find((n) => n.kind === 'CIN' && n.r[16] === '2');
  assert.equal(digital.r[4], '');
  assert.equal(digital.r[17], 'SRCH');
  const site = [...radio.nodes.values()].find((n) => n.kind === 'SIF');
  assert.equal(site.r[6], '');
  assert.equal(site.r[8], '');
  const tg = [...radio.nodes.values()].find((n) => n.kind === 'TIN');
  assert.equal(tg.r[12], '');
  digital.r[17] = '293';
  await assert.rejects(p.verify(plan), /nac/);
});
test('receipt-scoped recovery resumes a partial upload without duplicate channels', async () => {
  const { radio, p: old } = setup(),
    original = old.channelValues.bind(old);
  old.channelValues = (c, t) => ({
    ...original(c, t),
    ...(t === 'CNV' && c.audio === '2' ? { tone: '0' } : {}),
  });
  await assert.rejects(old.install(plan), /tone/);
  assert.equal(count(radio, 'CIN'), 2);
  const { p } = setup(radio);
  const receipt = await p.install({ ...plan, resume: ticket(old.receipt) });
  assert.equal(receipt.status, 'complete');
  assert.equal(count(radio, 'CIN'), 2);
  assert.equal(radio.systems.length, 2);
});
test('recovery refuses modified channel identities before making writes', async () => {
  const { radio, p: old } = setup(),
    original = old.channelValues.bind(old);
  old.channelValues = (c, t) => ({
    ...original(c, t),
    ...(t === 'CNV' && c.audio === '2' ? { tone: '0' } : {}),
  });
  await assert.rejects(old.install(plan), /tone/);
  [...radio.nodes.values()].find((n) => n.kind === 'CIN').r[2] = '01551010';
  radio.commands = [];
  const { p } = setup(radio);
  await assert.rejects(p.install({ ...plan, resume: ticket(old.receipt) }), /frequency/);
  assert.ok(!radio.commands.some((c) => /^(CSY|AGC|ACC|ACT|AST),/.test(c)));
});
test('full-memory recovery after finalization error makes no further allocations', async () => {
  const { radio, p: old } = setup(),
    exchange = radio.exchange.bind(radio);
  let afterWrite = false;
  radio.exchange = async (c) => {
    const r = await exchange(c);
    if (c.startsWith('QSL,')) afterWrite = true;
    if (c === 'QSL' && afterWrite) return 'QSL,' + Array(10).fill('0000000000').join(',');
    return r;
  };
  await assert.rejects(old.install(plan), /quick-key readback mismatch/);
  radio.exchange = exchange;
  radio.commands = [];
  const { p } = setup(radio);
  await p.install({ ...plan, resume: ticket(old.receipt) });
  assert.ok(!radio.commands.some((c) => /^(CSY|AGC|AGT|ACT|ACC|AST),/.test(c)));
  await p.verify(plan);
});
test('verification detects group lockout, missing keys, and saved system lockout', async () => {
  for (const change of ['group', 'key', 'lockout']) {
    const { radio, p } = setup();
    await p.install(plan);
    const system = radio.nodes.get(radio.systems[0]);
    if (change === 'group') system.groupKeys = '2000000000';
    if (change === 'key') system.r[3] = '';
    if (change === 'lockout') system.r[5] = '1';
    await assert.rejects(p.verify(plan), /Group listening|quick-key|lockout/);
  }
});
test('resuming a partial P25 system accounts for its missing sites before writing', async () => {
  const { radio, p: old } = setup();
  radio.fail = (c) => c.startsWith('AST,') && count(radio, 'SIF') === 1;
  await assert.rejects(old.install(plan), /rejected AST/);
  assert.equal(count(radio, 'SIF'), 1);
  radio.fail = null;
  const exchange = radio.exchange.bind(radio);
  radio.exchange = async (c) => {
    const response = await exchange(c);
    if (c !== 'MEM') return response;
    const fields = response.split(',');
    fields[3] = '1000';
    return fields.join(',');
  };
  radio.commands = [];
  const { p } = setup(radio);
  await assert.rejects(
    p.install({ ...plan, resume: ticket(old.receipt) }),
    /Insufficient scanner memory/,
  );
  assert.ok(!radio.commands.some((c) => /^(CSY|AGC|AGT|ACC|ACT|AST),/.test(c)));
});
test('protected and cyclic existing systems stop before any additions', async () => {
  for (const problem of ['protected', 'cycle']) {
    const { radio, p } = setup();
    await radio.exchange('PRG');
    const id = +(await radio.exchange('CSY,CNV,0')).split(',')[1];
    await radio.exchange('EPG');
    radio.nodes.get(id).r[problem === 'protected' ? 27 : 13] =
      problem === 'protected' ? '1' : String(id);
    await assert.rejects(p.install(plan), problem === 'protected' ? /Protected/ : /cyclic/);
    assert.equal(radio.systems.length, 1);
  }
});
test('wire formatting rejects command injection and malformed replies', () => {
  assert.equal(quickPosition(90)[1], 9);
  assert.equal(quickPosition(91)[1], 0);
  assert.throws(() => setCommand('CIN', 0, { name: 'bad\rCLR' }));
  assert.throws(() => setCommand('SIN', -1, { name: 'bad' }));
  for (const line of ['ERR', 'MDL,NG', 'VER,other', 'MDL,BCD325P2\r'])
    assert.throws(() => parseResponse('MDL', line));
});
test('preview examples cannot be programmed', async () => {
  const { radio, p } = setup();
  await assert.rejects(p.install({ ...plan, example: true }), /Example plans/);
  assert.equal(radio.commands.length, 0);
});

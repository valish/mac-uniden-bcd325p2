import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectPlan, compilePlan, frequencyToWire, researchBrief } from '../src/plan.mjs';
import { parseCSV, importCSV, exportCSV } from '../src/csv.mjs';
const base = JSON.parse(fs.readFileSync(new URL('./fixtures/plan.json', import.meta.url)));
const clone = () => structuredClone(base);
test('compiles conventional, conventional P25 and trunk records without losing full names', async () => {
  const result = await compilePlan(base);
  assert.deepEqual(result.plan.counts, {
    conventional: 2,
    talkgroups: 1,
    sites: 2,
    siteFrequencies: 3,
    systems: 2,
  });
  assert.equal(result.plan.systems[0].groups[0].channels[0].frequency, '01551000');
  assert.equal(result.plan.systems[0].groups[0].channels[1].audio, '2');
  assert.equal(result.plan.systems[1].groups[0].channels[0].tgid, 101);
  assert.ok(result.warnings.some((x) => x.message.includes('No source')));
});
test('fingerprints follow configuration, not object order or research prose', async () => {
  const a = await compilePlan(base),
    input = clone();
  input.notes = 'Source commentary';
  input.sources = [];
  const b = await compilePlan(input);
  assert.equal(a.plan.id, b.plan.id);
  input.systems[0].groups[0].channels[0].frequencyMHz = '155.3000';
  assert.notEqual(a.plan.id, (await compilePlan(input)).plan.id);
});
test('channel labels fit ASCII scanner storage and collision suffixes remain unique', async () => {
  const input = clone(),
    channels = input.systems[0].groups[0].channels;
  channels[0].name = 'Émergency department north dispatch';
  channels[1].name = 'Émergency department north response';
  const { plan } = await compilePlan(input),
    labels = plan.systems[0].groups[0].channels.map((c) => c.name);
  assert.equal(new Set(labels).size, 2);
  assert.ok(labels.every((x) => x.length <= 16 && /^[\x20-\x7e]+$/.test(x)));
  assert.equal(plan.systems[0].groups[0].channels[0].fullName, channels[0].name);
});
test('frequency conversion is exact at wire precision and rejects excluded bands', () => {
  assert.equal(frequencyToWire('162.55'), '01625500');
  assert.equal(frequencyToWire('960.0000'), '09600000');
  assert.equal(frequencyToWire('851.00625'), '08510062');
  for (const f of [
    '24.9999',
    '512.0000',
    '700.0000',
    '824.0000',
    '880.0000',
    '849.0000',
    '894.0000',
    '960.0001',
    '155100000',
    '155.12344',
  ])
    assert.throws(() => frequencyToWire(f));
});
test('rejects malformed types, unknown keys, duplicate keys, invalid dates and broken references', () => {
  const mutations = [
    (p) => (p.systems[0].quickKey = 6),
    (p) => (p.systems[0].typo = true),
    (p) => (p.systems[0].enabled = 'true'),
    (p) => (p.researchDate = '2026-02-30'),
    (p) => (p.systems[0].groups[0].channels[0].sourceIds = ['missing']),
    (p) =>
      p.sources.push({
        id: 'bad',
        title: 'Bad',
        url: 'javascript:alert(1)',
        checked: '2026-11-03',
      }),
    (p) => (p.systems[0].groups[0].channels[0].frequencyMHz = 155.1),
  ];
  for (const mutate of mutations) {
    const p = clone();
    mutate(p);
    assert.equal(inspectPlan(p).valid, false);
  }
});
test('requires sites and TGIDs for P25 and forbids conventional frequency fields in talkgroups', () => {
  for (const mutate of [
    (p) => delete p.systems[1].sites,
    (p) => delete p.systems[1].groups[0].channels[0].tgid,
    (p) => (p.systems[1].groups[0].channels[0].frequencyMHz = '155.1000'),
    (p) => (p.systems[1].groups[0].channels[0].encryption = 'encrypted'),
    (p) => (p.systems[0].sites = [{ name: 'Wrong', frequencies: ['155.1000'] }]),
  ]) {
    const input = clone();
    mutate(input);
    assert.equal(inspectPlan(input).valid, false);
  }
});
test('enforces per-group limits and at least one group', () => {
  const p = clone();
  p.systems[1].groups[0].channels = Array.from({ length: 501 }, (_, i) => ({
    name: `TG ${i}`,
    tgid: i + 1,
    encryption: 'clear',
  }));
  assert.equal(inspectPlan(p).valid, false);
  p.systems[1].groups = [];
  assert.equal(inspectPlan(p).valid, false);
});
test('CSV supports quoted fields, embedded newlines and exact conventional settings', async () => {
  const simple =
    'system,group,name,frequency_mhz,mode,quick_key,group_key,enabled\r\nLocal,Main,"Fire, dispatch",155.1000,NFM,1,1,true\r\n';
  const plan = importCSV(simple);
  assert.equal(plan.systems[0].groups[0].channels[0].name, 'Fire, dispatch');
  await compilePlan(plan);
  assert.deepEqual(parseCSV('a,b\n"one\ntwo","quote ""inside"""\n'), [
    { a: 'one\ntwo', b: 'quote "inside"' },
  ]);
  const exported = exportCSV(plan);
  assert.equal(importCSV(exported).systems[0].groups[0].channels[0].frequencyMHz, '155.1000');
});
test('CSV rejects malformed quoting, unknown columns, inconsistent group settings and formula export hazards', () => {
  for (const csv of ['a,b\n"bad,b', 'a,b\n"one"oops,b', 'a,a\nx,y', 'a,b\nx'])
    assert.throws(() => parseCSV(csv));
  assert.throws(() =>
    importCSV(
      'system,group,name,frequency_mhz,mode,quick_key,group_key,enabled,foo\nS,G,N,155.1000,FM,1,1,true,x',
    ),
  );
  const p = clone();
  p.systems.pop();
  p.systems[0].groups[0].channels[0].name = '=BAD()';
  assert.ok(exportCSV(p).includes("'=BAD()"));
  assert.throws(() => exportCSV(base), /conventional-only/);
});
test('research brief uses requested areas and requires research and hardware evidence', () => {
  const brief = researchBrief({ areas: 'Example county', interests: 'Rail and weather' });
  assert.ok(brief.includes('Example county'));
  assert.ok(brief.includes('Rail and weather'));
  assert.ok(brief.includes('completed receipt'));
  assert.throws(() => researchBrief({ areas: '' }));
  assert.throws(() => researchBrief({ areas: 'x'.repeat(4001) }));
});

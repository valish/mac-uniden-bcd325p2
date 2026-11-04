// Wire positions checked against Uniden BCD325P2 Remote Protocol v1.02, pp. 14–25.
// Request fields and response fields are deliberately separate; their offsets differ.
export const maps = {
  SIN: {
    size: 22,
    fields: { name: 2, quickKey: 3, hold: 4, lockout: 5, delay: 6 },
    read: { type: 1, name: 2, quickKey: 3, hold: 4, lockout: 5, delay: 6 },
    next: 13,
    head: 14,
    min: 28,
  },
  SIF: {
    size: 20,
    fields: {
      name: 2,
      quickKey: 3,
      hold: 4,
      lockout: 5,
      modulation: 6,
      attenuator: 7,
      controlOnly: 8,
      gps: 15,
    },
    read: {
      name: 2,
      quickKey: 3,
      hold: 4,
      lockout: 5,
      modulation: 6,
      attenuator: 7,
      controlOnly: 8,
      gps: 21,
    },
    next: 12,
    head: 14,
    min: 26,
  },
  GIN: {
    size: 8,
    fields: { name: 2, quickKey: 3, lockout: 4, gps: 8 },
    read: { name: 2, quickKey: 3, lockout: 4, gps: 14 },
    next: 6,
    head: 8,
    min: 14,
  },
  CIN: {
    size: 18,
    fields: {
      name: 2,
      frequency: 3,
      modulation: 4,
      tone: 5,
      toneLock: 6,
      lockout: 7,
      priority: 8,
      attenuator: 9,
      alert: 10,
      alertLevel: 11,
      audio: 13,
      nac: 14,
      numberTag: 15,
      color: 16,
      pattern: 17,
      offset: 18,
    },
    read: {
      name: 1,
      frequency: 2,
      modulation: 3,
      tone: 4,
      toneLock: 5,
      lockout: 6,
      priority: 7,
      attenuator: 8,
      alert: 9,
      alertLevel: 10,
      audio: 16,
      nac: 17,
      numberTag: 18,
      color: 19,
      pattern: 20,
      offset: 21,
    },
    next: 12,
    min: 21,
  },
  TIN: {
    size: 14,
    fields: {
      name: 2,
      tgid: 3,
      lockout: 4,
      priority: 5,
      alert: 6,
      alertLevel: 7,
      audio: 9,
      numberTag: 10,
      color: 11,
      pattern: 12,
      offset: 13,
      slot: 14,
    },
    read: {
      name: 1,
      tgid: 2,
      lockout: 3,
      priority: 4,
      alert: 5,
      alertLevel: 6,
      audio: 12,
      numberTag: 13,
      color: 14,
      pattern: 15,
      offset: 16,
      slot: 17,
    },
    next: 8,
    min: 17,
  },
  TFQ: {
    size: 9,
    fields: { frequency: 2, lockout: 4 },
    read: { frequency: 1, lockout: 3 },
    next: 5,
    min: 10,
  },
  TRN: {
    size: 26,
    fields: { idSearch: 2, idFormat: 22 },
    read: { idSearch: 1, idFormat: 25 },
    head: 21,
    min: 29,
  },
};

export function setCommand(cmd, index, values) {
  const spec = maps[cmd];
  // Firmware 1.11.11 can return CSY,0 on an empty scanner. Zero is a
  // valid allocated handle; only -1 denotes end-of-list/allocation failure.
  if (!spec || !Number.isInteger(index) || index < 0 || index > 100000)
    throw Error('Invalid memory handle');
  const fields = Array(spec.size + 1).fill('');
  fields[0] = cmd;
  fields[1] = String(index);
  for (const [key, value] of Object.entries(values)) {
    if (!spec.fields[key]) throw Error(`Unknown ${cmd} field ${key}`);
    const text = String(value);
    if (/[^\x20-\x7e]|,/.test(text)) throw Error('Invalid command characters');
    fields[spec.fields[key]] = text;
  }
  return fields.join(',');
}

export function parseResponse(command, line) {
  const expected = command.split(',')[0];
  if (typeof line !== 'string' || /[\r\n]/.test(line)) throw Error('Malformed scanner response');
  const r = line.split(',').map((x) => x.trim());
  if (['ERR', 'NG', 'FER', 'ORER'].includes(r[0]) || ['ERR', 'NG'].includes(r[1]))
    throw Error(`Scanner rejected ${expected}: ${line}`);
  if (r[0] !== expected) throw Error(`Expected ${expected}; received ${line}`);
  return r;
}

export function validatePlan(plan) {
  if (
    plan.format !== 'bcd325p2-local-plan-v1' ||
    plan.model !== 'BCD325P2' ||
    !/^[A-Z][A-Z0-9]{1,3}$/.test(plan.namespace)
  )
    throw Error('Wrong plan/model');
  const names = new Set(),
    keys = new Set();
  const checkName = (n) => {
    if (!/^[\x20-\x7e]{1,16}$/.test(n) || n.includes(',')) throw Error(`Invalid name: ${n}`);
  };
  let conventional = 0,
    talkgroups = 0,
    sites = 0,
    siteFrequencies = 0;
  const checkFreq = (f) => {
    if (
      !/^\d{8}$/.test(f) ||
      ![
        [250000, 5119999],
        [7580000, 8239999],
        [8490125, 8689999],
        [8940125, 9600000],
      ].some(([a, b]) => +f >= a && +f <= b)
    )
      throw Error('Invalid or unsupported frequency');
  };
  for (const s of plan.systems) {
    checkName(s.name);
    if (!s.name.startsWith(`${plan.namespace} `) || names.has(s.name))
      throw Error('Duplicate/unowned system name');
    names.add(s.name);
    if (!Number.isInteger(s.quickKey) || s.quickKey < 0 || s.quickKey > 99 || keys.has(s.quickKey))
      throw Error('Invalid/duplicate quick key');
    keys.add(s.quickKey);
    if (!['CNV', 'P25S'].includes(s.type) || !s.groups.length || s.groups.length > 20)
      throw Error('Invalid system');
    const groupNames = new Set();
    for (const g of s.groups) {
      checkName(g.name);
      if (groupNames.has(g.name)) throw Error('Duplicate group');
      groupNames.add(g.name);
      if (
        !Number.isInteger(g.quickKey) ||
        g.quickKey < 0 ||
        g.quickKey > 9 ||
        !g.channels.length ||
        g.channels.length > (s.type === 'CNV' ? 1000 : 500)
      )
        throw Error('Invalid group');
      const channelNames = new Set();
      for (const c of g.channels) {
        checkName(c.name);
        if (channelNames.has(c.name)) throw Error('Duplicate channel label');
        channelNames.add(c.name);
        if (s.type === 'CNV') {
          checkFreq(c.frequency);
          if (
            !['AM', 'FM', 'NFM', 'FMB'].includes(c.modulation) ||
            !['1', '2'].includes(c.audio) ||
            c.tone !== '0' ||
            c.nac !== 'SRCH'
          )
            throw Error('Invalid channel settings');
          conventional++;
        } else {
          if (!Number.isInteger(c.tgid) || c.tgid < 1 || c.tgid > 65535 || c.audio !== '2')
            throw Error('Invalid talkgroup');
          talkgroups++;
        }
      }
    }
    if (s.type === 'P25S') {
      if (!s.sites?.length) throw Error('Trunk system has no sites');
      for (const site of s.sites) {
        checkName(site.name);
        sites++;
        if (!site.frequencies.length) throw Error('Empty trunk site');
        for (const c of site.frequencies) {
          checkFreq(c.frequency);
          siteFrequencies++;
        }
      }
    }
  }
  const actual = { conventional, talkgroups, sites, siteFrequencies, systems: plan.systems.length };
  if (
    actual.systems > 500 ||
    actual.sites + plan.systems.filter((s) => s.type === 'CNV').length > 1000 ||
    conventional + talkgroups + siteFrequencies > 25000
  )
    throw Error('Plan exceeds scanner capacity');
  for (const [key, value] of Object.entries(actual))
    if (plan.counts[key] !== value) throw Error(`Plan count mismatch: ${key}`);
  return actual;
}

export function quickPosition(key) {
  return [Math.floor(key / 10), ((key % 10) + 9) % 10];
}
export function quickPages(r) {
  if (r.length !== 11 || r[0] !== 'QSL' || !r.slice(1).every((s) => /^[012]{10}$/.test(s)))
    throw Error('Invalid quick-key state');
  return r.slice(1).map((s) => s.split(''));
}
export function chooseKeys(plan, qsl) {
  const pages = quickPages(qsl),
    result = {},
    used = new Set();
  const free = (key) => {
    const [p, i] = quickPosition(key);
    return pages[p][i] === '0' && !used.has(key);
  };
  // Reserve every available preferred key before allocating alternatives.
  for (const s of plan.systems)
    if (free(s.quickKey)) {
      result[s.name] = s.quickKey;
      used.add(s.quickKey);
    }
  for (const s of plan.systems)
    if (result[s.name] === undefined) {
      const key = [...Array(90)]
        .map((_, i) => i + 10)
        .concat([...Array(10)].map((_, i) => i))
        .find(free);
      if (key === undefined)
        throw Error('Not enough unused system quick keys; existing keys are preserved');
      result[s.name] = key;
      used.add(key);
    }
  return result;
}

export class Programmer {
  constructor(transport, { save, log = () => {} }) {
    this.transport = transport;
    this.save = save;
    this.log = log;
    this.transcript = [];
    this.cancelled = false;
    this.writing = false;
  }
  async ask(command, { ignoreCancel = false } = {}) {
    if (this.cancelled && !ignoreCancel) throw Error('Stopped by user');
    // No erase/reset/delete commands are implemented or accepted by this programmer.
    if (/^(CLR|DSY|DGR|DCH|POF)(,|$)/.test(command)) throw Error('Destructive command blocked');
    const event = { at: new Date().toISOString(), command };
    this.transcript.push(event);
    try {
      event.response = await this.transport.exchange(command);
      return parseResponse(command, event.response);
    } catch (e) {
      event.error = e.message;
      throw e;
    }
  }
  async ok(command, options) {
    const r = await this.ask(command, options);
    if (r.length !== 2 || r[1] !== 'OK') throw Error(`No acknowledgement: ${r.join(',')}`);
  }
  async identify() {
    const r = await this.ask('MDL');
    if (r.length !== 2 || r[1] !== 'BCD325P2')
      throw Error(`This setup requires a BCD325P2; received ${r.join(',')}`);
    this.identity = { model: r[1], firmware: (await this.ask('VER')).slice(1).join(',') };
    return this.identity;
  }
  async mode(fn) {
    await this.identify();
    let entered = false,
      primaryError;
    try {
      await this.ok('PRG');
      entered = true;
      return await fn();
    } catch (e) {
      primaryError = e;
      throw e;
    } finally {
      if (entered) {
        try {
          await this.ok('EPG', { ignoreCancel: true });
        } catch (e) {
          this.log(
            'Could not confirm exit from Remote Mode. Power the scanner off/on before reconnecting.',
          );
          if (!primaryError) throw e;
        }
      }
    }
  }
  async read(cmd, index) {
    const r = await this.ask(`${cmd},${index}`);
    if (r.length < maps[cmd].min + 1) throw Error(`Incomplete ${cmd} response at memory ${index}`);
    return r;
  }
  index(value, allowEnd = true) {
    if (allowEnd && value === '-1') return -1;
    if (!/^\d+$/.test(String(value)) || +value < 0 || +value > 100000)
      throw Error(`Invalid scanner memory index ${value}`);
    return +value;
  }
  async chain(head, cmd, limit) {
    let index = this.index(head);
    const out = [],
      visited = new Set();
    while (index !== -1) {
      if (visited.has(index) || out.length >= limit)
        throw Error(`Invalid/cyclic ${cmd} memory chain`);
      visited.add(index);
      const r = await this.read(cmd, index);
      out.push({ index, raw: r });
      index = this.index(r[maps[cmd].next]);
    }
    return out;
  }
  async snapshot() {
    this.log('Reading existing systems and channels…');
    const result = {
      format: 'bcd325p2-channel-snapshot-v1',
      at: new Date().toISOString(),
      identity: this.identity,
      scope:
        'Channel/system memory and selected global settings. Raw diagnostic backup; not a one-click restoration file.',
      globals: {},
      systems: [],
    };
    for (const c of ['MEM', 'RMB', 'QSL', 'WXS', 'PRI', 'SCN'])
      result.globals[c] = await this.ask(c);
    quickPages(result.globals.QSL);
    for (let i = 1; i <= 5; i++) result.globals[`SGP,${i}`] = await this.ask(`SGP,${i}`);
    const head = await this.ask('SIH');
    result.systems = await this.chain(head[1], 'SIN', 500);
    for (const system of result.systems) {
      const type = system.raw[1];
      system.name = system.raw[2];
      if (system.raw[27] !== '0')
        throw Error(
          `Protected system or unreadable protection state: ${system.name}; no upload performed`,
        );
      system.groupKeys = await this.ask(`QGL,${system.index}`);
      if (type === 'CNV') {
        system.groups = await this.chain(system.raw[14], 'GIN', 20);
        for (const g of system.groups) g.channels = await this.chain(g.raw[8], 'CIN', 25000);
      } else {
        if (!['P25S', 'P25F', 'MOT', 'EDC', 'EDS', 'LTR', 'TRBO', 'DMR'].includes(type))
          throw Error(`Cannot back up system type ${type}; no upload performed`);
        system.trunk = await this.read('TRN', system.index);
        system.sites = await this.chain(system.raw[14], 'SIF', 256);
        for (const site of system.sites) {
          site.frequencies = await this.chain(site.raw[14], 'TFQ', 1000);
          if (['P25S', 'P25F'].includes(type)) site.bandPlan = await this.ask(`ABP,${site.index}`);
          if (type === 'MOT') site.bandPlan = await this.ask(`MCP,${site.index}`);
        }
        system.groups = await this.chain(system.trunk[21], 'GIN', 20);
        for (const g of system.groups) g.channels = await this.chain(g.raw[8], 'TIN', 25000);
        system.lockedTalkgroups = [];
        for (let n = 0; n < 25001; n++) {
          const r = await this.ask(`GLI,${system.index}`);
          if (r[1] === '-1') break;
          if (n === 25000) throw Error('Invalid talkgroup lockout list');
          system.lockedTalkgroups.push(r);
        }
      }
    }
    const count = result.globals.MEM[2];
    if (!/^\d+$/.test(count) || +count !== result.systems.length)
      throw Error('System count does not match snapshot');
    return result;
  }
  async backup() {
    return this.mode(async () => {
      const snapshot = await this.snapshot();
      const saved = await this.save('backup', snapshot);
      return { snapshot, saved };
    });
  }
  async setChecked(cmd, index, values) {
    await this.ok(setCommand(cmd, index, values));
    const raw = await this.read(cmd, index);
    this.compare(cmd, raw, values, index);
    return raw;
  }
  compare(cmd, raw, values, index) {
    for (const [key, value] of Object.entries(values)) {
      const actual = raw[maps[cmd].read[key]],
        expected = String(value);
      if (
        actual !== expected &&
        !(['frequency', 'tgid'].includes(key) && /^\d+$/.test(actual) && +actual === +expected)
      )
        throw Error(
          `Readback mismatch: ${cmd} ${index} ${key}; expected ${expected}, got ${actual}`,
        );
    }
  }
  async allocate(command) {
    const r = await this.ask(command);
    if (r.length !== 2) throw Error('Invalid allocation response');
    return this.index(r[1], false);
  }
  channelValues(c, type) {
    if (type === 'CNV')
      return {
        name: c.name,
        frequency: c.frequency,
        modulation: c.modulation,
        lockout: '0',
        priority: '0',
        attenuator: '0',
        alert: '0',
        audio: c.audio,
        // Digital-only CIN replies reserve the analog tone and tone-lock fields.
        ...(c.audio === '2' ? { nac: c.nac } : { tone: c.tone, toneLock: '0' }),
        offset: '0',
      };
    // P25 Standard is intrinsically digital. The owner's manual restricts
    // selectable audio type to conventional and Motorola systems.
    return { name: c.name, tgid: c.tgid, lockout: '0', priority: '0', alert: '0', offset: '0' };
  }
  resumableSystems(plan, snapshot) {
    const ticket = plan.resume,
      result = new Map();
    if (!ticket) return result;
    if (
      ticket.planId !== plan.id ||
      ticket.model !== snapshot.identity.model ||
      ticket.firmware !== snapshot.identity.firmware ||
      !Array.isArray(ticket.systems) ||
      !ticket.systems.length
    )
      throw Error('Partial-upload record does not match this scanner and plan');
    for (const owned of ticket.systems) {
      const expected = plan.systems.find((s) => s.name === owned.name);
      const actual = snapshot.systems.find((s) => s.index === owned.index);
      if (
        !expected ||
        !actual ||
        actual.name !== expected.name ||
        actual.raw[1] !== expected.type ||
        result.has(expected.name) ||
        !Number.isInteger(owned.quickKey) ||
        owned.quickKey < 0 ||
        owned.quickKey > 99
      )
        throw Error(
          'A previously uploaded system changed; no systems were changed by this attempt',
        );
      if (expected.type === 'CNV' && actual.raw[3] !== String(owned.quickKey))
        throw Error('Previously uploaded quick key changed; save a fresh backup for review');
      // Only an exact prefix of the planned groups/channels/sites can be resumed.
      // Readback identities and critical receive settings must already agree.
      if (
        actual.groups.length > expected.groups.length ||
        (actual.sites?.length || 0) > (expected.sites?.length || 0)
      )
        throw Error('Unexpected extra groups or sites in partial upload');
      for (const [i, g] of actual.groups.entries()) {
        const eg = expected.groups[i];
        this.compare('GIN', g.raw, { name: eg.name, quickKey: eg.quickKey }, g.index);
        if (g.channels.length > eg.channels.length)
          throw Error('Unexpected extra channels in partial upload');
        for (const [j, c] of g.channels.entries())
          this.compare(
            expected.type === 'CNV' ? 'CIN' : 'TIN',
            c.raw,
            this.channelValues(eg.channels[j], expected.type),
            c.index,
          );
      }
      for (const [i, site] of (actual.sites || []).entries()) {
        const es = expected.sites[i];
        this.compare('SIF', site.raw, { name: es.name, quickKey: owned.quickKey }, site.index);
        if (site.frequencies.length > es.frequencies.length)
          throw Error('Unexpected extra site frequencies in partial upload');
        for (const [j, f] of site.frequencies.entries())
          this.compare('TFQ', f.raw, { frequency: es.frequencies[j].frequency }, f.index);
      }
      result.set(expected.name, { snapshot: actual, quickKey: owned.quickKey });
    }
    return result;
  }
  async install(plan, enabledNames = plan.systems.filter((s) => s.enabled).map((s) => s.name)) {
    validatePlan(plan);
    if (plan.example)
      throw Error(
        'Example plans are for preview. Adapt the plan to your area and remove the example flag before programming.',
      );
    const selected = new Set(enabledNames);
    if (!selected.size || [...selected].some((n) => !plan.systems.some((s) => s.name === n)))
      throw Error('Select at least one system to listen to');
    this.cancelled = false;
    this.transcript = [];
    const receipt = {
      format: 'bcd325p2-upload-receipt-v1',
      planId: plan.id,
      started: new Date().toISOString(),
      status: 'preparing',
      systems: [],
      enabledNames: [...selected],
    };
    this.receipt = receipt;
    let before, resumed;
    try {
      await this.mode(async () => {
        before = await this.snapshot();
        receipt.identity = this.identity;
        receipt.backup = await this.save('backup', before); // Must finish durable write before CSY.
        resumed = this.resumableSystems(plan, before);
        const matches = before.systems.filter((s) => plan.systems.some((p) => p.name === s.name));
        if (matches.some((s) => !resumed.has(s.name)))
          throw Error(
            'Matching system names already exist without a matching recovery receipt. Use Verify installed plan or choose a different plan namespace; no duplicates were added.',
          );
        if (resumed.size) {
          receipt.resume = plan.resume;
          this.log(
            `Resuming ${resumed.size} recorded system(s); verified existing channels will be reused.`,
          );
        }
        const mem = before.globals.MEM;
        // MEM's site total also includes one internal site for each CNV system,
        // confirmed by the real 1.11.11 empty-system snapshot (MEM,0,1,1,0,0).
        const remaining = plan.systems.filter((s) => !resumed.has(s.name));
        const newSites = plan.systems.reduce((n, s) => {
          const previous = resumed.get(s.name)?.snapshot;
          return (
            n +
            (s.type === 'CNV'
              ? previous
                ? 0
                : 1
              : s.sites.length - (previous?.sites?.length || 0))
          );
        }, 0);
        if (
          +mem[2] + remaining.length > 500 ||
          +mem[3] + newSites > 1000 ||
          +mem[4] +
            plan.counts.conventional +
            plan.counts.talkgroups +
            plan.counts.siteFrequencies -
            [...resumed.values()].reduce(
              (n, { snapshot: s }) =>
                n +
                s.groups.reduce((n, g) => n + g.channels.length, 0) +
                (s.sites || []).reduce((n, x) => n + x.frequencies.length, 0),
              0,
            ) >
            25000
        )
          throw Error('Insufficient scanner memory capacity');
        receipt.quickKeys = chooseKeys(plan, before.globals.QSL);
        for (const [name, owned] of resumed) receipt.quickKeys[name] = owned.quickKey;
        if (new Set(Object.values(receipt.quickKeys)).size !== plan.systems.length)
          throw Error('Resume quick-key conflict');
        receipt.status = 'writing';
        await this.save('receipt', receipt);
        this.writing = true;
        for (const system of plan.systems) {
          this.log(`Programming ${system.name}…`);
          receipt.pendingSystem = system.name;
          await this.save('receipt', receipt);
          const previous = resumed.get(system.name)?.snapshot;
          const index = previous ? previous.index : await this.allocate(`CSY,${system.type},0`);
          const created = {
            name: system.name,
            type: system.type,
            index,
            quickKey: receipt.quickKeys[system.name],
            sites: [],
          };
          receipt.systems.push(created);
          await this.save('receipt', receipt);
          // Keep additions locked until every channel has passed verification.
          const sysValues = { name: system.name, delay: '2' };
          if (system.type === 'CNV')
            Object.assign(sysValues, {
              quickKey: receipt.quickKeys[system.name],
              hold: '0',
              lockout: '1',
            });
          await this.setChecked('SIN', index, sysValues);
          if (system.type === 'P25S') {
            await this.setChecked('TRN', index, { idSearch: '0', idFormat: '0' });
            for (const [siteOffset, site] of system.sites.entries()) {
              const priorSite = previous?.sites[siteOffset];
              const si = priorSite ? priorSite.index : await this.allocate(`AST,${index},`);
              created.sites.push({ name: site.name, index: si });
              // Real P25S SIF readback reserves modulation/control-only fields;
              // those settings apply to other trunk types, not this P25 system.
              await this.setChecked('SIF', si, {
                name: site.name,
                quickKey: receipt.quickKeys[system.name],
                hold: '0',
                lockout: '1',
                attenuator: '0',
                gps: '0',
              });
              for (const [frequencyOffset, f] of site.frequencies.entries()) {
                const fi =
                  priorSite?.frequencies[frequencyOffset]?.index ??
                  (await this.allocate(`ACC,${si}`));
                await this.setChecked('TFQ', fi, { frequency: f.frequency, lockout: '0' });
              }
            }
          }
          const groupKeys = Array(10).fill('0');
          for (const [groupOffset, group] of system.groups.entries()) {
            const priorGroup = previous?.groups[groupOffset];
            const gi = priorGroup
              ? priorGroup.index
              : await this.allocate(`${system.type === 'CNV' ? 'AGC' : 'AGT'},${index}`);
            await this.setChecked('GIN', gi, {
              name: group.name,
              quickKey: group.quickKey,
              lockout: '0',
              gps: '0',
            });
            groupKeys[(group.quickKey + 9) % 10] = '1';
            for (const [channelOffset, channel] of group.channels.entries()) {
              const ci =
                priorGroup?.channels[channelOffset]?.index ??
                (await this.allocate(`${system.type === 'CNV' ? 'ACC' : 'ACT'},${gi}`));
              await this.setChecked(
                system.type === 'CNV' ? 'CIN' : 'TIN',
                ci,
                this.channelValues(channel, system.type),
              );
            }
          }
          await this.ok(`QGL,${index},${groupKeys.join('')}`);
          const actual = await this.ask(`QGL,${index}`);
          if (actual[1] !== groupKeys.join('')) throw Error('Group quick-key readback mismatch');
          receipt.pendingSystem = null;
          await this.save('receipt', receipt);
        }
      });
      // Firmware 1.11.11 acknowledged QSL but dropped keys for systems/sites
      // first populated in that programming session. Finish the memory pass
      // with EPG, then use a fresh PRG session for quick-key finalization.
      receipt.status = 'finalizing';
      await this.save('receipt', receipt);
      this.log('Channel records saved. Starting a fresh session to apply listening quick keys…');
      await this.mode(async () => {
        const qsl = quickPages(await this.ask('QSL'));
        // Restore the exact pre-upload state for all keys except our newly allocated ones.
        const original = quickPages(before.globals.QSL);
        for (let p = 0; p < 10; p++)
          for (let i = 0; i < 10; i++) if (original[p][i] !== '0') qsl[p][i] = original[p][i];
        for (const s of plan.systems) {
          const [p, i] = quickPosition(receipt.quickKeys[s.name]);
          qsl[p][i] = selected.has(s.name) ? '1' : '2';
        }
        const command = 'QSL,' + qsl.map((p) => p.join('')).join(',');
        await this.ok(command);
        const actual = (await this.ask('QSL')).join(',');
        if (actual !== command)
          throw Error(`System quick-key readback mismatch; expected ${command}, got ${actual}`);
        for (const sys of receipt.systems) {
          if (sys.type === 'CNV') await this.setChecked('SIN', sys.index, { lockout: '0' });
          else
            for (const site of sys.sites)
              await this.setChecked('SIF', site.index, { lockout: '0' });
        }
      });
      // Confirm persisted memory after finalization has also exited Remote Mode.
      this.log('Checking saved channels and listening keys in a fresh readback session…');
      await this.mode(async () => {
        const after = await this.snapshot();
        const actualKeys = this.verifySnapshot(plan, after);
        this.verifyQuickKeys(after.globals.QSL, receipt.quickKeys, selected, before.globals.QSL);
        for (const s of plan.systems)
          if (actualKeys[s.name] !== receipt.quickKeys[s.name])
            throw Error(`Saved quick-key assignment changed: ${s.name}`);
        // Compare pre-existing content; linked-list pointers can legitimately change on append.
        const managed = new Set([...resumed.values()].map((x) => x.snapshot.index));
        this.checkPreserved(
          { ...before, systems: before.systems.filter((s) => !managed.has(s.index)) },
          after,
        );
        receipt.afterSnapshot = await this.save('backup', after);
        receipt.status = 'verified';
      });
      receipt.status = 'complete';
      this.log('Upload and readback verified. Press Scan/Srch on the scanner to start listening.');
    } catch (e) {
      receipt.status = 'incomplete';
      receipt.error = e.message;
      this.log(`Stopped: ${e.message}`);
      throw e;
    } finally {
      this.writing = false;
      receipt.finished = new Date().toISOString();
      receipt.transcript = this.transcript;
      try {
        receipt.saved = await this.save('receipt', receipt);
      } catch (e) {
        this.log(
          'Receipt could not be saved to disk. Use Download session log before closing this page.',
        );
      }
    }
    return receipt;
  }
  verifyQuickKeys(actual, keys, selected, previous) {
    const pages = quickPages(actual),
      original = quickPages(previous),
      managed = new Set(Object.values(keys));
    for (const [name, key] of Object.entries(keys)) {
      const [p, i] = quickPosition(key),
        expected = selected.has(name) ? '1' : '2';
      if (pages[p][i] !== expected)
        throw Error(
          `Saved listening state mismatch: ${name} (key ${key}); expected ${expected}, got ${pages[p][i]}`,
        );
    }
    for (let key = 0; key < 100; key++) {
      const [p, i] = quickPosition(key);
      if (!managed.has(key) && original[p][i] !== pages[p][i])
        throw Error(`Existing quick-key state changed: ${key}`);
    }
  }
  verifySnapshot(plan, snapshot) {
    const keys = {};
    for (const expected of plan.systems) {
      const matches = snapshot.systems.filter((s) => s.name === expected.name);
      if (matches.length !== 1)
        throw Error(`Expected one ${expected.name}; found ${matches.length}`);
      const s = matches[0];
      this.compare(
        'SIN',
        s.raw,
        {
          type: expected.type,
          name: expected.name,
          delay: '2',
          ...(expected.type === 'CNV' ? { lockout: '0', hold: '0' } : {}),
        },
        s.index,
      );
      if (s.groups.length !== expected.groups.length)
        throw Error(`Group count mismatch in ${expected.name}`);
      if (expected.type === 'P25S') {
        this.compare('TRN', s.trunk, { idSearch: '0', idFormat: '0' }, s.index);
        if (s.sites.length !== expected.sites.length) throw Error('Site count mismatch');
        for (const es of expected.sites) {
          const sites = s.sites.filter((x) => x.raw[2] === es.name);
          if (sites.length !== 1 || sites[0].frequencies.length !== es.frequencies.length)
            throw Error(`Missing site/frequencies ${es.name}`);
          const site = sites[0];
          if (!/^\d{1,2}$/.test(site.raw[3])) throw Error('Missing site quick-key assignment');
          if (keys[expected.name] !== undefined && keys[expected.name] !== Number(site.raw[3]))
            throw Error('Trunk site quick keys do not match');
          keys[expected.name] = Number(site.raw[3]);
          this.compare(
            'SIF',
            site.raw,
            { name: es.name, hold: '0', lockout: '0', attenuator: '0', gps: '0' },
            site.index,
          );
          es.frequencies.forEach((f, i) =>
            this.compare(
              'TFQ',
              site.frequencies[i].raw,
              { frequency: f.frequency, lockout: '0' },
              site.frequencies[i].index,
            ),
          );
        }
      } else {
        if (!/^\d{1,2}$/.test(s.raw[3])) throw Error('Missing system quick-key assignment');
        keys[expected.name] = Number(s.raw[3]);
      }
      if (
        !Number.isInteger(keys[expected.name]) ||
        keys[expected.name] < 0 ||
        keys[expected.name] > 99
      )
        throw Error('Missing system quick-key assignment');
      const expectedGroupKeys = Array(10).fill('0');
      for (const g of expected.groups) expectedGroupKeys[(g.quickKey + 9) % 10] = '1';
      if (s.groupKeys?.[0] !== 'QGL' || s.groupKeys[1] !== expectedGroupKeys.join(''))
        throw Error(`Group listening keys differ: ${expected.name}`);
      for (const eg of expected.groups) {
        const groups = s.groups.filter((g) => g.raw[2] === eg.name);
        if (groups.length !== 1 || groups[0].channels.length !== eg.channels.length)
          throw Error(`Missing group/channels ${eg.name}`);
        const g = groups[0];
        this.compare(
          'GIN',
          g.raw,
          { name: eg.name, quickKey: eg.quickKey, lockout: '0', gps: '0' },
          g.index,
        );
        eg.channels.forEach((c, i) =>
          this.compare(
            expected.type === 'CNV' ? 'CIN' : 'TIN',
            g.channels[i].raw,
            this.channelValues(c, expected.type),
            g.channels[i].index,
          ),
        );
      }
    }
    return keys;
  }
  checkPreserved(before, after) {
    const normalize = (sys) => {
      const copy = structuredClone(sys);
      // System forward/reverse pointers and sequence number are structural metadata.
      for (const i of [12, 13, 16]) copy.raw[i] = '';
      return JSON.stringify(copy);
    };
    for (const previous of before.systems) {
      const current = after.systems.find((s) => s.index === previous.index);
      if (!current || normalize(previous) !== normalize(current))
        throw Error(`Existing system changed unexpectedly: ${previous.name}`);
    }
    for (const [cmd, value] of Object.entries(before.globals)) {
      if (['MEM', 'RMB', 'QSL'].includes(cmd)) continue;
      if (JSON.stringify(value) !== JSON.stringify(after.globals[cmd]))
        throw Error(`Existing setting changed unexpectedly: ${cmd}`);
    }
  }
  async verify(plan) {
    validatePlan(plan);
    return this.mode(async () => {
      const snapshot = await this.snapshot();
      const keys = this.verifySnapshot(plan, snapshot);
      const pages = quickPages(snapshot.globals.QSL);
      for (const [name, key] of Object.entries(keys)) {
        const [p, i] = quickPosition(key);
        if (pages[p][i] === '0') throw Error(`Missing listening key for ${name}`);
      }
      const enabledNames = Object.entries(keys)
        .filter(([, key]) => {
          const [p, i] = quickPosition(key);
          return pages[p][i] === '1';
        })
        .map(([name]) => name);
      const saved = await this.save('verification', {
        at: new Date().toISOString(),
        planId: plan.id,
        status: 'verified',
        quickKeys: keys,
        snapshot,
      });
      return { keys, saved, enabledNames };
    });
  }
}

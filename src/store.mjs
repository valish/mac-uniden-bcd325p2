import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { compilePlan } from './plan.mjs';
const MAX = 32 * 1024 * 1024;
export async function readJSON(file) {
  const stat = await fs.stat(file);
  if (stat.size > MAX) throw Error('JSON file exceeds 32 MB');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
  }
  async init() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(this.directory)).isSymbolicLink())
      throw Error('Data directory must not be a symlink');
    return this;
  }
  filename(name) {
    if (!/^(plan|backup|receipt|verification|diagnostic)-[a-zA-Z0-9-]+\.json$/.test(name))
      throw Error('Invalid record filename');
    return path.join(this.directory, name);
  }
  async save(kind, data) {
    if (!['plan', 'backup', 'receipt', 'verification', 'diagnostic'].includes(kind))
      throw Error('Unknown record type');
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw Error('Record must be an object');
    await this.init();
    const encoded = JSON.stringify(data, null, 2) + '\n';
    if (Buffer.byteLength(encoded) > MAX) throw Error('Record exceeds 32 MB');
    const name = `${kind}-${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomBytes(6).toString('hex')}.json`;
    const destination = this.filename(name),
      temp = destination + '.pending';
    let handle;
    try {
      handle = await fs.open(temp, 'wx', 0o600);
      await handle.writeFile(encoded, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temp, destination);
      const directory = await fs.open(this.directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      if ((await fs.readFile(destination, 'utf8')) !== encoded)
        throw Error('Record readback failed');
    } finally {
      await handle?.close();
      await fs.rm(temp, { force: true });
    }
    return { file: name, path: destination, bytes: Buffer.byteLength(encoded) };
  }
  async read(name) {
    const file = this.filename(name);
    if ((await fs.lstat(file)).isSymbolicLink()) throw Error('Record must not be a symlink');
    return readJSON(file);
  }
  async files(kind) {
    await this.init();
    const names = (await fs.readdir(this.directory)).filter(
      (n) =>
        /^(plan|backup|receipt|verification|diagnostic)-[a-zA-Z0-9-]+\.json$/.test(n) &&
        (!kind || n.startsWith(kind + '-')),
    );
    const records = await Promise.all(
      names.map(async (name) => {
        const stat = await fs.lstat(this.filename(name), { bigint: true });
        return { name, time: stat.mtimeNs };
      }),
    );
    // Random filename suffixes cannot order receipts saved in the same millisecond.
    return records
      .sort((a, b) => (a.time === b.time ? b.name.localeCompare(a.name) : a.time > b.time ? -1 : 1))
      .map((r) => r.name);
  }
  async stage(input) {
    const { plan, warnings } = await compilePlan(input);
    const record = await this.save('plan', {
      input,
      compiled: plan,
      warnings,
      stagedAt: new Date().toISOString(),
    });
    return { ...record, planId: plan.id, counts: plan.counts, warnings };
  }
  async plans() {
    const result = [];
    for (const name of (await this.files('plan')).slice(0, 100)) {
      try {
        const d = await this.read(name);
        result.push({
          file: name,
          id: d.compiled.id,
          title: d.compiled.title,
          areas: d.input.areas,
          counts: d.compiled.counts,
          example: d.compiled.example,
          stagedAt: d.stagedAt,
        });
      } catch {}
    }
    return result;
  }
  async recovery(planId) {
    if (!/^[0-9a-f]{24}$/.test(planId)) throw Error('Invalid plan ID');
    for (const name of await this.files('receipt')) {
      const r = await this.read(name);
      if (r.planId !== planId || !r.systems?.length || !r.identity) continue;
      if (r.status === 'complete') return null;
      const systems = new Map((r.resume?.systems || []).map((s) => [s.name, s]));
      for (const s of r.systems) systems.set(s.name, s);
      return {
        planId,
        model: r.identity.model,
        firmware: r.identity.firmware,
        systems: [...systems.values()],
        sourceReceipt: name,
      };
    }
    return null;
  }
  async history() {
    const files = (await this.files()).filter((name) =>
      /^(receipt|verification|backup)-/.test(name),
    );
    const out = [];
    for (const file of files.slice(0, 50)) {
      try {
        const r = await this.read(file);
        if (file.startsWith('receipt-') && !['complete', 'incomplete'].includes(r.status)) continue;
        out.push({
          file,
          kind: file.split('-')[0],
          status: r.status || 'saved',
          at: r.finished || r.at,
          planId: r.planId,
          systems: r.systems?.length ?? r.snapshot?.systems?.length,
          error: r.error,
          quickKeys: r.quickKeys,
          enabledNames: r.enabledNames,
        });
      } catch {}
    }
    return out;
  }
}

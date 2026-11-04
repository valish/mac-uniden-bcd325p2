import assert from 'node:assert/strict';
import { quickPosition } from '../src/protocol.mjs';

// Independent fixed-position wire emulator; no protocol field maps imported.
export class Radio {
  constructor() {
    this.model = 'BCD325P2';
    this.firmware = 'Version 1.11.11';
    this.program = false;
    this.nodes = new Map();
    this.systems = [];
    this.next = 41;
    this.commands = [];
    this.pages = Array(10).fill('0000000000');
  }
  make(kind, parent = null) {
    const id = this.next;
    this.next += 7;
    const n = { id, kind, parent, children: [], groups: [], sites: [], r: [] };
    this.nodes.set(id, n);
    return n;
  }
  link(list, node, nextSlot, prevSlot) {
    if (list.length) {
      const last = this.nodes.get(list.at(-1));
      last.r[nextSlot] = String(node.id);
      node.r[prevSlot] = String(last.id);
    } else node.r[prevSlot] = '-1';
    node.r[nextSlot] = '-1';
    list.push(node.id);
  }
  assign(key) {
    if (key === '.' || key === '') return;
    const [p, i] = quickPosition(+key),
      a = this.pages[p].split('');
    if (a[i] === '0') a[i] = '1';
    this.pages[p] = a.join('');
  }
  async exchange(command) {
    this.commands.push(command);
    if (this.fail?.(command)) return 'ERR';
    const a = command.split(','),
      c = a[0],
      id = +a[1],
      n = this.nodes.get(id);
    if (c === 'MDL') return `MDL,${this.model}`;
    if (c === 'VER') return `VER,${this.firmware}`;
    if (c === 'PRG') {
      this.program = true;
      this.quickKeysAtEntry = [...this.pages];
      return 'PRG,OK';
    }
    if (c === 'EPG') {
      this.program = false;
      return 'EPG,OK';
    }
    assert.ok(this.program, 'Memory command outside program mode');
    if (c === 'MEM')
      return `MEM,2,${this.systems.length},${[...this.nodes.values()].filter((n) => n.kind === 'SIF' || (n.kind === 'SIN' && n.r[1] === 'CNV')).length},${[...this.nodes.values()].filter((n) => ['CIN', 'TIN', 'TFQ'].includes(n.kind)).length},0`;
    if (c === 'RMB') return 'RMB,40000';
    if (c === 'SIH') return 'SIH,' + (this.systems[0] ?? -1);
    if (c === 'QSL') {
      if (a.length > 1) {
        // Model the observed late-created-key failure: setter readback retained
        // exactly the keys present at PRG entry, while getter saw newer keys.
        this.pages = a
          .slice(1)
          .map((page, p) =>
            [...page].map((v, i) => (this.quickKeysAtEntry[p][i] === '0' ? '0' : v)).join(''),
          );
        return 'QSL,OK';
      }
      return 'QSL,' + this.pages.join(',');
    }
    if (c === 'QGL') {
      if (a.length > 2) {
        n.groupKeys = a[2];
        return 'QGL,OK';
      }
      return `QGL,${n.groupKeys || '0000000000'}`;
    }
    if (c === 'WXS') return 'WXS,2,0,0,,0,';
    if (c === 'PRI') return 'PRI,0,2,100';
    if (c === 'SCN') return 'SCN,1,0,0';
    if (c === 'SGP')
      return 'SGP,SAME ' + id + ',000000,000000,000000,000000,000000,000000,000000,000000';
    if (c === 'GLI') return 'GLI,-1';
    if (c === 'ABP') return 'ABP,' + Array(32).fill('0').join(',');
    if (c === 'CSY') {
      const x = this.make('SIN');
      x.r = Array(29).fill('');
      x.r[0] = 'SIN';
      x.r[1] = a[1];
      x.r[2] = 'System';
      x.r[3] = a[1] === 'CNV' ? '.' : '';
      x.r[4] = a[1] === 'CNV' ? '0' : '';
      x.r[5] = a[1] === 'CNV' ? '0' : '';
      x.r[6] = '2';
      x.r[14] = '-1';
      x.r[15] = '-1';
      x.r[16] = String(this.systems.length + 1);
      x.r[27] = '0';
      this.link(this.systems, x, 13, 12);
      x.trunk = Array(30).fill('');
      x.trunk[0] = 'TRN';
      x.trunk[1] = '1';
      x.trunk[21] = '-1';
      x.trunk[22] = '-1';
      return `CSY,${x.id}`;
    }
    if (c === 'AGC' || c === 'AGT') {
      const x = this.make('GIN', id);
      x.r = Array(15).fill('');
      x.r[0] = 'GIN';
      x.r[1] = c === 'AGC' ? 'C' : 'T';
      x.r[2] = 'Group';
      x.r[3] = '.';
      x.r[4] = '0';
      x.r[7] = String(id);
      x.r[8] = '-1';
      x.r[9] = '-1';
      x.r[14] = '0';
      this.link(n.groups, x, 6, 5);
      if (c === 'AGC') {
        n.r[14] = String(n.groups[0]);
        n.r[15] = String(x.id);
      } else {
        n.trunk[21] = String(n.groups[0]);
        n.trunk[22] = String(x.id);
      }
      return `${c},${x.id}`;
    }
    if (c === 'AST') {
      const x = this.make('SIF', id);
      x.r = Array(27).fill('');
      x.r[0] = 'SIF';
      x.r[2] = 'Site';
      x.r[3] = '.';
      x.r[4] = '0';
      x.r[5] = '0';
      x.r[6] = 'AUTO';
      x.r[7] = '0';
      x.r[8] = '1';
      x.r[13] = String(id);
      x.r[14] = '-1';
      x.r[15] = '-1';
      x.r[21] = '0';
      this.link(n.sites, x, 12, 11);
      n.r[14] = String(n.sites[0]);
      n.r[15] = String(x.id);
      return `AST,${x.id}`;
    }
    if (c === 'ACC' || c === 'ACT') {
      const kind = c === 'ACT' ? 'TIN' : n.kind === 'SIF' ? 'TFQ' : 'CIN',
        x = this.make(kind, id);
      const size = { CIN: 22, TIN: 18, TFQ: 13 }[kind];
      x.r = Array(size).fill('');
      x.r[0] = kind;
      if (kind === 'CIN') {
        x.r[1] = 'Channel';
        x.r[2] = '00000000';
        x.r[3] = 'AUTO';
        x.r[4] = '0';
        x.r[16] = '0';
        this.link(n.children, x, 12, 11);
        x.r[13] = String(n.parent);
        x.r[14] = String(id);
      }
      if (kind === 'TIN') {
        x.r[1] = 'TGID';
        x.r[2] = '0';
        this.link(n.children, x, 8, 7);
        x.r[9] = String(n.parent);
        x.r[10] = String(id);
      }
      if (kind === 'TFQ') {
        x.r[1] = '00000000';
        this.link(n.children, x, 5, 4);
        x.r[6] = String(n.parent);
        x.r[7] = String(id);
      }
      if (n.kind === 'SIF') {
        n.r[14] = String(n.children[0]);
        n.r[15] = String(x.id);
      } else {
        n.r[8] = String(n.children[0]);
        n.r[9] = String(x.id);
      }
      return `${c},${x.id}`;
    }
    if (['SIN', 'GIN', 'SIF', 'CIN', 'TIN', 'TFQ', 'TRN'].includes(c)) {
      assert.ok(n, `Unknown handle ${id}`);
      const r = c === 'TRN' ? n.trunk : n.r;
      if (a.length === 2) {
        let out = r.join(',');
        if (this.corrupt) out = this.corrupt(command, out);
        return out;
      }
      const positions = {
        SIN: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 },
        SIF: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 15: 21 },
        GIN: { 2: 2, 3: 3, 4: 4, 8: 14 },
        CIN: {
          2: 1,
          3: 2,
          4: 3,
          5: 4,
          6: 5,
          7: 6,
          8: 7,
          9: 8,
          10: 9,
          11: 10,
          13: 16,
          14: 17,
          15: 18,
          16: 19,
          17: 20,
          18: 21,
        },
        TIN: { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 9: 12, 10: 13, 11: 14, 12: 15, 13: 16, 14: 17 },
        TFQ: { 2: 1, 4: 3 },
        TRN: { 2: 1, 22: 25 },
      }[c];
      for (let i = 2; i < a.length; i++)
        if (a[i] !== '') {
          assert.ok(i in positions, `Unsupported setter field ${c} ${i}`);
          if (c === 'SIN' && r[1] !== 'CNV' && [3, 4, 5].includes(i)) continue;
          r[positions[i]] = a[i];
        }
      // Observed 1.11.11 behavior: digital-only channels reserve analog tone fields.
      if (c === 'CIN' && r[16] === '2') {
        r[4] = '';
        r[5] = '';
      }
      // Observed SIF,166 on the real P25 Standard site. Audio type is also
      // inapplicable to P25 Standard talkgroups (owner manual p.45).
      if (c === 'SIF' && this.nodes.get(n.parent).r[1] === 'P25S') {
        r[6] = '';
        r[8] = '';
      }
      if (c === 'TIN' && this.nodes.get(this.nodes.get(n.parent).parent).r[1] === 'P25S')
        r[12] = '';
      if ((c === 'SIN' && r[1] === 'CNV') || c === 'SIF') this.assign(r[3]);
      return `${c},OK`;
    }
    throw Error(`Unexpected command ${command}`);
  }
}

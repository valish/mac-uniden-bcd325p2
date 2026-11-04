// RFC 4180-style CSV; quoted commas, CRLF and embedded newlines are supported.
export function parseCSV(text) {
  if (typeof text !== 'string' || text.length > 4 * 1024 * 1024)
    throw Error('CSV must be text under 4 MB');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    afterQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else cell += c;
      continue;
    }
    if (afterQuote && ![',', '\r', '\n'].includes(c))
      throw Error('Unexpected characters after closing CSV quote');
    if (c === '"') {
      if (cell) throw Error('Quote inside an unquoted CSV field');
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
      afterQuote = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
      afterQuote = false;
    } else cell += c;
  }
  if (quoted) throw Error('Unterminated quoted CSV field');
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) throw Error('CSV is empty');
  const headers = rows.shift().map((x) => x.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw Error('CSV contains duplicate headers');
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw Error(`CSV row ${i + 2} has ${r.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}
export function importCSV(
  text,
  { title = 'Imported conventional channels', namespace = 'MU', areas = [] } = {},
) {
  const rows = parseCSV(text),
    systems = [],
    sources = [],
    sourceMap = new Map();
  const allowed = new Set([
    'system',
    'group',
    'name',
    'frequency_mhz',
    'mode',
    'quick_key',
    'group_key',
    'enabled',
    'source_url',
    'source_title',
    'checked',
  ]);
  for (const [i, r] of rows.entries()) {
    for (const key of Object.keys(r))
      if (!allowed.has(key)) throw Error(`Unknown CSV column ${key}; trunk systems use JSON`);
    for (const key of [
      'system',
      'group',
      'name',
      'frequency_mhz',
      'mode',
      'quick_key',
      'group_key',
      'enabled',
    ])
      if (!r[key]) throw Error(`CSV row ${i + 2}: ${key} is required`);
    if (!['true', 'false'].includes(r.enabled.toLowerCase()))
      throw Error(`CSV row ${i + 2}: enabled must be true or false`);
    if (!/^\d{1,2}$/.test(r.quick_key) || !/^\d$/.test(r.group_key))
      throw Error(`CSV row ${i + 2}: quick keys must be integers`);
    let system = systems.find((x) => x.name === r.system);
    if (!system) {
      system = {
        name: r.system,
        type: 'CNV',
        quickKey: Number(r.quick_key),
        enabled: r.enabled.toLowerCase() === 'true',
        groups: [],
      };
      systems.push(system);
    }
    if (
      system.quickKey !== Number(r.quick_key) ||
      system.enabled !== (r.enabled.toLowerCase() === 'true')
    )
      throw Error(`CSV row ${i + 2}: inconsistent settings for system ${r.system}`);
    let group = system.groups.find((x) => x.name === r.group);
    if (!group) {
      group = { name: r.group, quickKey: Number(r.group_key), channels: [] };
      system.groups.push(group);
    }
    if (group.quickKey !== Number(r.group_key))
      throw Error(`CSV row ${i + 2}: inconsistent group key`);
    const sourceIds = [];
    if (r.source_url) {
      if (!r.checked) throw Error(`CSV row ${i + 2}: supply the source checked date`);
      const identity = r.source_url + '|' + r.checked;
      if (!sourceMap.has(identity)) {
        const id = `source-${sources.length + 1}`;
        sourceMap.set(identity, id);
        sources.push({
          id,
          title: r.source_title || r.source_url,
          url: r.source_url,
          checked: r.checked,
        });
      }
      sourceIds.push(sourceMap.get(identity));
    }
    group.channels.push({
      name: r.name,
      frequencyMHz: r.frequency_mhz,
      mode: r.mode.toUpperCase(),
      sourceIds,
    });
  }
  return {
    format: 'bcd325p2-plan-v1',
    title,
    namespace,
    areas,
    researchDate: new Date().toISOString().slice(0, 10),
    sources,
    systems,
  };
}
export function exportCSV(plan) {
  if (plan.systems.some((s) => s.type !== 'CNV'))
    throw Error(
      'CSV export is conventional-only. Export JSON to preserve trunk sites and talkgroups.',
    );
  const rows = [
    [
      'system',
      'group',
      'name',
      'frequency_mhz',
      'mode',
      'quick_key',
      'group_key',
      'enabled',
      'source_url',
      'source_title',
      'checked',
    ],
  ];
  for (const s of plan.systems)
    for (const g of s.groups)
      for (const c of g.channels) {
        const source = plan.sources.find((x) => x.id === c.sourceIds?.[0]);
        rows.push([
          s.name,
          g.name,
          c.name,
          c.frequencyMHz,
          c.mode,
          s.quickKey,
          g.quickKey,
          s.enabled,
          source?.url || '',
          source?.title || '',
          source?.checked || '',
        ]);
      }
  const field = (v) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return rows.map((r) => r.map(field).join(',')).join('\r\n') + '\r\n';
}

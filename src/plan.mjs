import { schema } from './schema.mjs';
import { validatePlan as validateWirePlan } from './protocol.mjs';
export { schema };

export class PlanError extends Error {
  constructor(issues) {
    super(issues.map((x) => `${x.path}: ${x.message}`).join('\n'));
    this.name = 'PlanError';
    this.issues = issues;
  }
}
function checkSchema(value, s, path, issues) {
  const fail = (message) => issues.push({ path, message });
  if (s.const !== undefined && value !== s.const) fail(`must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(value)) fail(`must be one of ${s.enum.join(', ')}`);
  if (s.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('must be an object');
      return;
    }
    for (const key of s.required || [])
      if (!Object.hasOwn(value, key))
        issues.push({ path: `${path}.${key}`, message: 'is required' });
    for (const [key, v] of Object.entries(value)) {
      if (!Object.hasOwn(s.properties, key)) {
        fail(`unknown property ${key}`);
        continue;
      }
      checkSchema(v, s.properties[key], `${path}.${key}`, issues);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(value)) {
      fail('must be an array');
      return;
    }
    if (value.length < (s.minItems || 0) || value.length > s.maxItems)
      fail(`must contain ${s.minItems || 0}–${s.maxItems} entries`);
    if (s.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length)
      fail('must not contain duplicates');
    value.forEach((v, i) => checkSchema(v, s.items, `${path}[${i}]`, issues));
  } else if (s.type === 'string') {
    if (typeof value !== 'string') {
      fail('must be a string');
      return;
    }
    if (value.length < (s.minLength || 0) || value.length > (s.maxLength ?? Infinity))
      fail(`length must be ${s.minLength || 0}–${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern).test(value)) fail(`must match ${s.pattern}`);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('contains control characters');
  } else if (s.type === 'integer') {
    if (!Number.isInteger(value) || value < s.minimum || value > s.maximum)
      fail(`must be an integer from ${s.minimum} to ${s.maximum}`);
  } else if (s.type === 'boolean' && typeof value !== 'boolean') fail('must be true or false');
}
export function frequencyToWire(mhz) {
  if (typeof mhz !== 'string' || !/^\d{2,3}\.\d{1,5}$/.test(mhz))
    throw Error('use decimal MHz, e.g. 162.5500');
  // Uniden's 100 Hz wire notation represents 6.25 kHz channel centers with
  // four decimals (e.g. 851.00625 -> 08510062), as in its band tables.
  const [whole, decimals] = mhz.split('.');
  const value = Number(whole) * 10000 + Number((decimals + '0000').slice(0, 4));
  if (
    ![
      [250000, 5119999],
      [7580000, 8239999],
      [8490125, 8689999],
      [8940125, 9600000],
    ].some(([a, b]) => value >= a && value <= b)
  )
    throw Error(
      'outside BCD325P2 receive bands (25–511.9999, 758–823.9999, 849.0125–868.9999, 894.0125–960 MHz)',
    );
  if (decimals.length === 5 && !['0', '5'].includes(decimals[4]))
    throw Error('fifth decimal must be 0 or 5');
  return String(value).padStart(8, '0');
}
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
function label(full, used, max = 16) {
  const base = full
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) throw Error('name must contain readable ASCII characters');
  let out = base.slice(0, max).trim(),
    n = 2;
  while (used.has(out)) {
    const suffix = ` ${n++}`;
    out = base.slice(0, max - suffix.length).trimEnd() + suffix;
  }
  used.add(out);
  return out;
}
export function inspectPlan(input) {
  const issues = [],
    warnings = [];
  checkSchema(input, schema, 'plan', issues);
  if (issues.length) return { valid: false, issues, warnings };
  const fail = (path, message) => issues.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  const validDate = (v, path) => {
    if (
      !/^\d{4}-\d\d-\d\d$/.test(v) ||
      Number.isNaN(Date.parse(v)) ||
      new Date(v).toISOString().slice(0, 10) !== v
    )
      fail(path, 'invalid calendar date');
  };
  validDate(input.researchDate, 'plan.researchDate');
  const sources = new Set();
  for (const [i, s] of input.sources.entries()) {
    if (sources.has(s.id)) fail(`plan.sources[${i}].id`, 'duplicate source ID');
    sources.add(s.id);
    try {
      const url = new URL(s.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw Error();
    } catch {
      fail(`plan.sources[${i}].url`, 'must be a public HTTP(S) reference without credentials');
    }
    validDate(s.checked, `plan.sources[${i}].checked`);
  }
  const refs = (item, path) => {
    if (!item.sourceIds?.length)
      warn(path, 'No source linked. Confirm this entry before programming.');
    for (const id of item.sourceIds || [])
      if (!sources.has(id)) fail(path, `unknown source ID ${id}`);
  };
  const freq = (value, path) => {
    try {
      frequencyToWire(value);
    } catch (e) {
      fail(path, e.message);
    }
  };
  const keys = new Set(),
    names = new Set();
  let channels = 0,
    siteFrequencies = 0,
    sites = 0,
    conventional = 0,
    talkgroups = 0;
  if (!input.systems.some((s) => s.enabled))
    warn('plan.systems', 'No system is initially enabled. Choose one in the review screen.');
  for (const [i, s] of input.systems.entries()) {
    const path = `plan.systems[${i}]`;
    if (keys.has(s.quickKey)) fail(`${path}.quickKey`, 'system quick keys must be unique');
    keys.add(s.quickKey);
    if (names.has(s.name.trim())) fail(`${path}.name`, 'duplicate system name');
    names.add(s.name.trim());
    if (s.type === 'CNV' && s.sites)
      fail(`${path}.sites`, 'conventional systems do not have trunk sites');
    if (s.type === 'P25S' && !s.sites?.length)
      fail(`${path}.sites`, 'P25 Standard requires at least one site');
    const groupNames = new Set();
    for (const [j, g] of s.groups.entries()) {
      const gp = `${path}.groups[${j}]`;
      if (groupNames.has(g.name.trim())) fail(`${gp}.name`, 'duplicate group name');
      groupNames.add(g.name.trim());
      if (s.type === 'P25S' && g.channels.length > 500)
        fail(`${gp}.channels`, 'maximum 500 talkgroups per group');
      const identities = new Set();
      for (const [k, c] of g.channels.entries()) {
        const cp = `${gp}.channels[${k}]`;
        channels++;
        refs(c, cp);
        if (s.type === 'CNV') {
          conventional++;
          freq(c.frequencyMHz, `${cp}.frequencyMHz`);
          if (!c.mode) fail(`${cp}.mode`, 'is required for conventional channels');
          if (c.tgid !== undefined) fail(`${cp}.tgid`, 'belongs to a P25 trunk system');
          if (c.mode === 'FMB' && (Number(c.frequencyMHz) < 76 || Number(c.frequencyMHz) >= 108))
            warn(cp, 'Broadcast FM mode outside 76–108 MHz; verify the mode.');
        } else {
          talkgroups++;
          if (!Number.isInteger(c.tgid)) fail(`${cp}.tgid`, 'is required for P25 talkgroups');
          if (c.frequencyMHz !== undefined || c.mode !== undefined)
            fail(cp, 'P25 talkgroups use tgid; put frequencies in sites');
          if (c.encryption !== 'clear')
            warn(cp, 'Encryption status is unconfirmed. Encrypted audio cannot be decoded.');
        }
        const identity = s.type === 'CNV' ? `${c.frequencyMHz}/${c.mode}` : c.tgid;
        if (identities.has(identity))
          warn(cp, 'Duplicate frequency/mode or talkgroup within this group');
        identities.add(identity);
        if (!c.name.trim()) fail(`${cp}.name`, 'must not be blank');
      }
    }
    const siteNames = new Set();
    for (const [j, site] of (s.sites || []).entries()) {
      sites++;
      siteFrequencies += site.frequencies.length;
      refs(site, `${path}.sites[${j}]`);
      if (siteNames.has(site.name.trim())) fail(`${path}.sites[${j}].name`, 'duplicate site name');
      siteNames.add(site.name.trim());
      site.frequencies.forEach((f, k) => freq(f, `${path}.sites[${j}].frequencies[${k}]`));
    }
  }
  if (channels + siteFrequencies > 25000)
    fail('plan.systems', 'exceeds 25,000 channel/frequency records');
  if (sites + input.systems.filter((s) => s.type === 'CNV').length > 1000)
    fail('plan.systems', 'exceeds 1,000 internal sites (including conventional systems)');
  for (const [i, e] of (input.excluded || []).entries())
    for (const id of e.sourceIds || [])
      if (!sources.has(id)) fail(`plan.excluded[${i}]`, `unknown source ID ${id}`);
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    counts: { conventional, talkgroups, sites, siteFrequencies, systems: input.systems.length },
  };
}
export async function compilePlan(input) {
  const result = inspectPlan(input);
  if (!result.valid) throw new PlanError(result.issues);
  const systemNames = new Set();
  const systems = input.systems.map((s) => {
    const groupNames = new Set(),
      siteNames = new Set();
    return {
      name: input.namespace + ' ' + label(s.name, systemNames, 15 - input.namespace.length),
      fullName: s.name,
      type: s.type,
      quickKey: s.quickKey,
      enabled: s.enabled,
      groups: s.groups.map((g) => {
        const names = new Set();
        return {
          name: label(g.name, groupNames),
          fullName: g.name,
          quickKey: g.quickKey,
          channels: g.channels.map((c) => ({
            name: label(c.name, names),
            fullName: c.name,
            sourceIds: c.sourceIds || [],
            notes: c.notes || '',
            ...(s.type === 'CNV'
              ? {
                  frequency: frequencyToWire(c.frequencyMHz),
                  modulation: c.mode === 'P25' ? 'NFM' : c.mode,
                  audio: c.mode === 'P25' ? '2' : '1',
                  tone: '0',
                  nac: 'SRCH',
                }
              : { tgid: c.tgid, audio: '2' }),
          })),
        };
      }),
      ...(s.type === 'P25S'
        ? {
            sites: s.sites.map((site) => ({
              name: label(site.name, siteNames),
              fullName: site.name,
              sourceIds: site.sourceIds || [],
              frequencies: site.frequencies.map((f) => ({ frequency: frequencyToWire(f) })),
            })),
          }
        : {}),
    };
  });
  const compiled = {
    format: 'bcd325p2-local-plan-v1',
    model: 'BCD325P2',
    namespace: input.namespace,
    example: input.example === true,
    title: input.title,
    sourceChecked: input.researchDate,
    systems,
    counts: result.counts,
  };
  compiled.id = (await digest(compiled)).slice(0, 24);
  validateWirePlan(compiled);
  return { plan: compiled, warnings: result.warnings };
}
export function researchBrief({
  areas,
  interests = 'Public safety, local amateur repeaters, weather, travel',
  radius = 'Local reception and nearby travel',
  notes = '',
} = {}) {
  if (typeof areas !== 'string' || !areas.trim())
    throw Error('Provide a city/county and state or region. A street address is not required.');
  if ([areas, interests, radius, notes].some((x) => typeof x !== 'string' || x.length > 4000))
    throw Error('Brief fields must be text up to 4,000 characters.');
  return `Prepare a source-checked Uniden BCD325P2 listening plan using mac-uniden-bcd325p2.\n\nAreas: ${areas}\nInterests: ${interests}\nCoverage goal: ${radius}\nAdditional preferences: ${notes || 'None'}\n\nRead AGENTS.md, docs/AGENT-START.md and schemas/plan.schema.json in the project. Use your own current web-research tools; the programmer does not supply a frequency database. Confirm agency/service, receive frequency, analog mode or conventional P25, and for P25 trunking the system, sites/control frequencies and decimal talkgroups. Cite source URLs and checked dates. Distinguish confirmed facts from uncertain reception. Use repeater outputs for listening. Exclude encrypted-only channels and unsupported trunk types, documenting why in excluded. Do not promise reception across terrain or simulcast performance. Keep NOAA and broadcast FM separate and disabled initially because they transmit continuously. Do not infer privately identifiable amateur operators or promise a particular operator will be on air.\n\nProduce a bcd325p2-plan-v1 JSON file, retaining full names and sourceIds. Short display labels are generated automatically. Conservative defaults: one local core system initially enabled, analog tone filters off, conventional P25 NAC search. Validate with the scanner_validate_plan MCP tool or node src/cli.mjs validate <file>. Fix validation errors; explain warnings. Stage with scanner_stage_plan or node src/cli.mjs stage <file>. The user reviews the plan in the local browser, connects the scanner through Chrome, and chooses Program. Never report hardware success from validation or simulation; require the completed receipt and full readback. Keep personal plans, logs and snapshots out of the repository.\n`;
}

import { compilePlan, researchBrief } from '/src/plan.mjs';
import { importCSV } from '/src/csv.mjs';
import { Programmer } from '/src/protocol.mjs';
import { SerialTransport } from '/src/transport.mjs';
const $ = (id) => document.getElementById(id);
let session,
  sourcePlan,
  compiled,
  enabled = new Set(),
  actualKeys,
  transport,
  programmer,
  lastSession,
  validationWarnings = [],
  busy = false,
  brief = '';
const messages = [];
const text = (tag, value, className) => {
  const e = document.createElement(tag);
  e.textContent = value;
  if (className) e.className = className;
  return e;
};
function showNotice(message, error = false) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function log(message) {
  messages.push(`${new Date().toLocaleTimeString()}  ${message}`);
  $('log').textContent = messages.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}
function view(name) {
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${name}`;
  for (const el of document.querySelectorAll('.nav')) {
    el.classList.toggle('active', el.dataset.view === name);
    if (el.dataset.view === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
  if (name === 'records') refreshHistory().catch((e) => showNotice(e.message, true));
}
async function api(url, data) {
  const response = await fetch(
    url,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Scanner-Token': session.token },
          body: JSON.stringify(data),
        },
  );
  const value = await response.json();
  if (!response.ok) throw Error(value.error || `Local service returned ${response.status}`);
  return value;
}
function download(name, data, type = 'application/json') {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'], {
    type,
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    showNotice('Copied to clipboard.');
  } catch {
    showNotice('Clipboard is unavailable. Select the text and copy it manually.', true);
  }
}
function controls() {
  const connected = Boolean(transport && !transport.closed);
  $('connect').disabled = busy || connected || !session || !navigator.serial;
  for (const id of ['backup', 'disconnect']) $(id).disabled = busy || !connected;
  $('verify').disabled = busy || !connected || !compiled;
  $('program').disabled =
    busy || !connected || !compiled || compiled.example || !$('reviewed').checked || !enabled.size;
  $('stop').disabled = !busy || !programmer;
  for (const id of ['import', 'example', 'add-channel', 'edit-json', 'reviewed'])
    $(id).disabled = busy;
  for (const input of document.querySelectorAll('[data-system]')) input.disabled = busy;
  $('upload-title').textContent = compiled?.title || 'No plan selected';
  $('upload-summary').textContent = compiled
    ? `${compiled.counts.conventional} channels · ${compiled.counts.talkgroups} talkgroups · ${compiled.counts.sites} sites. ${enabled.size} system(s) selected for initial listening.`
    : 'Import or prepare a plan, then review it before programming.';
  $('upload-reason').textContent = busy
    ? 'Working. Keep the cable and local server connected.'
    : !connected
      ? 'Connect the scanner to continue.'
      : !compiled
        ? 'Load a listening plan first.'
        : compiled.example
          ? 'This is an example. Research and adapt it, then remove the example flag before programming.'
          : !$('reviewed').checked
            ? 'Review the plan and check the review confirmation on the Listening plan screen.'
            : !enabled.size
              ? 'Select at least one system for initial listening.'
              : 'Ready. The upload preserves existing systems and verifies saved records.';
  $('connection-chip').textContent = connected ? 'Scanner connected' : 'Not connected';
  $('connection-chip').classList.toggle('connected', connected);
}
async function run(fn) {
  if (busy) return;
  if (programmer) programmer.cancelled = false;
  busy = true;
  controls();
  showNotice('');
  try {
    await fn();
  } catch (e) {
    showNotice(e.message, true);
    log(e.message);
    $('scanner-status').textContent = e.message;
    if (programmer)
      try {
        await api('/api/save', {
          kind: 'diagnostic',
          data: {
            at: new Date().toISOString(),
            error: e.message,
            planId: compiled?.id,
            transcript: programmer.transcript,
            receipt: programmer.receipt,
          },
        });
      } catch {
        log('Could not save diagnostics. Download the session log before closing.');
      }
  } finally {
    busy = false;
    if (programmer)
      lastSession = { receipt: programmer.receipt, transcript: [...programmer.transcript] };
    if (transport?.closed) {
      transport = null;
      programmer = null;
    }
    controls();
  }
}
async function usePlan(input, { persist = true } = {}) {
  if (busy) throw Error('Finish the scanner operation before changing plans');
  const result = await compilePlan(input);
  if (persist) await api('/api/stage', { plan: input });
  sourcePlan = structuredClone(input);
  compiled = result.plan;
  validationWarnings = result.warnings;
  actualKeys = null;
  enabled = new Set(compiled.systems.filter((s) => s.enabled).map((s) => s.name));
  $('reviewed').checked = false;
  renderPlan(result.warnings);
  controls();
  view('plan');
  if (persist) await refreshPlans();
  showNotice(
    input.example
      ? 'Example loaded for preview. Adapt it to your area before programming.'
      : 'Plan validated. Review sources and choose the systems to enable.',
  );
}
function renderPlan(warnings = validationWarnings) {
  $('empty-plan').hidden = true;
  $('plan-content').hidden = false;
  $('plan-title').textContent = compiled.title;
  $('plan-kind').textContent = compiled.example
    ? 'EXAMPLE · PREVIEW ONLY'
    : 'VALIDATED CHANNEL PLAN';
  $('plan-meta').textContent =
    `${sourcePlan.areas.join(' · ') || 'No area specified'} · Research date ${sourcePlan.researchDate} · ${compiled.id.slice(0, 8)}`;
  const metrics = $('metrics');
  metrics.replaceChildren();
  for (const [value, label] of [
    [compiled.counts.conventional, 'Conventional channels'],
    [compiled.counts.talkgroups, 'P25 talkgroups'],
    [compiled.counts.sites, 'Trunk sites'],
    [compiled.counts.systems, 'Systems'],
  ]) {
    const el = text('div', '', 'metric');
    el.append(text('b', value), text('span', label));
    metrics.append(el);
  }
  $('warnings').replaceChildren();
  $('warnings').hidden = !warnings.length;
  if (warnings.length) {
    $('warnings').append(text('strong', `${warnings.length} item(s) to review`));
    const list = document.createElement('ul');
    for (const w of warnings.slice(0, 12)) list.append(text('li', `${w.message} (${w.path})`));
    if (warnings.length > 12)
      list.append(
        text(
          'li',
          `${warnings.length - 12} more warnings. The CLI validation report contains the full list.`,
        ),
      );
    $('warnings').append(list);
  }
  $('systems').replaceChildren();
  for (const s of compiled.systems) {
    const card = text('div', '', 'system-card'),
      check = document.createElement('input'),
      label = document.createElement('label');
    check.type = 'checkbox';
    check.dataset.system = s.name;
    check.checked = enabled.has(s.name);
    check.id = `system-${s.quickKey}`;
    label.htmlFor = check.id;
    label.append(
      text('span', s.fullName),
      text(
        'small',
        `${s.type === 'CNV' ? 'Conventional' : 'P25 Standard'} · ${s.groups.reduce((n, g) => n + g.channels.length, 0)} ${s.type === 'CNV' ? 'channels' : 'talkgroups'}${s.sites ? ` · ${s.sites.length} sites` : ''}`,
      ),
    );
    check.addEventListener('change', () => {
      if (check.checked) enabled.add(s.name);
      else enabled.delete(s.name);
      $('reviewed').checked = false;
      controls();
    });
    card.append(check, label, text('span', `Key ${actualKeys?.[s.name] ?? s.quickKey}`, 'key'));
    $('systems').append(card);
  }
  renderChannels();
  $('sources').replaceChildren();
  if (sourcePlan.notes) $('sources').append(text('p', sourcePlan.notes));
  for (const source of sourcePlan.sources) {
    const row = text('div', '', 'source-item'),
      link = text('a', source.title);
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    row.append(link, text('small', `Checked ${source.checked} · ${source.id}`));
    $('sources').append(row);
  }
  if (!sourcePlan.sources.length)
    $('sources').append(
      text('p', 'No sources linked. Confirm these entries independently before programming.'),
    );
  if (sourcePlan.excluded?.length) {
    $('sources').append(text('h3', 'Excluded from this plan'));
    for (const e of sourcePlan.excluded) $('sources').append(text('p', `${e.name}: ${e.reason}`));
  }
}
function renderChannels() {
  if (!compiled) return;
  $('channel-list').replaceChildren();
  const filter = $('filter').value.toLowerCase().trim();
  for (const s of compiled.systems) {
    const details = document.createElement('details');
    details.open = true;
    details.append(text('summary', `${s.fullName} · ${s.name}`));
    const wrap = text('div', '', 'table-wrap'),
      table = document.createElement('table'),
      head = table.createTHead().insertRow();
    for (const title of ['Channel / site', 'Frequency / ID', 'Mode', 'Group / sources'])
      head.append(text('th', title));
    const body = table.createTBody();
    let rows = 0;
    const add = (name, label, value, mode, group, refs) => {
      if (filter && !`${name} ${label} ${value} ${mode} ${group}`.toLowerCase().includes(filter))
        return;
      rows++;
      const row = body.insertRow(),
        a = text('td', name);
      a.append(text('small', label));
      row.append(a, text('td', value, 'frequency'), text('td', mode));
      const last = text('td', group);
      for (const id of refs) {
        const source = sourcePlan.sources.find((x) => x.id === id);
        if (source) {
          last.append(document.createElement('br'));
          const link = text('a', source.title, 'source-link');
          link.href = source.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          last.append(link);
        }
      }
      row.append(last);
    };
    for (const g of s.groups)
      for (const c of g.channels)
        add(
          c.fullName,
          c.name,
          c.tgid ? `TG ${c.tgid}` : `${(Number(c.frequency) / 10000).toFixed(4)} MHz`,
          c.audio === '2' ? 'P25' : c.modulation,
          g.fullName,
          c.sourceIds,
        );
    for (const site of s.sites || [])
      for (const f of site.frequencies)
        add(
          site.fullName,
          site.name,
          `${(Number(f.frequency) / 10000).toFixed(4)} MHz`,
          'P25 site',
          'Control / alternate',
          site.sourceIds,
        );
    if (rows) {
      wrap.append(table);
      details.append(wrap);
      $('channel-list').append(details);
    }
  }
  if (!$('channel-list').children.length)
    $('channel-list').append(text('p', 'No channels match this filter.', 'muted'));
}
async function refreshPlans() {
  const plans = await api('/api/plans');
  $('inbox').replaceChildren();
  const byId = new Map();
  for (const plan of plans) if (!byId.has(plan.id)) byId.set(plan.id, plan);
  const unique = [...byId.values()].slice(0, 6);
  if (!unique.length) {
    $('inbox').append(text('p', 'Agent inbox is empty. Staged plans appear here.', 'muted'));
    return;
  }
  $('inbox').append(text('p', 'AGENT INBOX / SAVED PLANS', 'inbox-label'));
  for (const p of unique) {
    const row = text('div', '', 'inbox-row'),
      desc = document.createElement('div'),
      button = text('button', 'Review plan');
    desc.append(
      text('h3', p.title),
      text(
        'p',
        `${p.counts.conventional} channels · ${p.counts.talkgroups} talkgroups${p.example ? ' · Example' : ''}`,
      ),
    );
    button.disabled = busy;
    button.onclick = () =>
      api('/api/record?file=' + encodeURIComponent(p.file))
        .then((d) => usePlan(d.input, { persist: false }))
        .catch((e) => showNotice(e.message, true));
    row.append(desc, button);
    $('inbox').append(row);
  }
}
async function refreshHistory() {
  const records = await api('/api/history');
  $('history').replaceChildren();
  if (!records.length) {
    $('history').append(text('p', 'No scanner sessions saved yet.', 'muted'));
    return;
  }
  for (const r of records) {
    const row = text('div', '', 'history-row'),
      desc = document.createElement('div'),
      button = text('button', 'Download JSON');
    desc.append(
      text(
        'h3',
        `${r.kind === 'receipt' ? 'Upload' : r.kind === 'verification' ? 'Verification' : 'Memory backup'} · ${r.status}`,
      ),
      text(
        'p',
        `${r.at ? new Date(r.at).toLocaleString() : ''}${r.systems !== undefined ? ` · ${r.systems} systems` : ''}`,
      ),
    );
    if (r.error) desc.append(text('p', r.error, 'error'));
    button.onclick = () =>
      api('/api/record?file=' + encodeURIComponent(r.file))
        .then((data) => download(r.file, data))
        .catch((e) => showNotice(e.message, true));
    row.append(desc, button);
    $('history').append(row);
  }
}
for (const button of document.querySelectorAll('[data-view]'))
  button.onclick = () => view(button.dataset.view);
for (const button of document.querySelectorAll('[data-go]'))
  button.onclick = () => view(button.dataset.go);
for (const button of document.querySelectorAll('[data-close]'))
  button.onclick = () => $(button.dataset.close).close();
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw Error('Plan files must be under 4 MB');
    const content = await file.text();
    await usePlan(
      file.name.toLowerCase().endsWith('.csv') ? importCSV(content) : JSON.parse(content),
    );
  } catch (e) {
    showNotice(e.message, true);
  } finally {
    $('file').value = '';
  }
};
$('example').onclick = () =>
  fetch('/example.json')
    .then((r) => r.json())
    .then((input) => usePlan(input))
    .catch((e) => showNotice(e.message, true));
$('filter').oninput = renderChannels;
$('reviewed').onchange = controls;
$('refresh-plans').onclick = () => refreshPlans().catch((e) => showNotice(e.message, true));
$('refresh-history').onclick = () => refreshHistory().catch((e) => showNotice(e.message, true));
$('edit-json').onclick = () => {
  $('json-editor').value = JSON.stringify(sourcePlan, null, 2);
  $('json-error').textContent = '';
  $('json-dialog').showModal();
};
$('json-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await usePlan(JSON.parse($('json-editor').value));
    $('json-dialog').close();
  } catch (e) {
    $('json-error').textContent = e.message;
  }
};
$('export-json').onclick = () => download('bcd325p2-plan.json', sourcePlan);
$('print').onclick = () => window.print();
let printState;
window.addEventListener('beforeprint', () => {
  if (!compiled || printState) return;
  printState = {
    filter: $('filter').value,
    details: [...document.querySelectorAll('#view-plan details')].map((x) => x.open),
  };
  $('filter').value = '';
  renderChannels();
  document.querySelectorAll('#view-plan details').forEach((x) => (x.open = true));
});
window.addEventListener('afterprint', () => {
  if (!printState) return;
  $('filter').value = printState.filter;
  renderChannels();
  document.querySelectorAll('#view-plan details').forEach((x, i) => {
    x.open = printState.details[i] ?? true;
  });
  printState = null;
});
$('add-channel').onclick = () => {
  $('channel-error').textContent = '';
  $('channel-source-date').value = new Date().toISOString().slice(0, 10);
  $('channel-dialog').showModal();
};
$('channel-form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const values = Object.fromEntries(new FormData(e.target)),
      date = new Date().toISOString().slice(0, 10);
    const input = sourcePlan
      ? structuredClone(sourcePlan)
      : {
          format: 'bcd325p2-plan-v1',
          title: 'My listening plan',
          namespace: 'MU',
          areas: [],
          researchDate: date,
          sources: [],
          systems: [],
        };
    let system = input.systems.find((s) => s.name === values.system);
    if (system && system.type !== 'CNV') throw Error('Choose a conventional system name.');
    if (!system) {
      const used = new Set(input.systems.map((s) => s.quickKey)),
        key = [...Array(100)].map((_, i) => (i + 1) % 100).find((k) => !used.has(k));
      if (key === undefined) throw Error('No free system quick key');
      system = {
        name: values.system,
        type: 'CNV',
        quickKey: key,
        enabled: !input.systems.length,
        groups: [{ name: 'Channels', quickKey: 1, channels: [] }],
      };
      input.systems.push(system);
    }
    const sourceIds = [];
    if (values.source) {
      let id = `manual-${input.sources.length + 1}`;
      while (input.sources.some((s) => s.id === id)) id += 'x';
      input.sources.push({ id, title: values.source, url: values.source, checked: values.checked });
      sourceIds.push(id);
    }
    system.groups[0].channels.push({
      name: values.name,
      frequencyMHz: values.frequencyMHz.trim(),
      mode: values.mode,
      sourceIds,
    });
    await usePlan(input);
    $('channel-dialog').close();
    e.target.reset();
  } catch (e) {
    $('channel-error').textContent = e.message;
  }
};
$('brief-form').onsubmit = (e) => {
  e.preventDefault();
  try {
    brief = researchBrief(Object.fromEntries(new FormData(e.target)));
    $('brief-text').textContent = brief;
    $('brief-result').hidden = false;
  } catch (e) {
    showNotice(e.message, true);
  }
};
$('copy-brief').onclick = () => copy(brief);
$('download-brief').onclick = () => download('bcd325p2-agent-brief.txt', brief, 'text/plain');
$('copy-config').onclick = () => copy($('mcp-config').textContent);
$('connect').onclick = () =>
  run(async () => {
    transport = await SerialTransport.choose();
    programmer = new Programmer(transport, {
      save: (kind, data) => api('/api/save', { kind, data }),
      log,
    });
    try {
      const identity = await programmer.identify();
      $('identity').textContent = `${identity.model} · ${identity.firmware} · Web Serial`;
      $('scanner-status').textContent = 'Scanner connected. No channel memory changed.';
      log(`Connected: ${identity.model}, ${identity.firmware}`);
    } catch (e) {
      await transport.close();
      throw e;
    }
  });
$('disconnect').onclick = () =>
  run(async () => {
    await transport.close();
    log('Disconnected.');
    $('scanner-status').textContent = 'Disconnected.';
  });
$('backup').onclick = () =>
  run(async () => {
    const result = await programmer.backup();
    $('scanner-status').textContent = `Saved ${result.snapshot.systems.length} existing systems.`;
    log(`Backup saved: ${result.saved.file}`);
  });
$('program').onclick = () =>
  run(async () => {
    if (!compiled || compiled.example || !$('reviewed').checked || !enabled.size)
      throw Error('Review a non-example plan and choose at least one system first.');
    const { resume } = await api('/api/recovery?plan=' + compiled.id),
      plan = { ...compiled, ...(resume ? { resume } : {}) };
    $('scanner-status').textContent =
      'Backing up, programming and verifying. Keep the scanner connected.';
    const receipt = await programmer.install(plan, [...enabled]);
    actualKeys = receipt.quickKeys;
    renderPlan();
    $('reviewed').checked = true;
    $('scanner-status').textContent = 'Upload verified. Press Scan/Srch on the scanner to listen.';
    showNotice(
      'Upload verified. Every saved channel and listening key matches the plan. Press Scan/Srch to listen.',
    );
    log(`Complete receipt: ${receipt.saved?.file || 'download session log'}`);
  });
$('verify').onclick = () =>
  run(async () => {
    const result = await programmer.verify(compiled);
    actualKeys = result.keys;
    enabled = new Set(result.enabledNames);
    renderPlan();
    $('reviewed').checked = true;
    $('scanner-status').textContent = 'Installed plan verified. Press Scan/Srch to listen.';
    log(`Verification saved: ${result.saved.file}`);
  });
$('stop').onclick = () => {
  if (programmer) {
    programmer.cancelled = true;
    log('Stop requested. Completing the current command and leaving Remote Mode.');
  }
};
$('download-log').onclick = () =>
  download('bcd325p2-session.json', {
    at: new Date().toISOString(),
    messages,
    receipt: programmer?.receipt || lastSession?.receipt,
    transcript: programmer?.transcript || lastSession?.transcript || [],
  });
window.addEventListener('beforeunload', (e) => {
  if (busy) {
    e.preventDefault();
    e.returnValue = 'Scanner operation in progress';
  }
});
try {
  session = await api('/api/session');
  $('data-directory').textContent = `Private records: ${session.dataDirectory}`;
  $('mcp-config').textContent = JSON.stringify(
    {
      mcpServers: {
        'uniden-bcd325p2': {
          command: session.nodeExecutable,
          args: [session.root + '/src/cli.mjs', 'mcp', '--data-dir', session.dataDirectory],
        },
      },
    },
    null,
    2,
  );
  await refreshPlans();
  controls();
  if (!navigator.serial)
    showNotice(
      'Plan preparation works here. Use desktop Chrome to connect the scanner through Web Serial.',
    );
} catch (e) {
  showNotice(
    `Local service unavailable: ${e.message}. Start the programmer and open its local URL.`,
    true,
  );
  controls();
}

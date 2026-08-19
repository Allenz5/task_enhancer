'use strict';
/*
 * Kestrel Capture Console — front end.
 *
 * No capture value is written into this file. Every session, frame, byte,
 * profile parameter and reference clause on screen arrives from an endpoint
 * that reads ./input at request time, and each surface fetches only the
 * endpoint it is entitled to.
 */

const surface = document.getElementById('surface');
const crumb = document.getElementById('crumb');
const statusbar = document.getElementById('statusbar');

const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const grouped = (n) => Number(n).toLocaleString('en-US');

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${url}`);
  }
  return res.json();
}

/* ---------------- client-held query state ----------------
 * A result set does not exist until a display filter is submitted, and it lives
 * only for as long as the operator keeps it. Nothing is stored server side. */
let queryState = null;      // { expression, window, result }
let formWindow = 'latest_segment';
let formExpression = '';
let ledgerSort = { col: 'arrival', dir: 1 };
let profileView = { order: 'last_modified', q: '' };

function setCrumb(parts) {
  crumb.innerHTML = parts.map((p, i) => {
    const sep = i ? '<span class="sep">/</span>' : '';
    return sep + (p.href
      ? `<a href="${esc(p.href)}">${esc(p.label)}</a>`
      : `<span>${esc(p.label)}</span>`);
  }).join('');
}

function setStatus(bits) {
  statusbar.innerHTML = bits.map((b) => `<span>${b}</span>`).join('');
}

function setRail(key) {
  document.querySelectorAll('#rail a.nav').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === key);
  });
}

function begin(state) {
  surface.dataset.surface = state;
  surface.dataset.ready = 'false';
  surface.innerHTML = '<div class="loading">Loading…</div>';
}

function done() { surface.dataset.ready = 'true'; }

/* ================================================================== *
 * Capture workspace
 * ================================================================== */

let throughputRange = 'hour';

async function renderHome() {
  begin('capture_home');
  setRail('home');
  setCrumb([{ label: 'Capture workspace' }]);
  const d = await api('/api/home');
  document.getElementById('ids-badge').textContent = d.ids_unread;

  const spark = (series) => `<div class="spark">${series
    .map((v) => `<i style="height:${Math.max(3, Math.round(v / 160))}px" title="${v} ${esc(d.throughput.unit)}"></i>`)
    .join('')}</div>`;

  surface.innerHTML = `
    <div class="banner" id="release-callout">
      <span>${esc(d.release_note)}</span>
      <button type="button" id="dismiss-callout">dismiss</button>
    </div>
    <div class="banner" style="background:#eef4fa;border-color:#c9dcef">
      <span>${esc(d.banner)}</span><span class="dim">maintenance</span>
    </div>

    <h1 class="page-title">Capture workspace</h1>
    <p class="page-sub">Sensor and storage health for the stored capture set · generated ${esc(d.generated_at)}</p>

    <div class="card">
      <div class="card-head"><span>Sensor health</span><span class="dim" style="font-size:12px">per capture interface</span></div>
      <div class="card-body" style="padding:0">
        <table class="dense">
          <thead><tr>
            <th>Node</th><th>Interface</th><th>Link</th><th>Uptime (days)</th>
            <th>Kernel drops</th><th>Ring buffer</th><th>NTP</th>
          </tr></thead>
          <tbody>${d.interfaces.map((i) => `
            <tr${i.ntp === 'drifting' ? ' class="row-tint-amber"' : ''}>
              <td class="mono">${esc(i.node)}</td>
              <td class="mono">${esc(i.iface)}</td>
              <td>${esc(i.link)}</td>
              <td class="r">${grouped(i.uptime_days)}</td>
              <td class="r">${grouped(i.kernel_drops)}</td>
              <td style="width:130px"><div class="bar"><i style="width:${i.ring_utilisation_pct}%"></i></div>
                <span class="dim" style="font-size:11px">${i.ring_utilisation_pct}%</span></td>
              <td>${esc(i.ntp)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="card-head">
          <span>Ingest throughput</span>
          <span class="segmented">
            <button class="btn small" data-range="hour" aria-pressed="${throughputRange === 'hour'}">Last hour</button>
            <button class="btn small" data-range="day" aria-pressed="${throughputRange === 'day'}">Last day</button>
          </span>
        </div>
        <div class="card-body">
          ${spark(d.throughput[throughputRange])}
          <p class="dim" style="font-size:11px;margin:6px 0 0">${esc(d.throughput.unit)} · aggregated across capture interfaces</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span>Retention planner</span></div>
        <div class="card-body">
          <dl class="fv">
            <dt>Disk headroom</dt><dd>${d.retention.disk_headroom_pct}%</dd>
            <dt>Retained span</dt><dd>${d.retention.retained_days} days</dd>
            <dt>Oldest segment overwritten</dt><dd>${esc(d.retention.oldest_segment_overwritten)}</dd>
            <dt>Capture volume</dt><dd class="mono">${esc(d.retention.volume)}</dd>
          </dl>
          <div class="bar" style="margin-top:10px"><i style="width:${100 - d.retention.disk_headroom_pct}%"></i></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span>Link layer and MTU (sensor traffic)</span></div>
        <div class="card-body">
          <table class="dense">
            <thead><tr><th>Encapsulation</th><th>Share</th><th>MTU</th><th>Share</th></tr></thead>
            <tbody>${d.link_layer.map((l, i) => `
              <tr><td>${esc(l.label)}</td><td class="r">${l.share_pct}%</td>
              <td class="mono">${esc((d.mtu[i] || {}).label || '')}</td>
              <td class="r">${d.mtu[i] ? d.mtu[i].share_pct + '%' : ''}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span>Capture filter configuration</span></div>
        <div class="card-body">
          <dl class="fv">
            <dt>Standing BPF</dt><dd class="mono">${esc(d.bpf.standing)}</dd>
            <dt>Snap length</dt><dd class="num">${grouped(d.bpf.snaplen)} bytes</dd>
            <dt>Slicing</dt><dd>${esc(d.bpf.slicing)}</dd>
          </dl>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span>Stored capture set</span></div>
      <div class="card-body">
        <div class="metrics">
          <div class="metric"><div class="m-val num" id="metric-segments">${grouped(d.capture_set.segments)}</div><div class="m-lbl">Capture segments</div></div>
          <div class="metric"><div class="m-val num" id="metric-frames">${grouped(d.capture_set.frames_indexed)}</div><div class="m-lbl">Frames indexed</div></div>
          <div class="metric"><div class="m-val mono" style="font-size:14px">${esc(d.capture_set.volume)}</div><div class="m-lbl">Store</div></div>
          <div class="metric"><div class="m-val mono" style="font-size:14px">${esc(d.capture_set.index_engine)}</div><div class="m-lbl">Index engine</div></div>
        </div>
        <p class="dim" style="font-size:12px;margin:10px 0 0">
          Sessions are produced by a display filter, never browsed.
          <a href="#/search">Open capture search →</a>
        </p>
      </div>
    </div>

    <div class="card collapsed" id="card-segments">
      <div class="card-head"><span>Segment rotation log</span><button class="chev" type="button">expand</button></div>
      <div class="card-body" style="padding:0">
        <table class="dense">
          <thead><tr><th>Segment file</th><th>Rotated</th><th>Size</th><th>Sensor</th><th></th></tr></thead>
          <tbody>${d.segment_log.map((s) => `
            <tr><td class="mono">${esc(s.name)}</td><td class="mono">${esc(s.rotated_at)}</td>
            <td class="r">${grouped(s.size_mb)} MB</td><td class="mono">${esc(s.sensor)}</td>
            <td class="dim">${s.latest ? 'most recent' : ''}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  surface.querySelectorAll('[data-range]').forEach((b) => {
    b.addEventListener('click', () => { throughputRange = b.dataset.range; renderHome(); });
  });
  const callout = document.getElementById('dismiss-callout');
  if (callout) callout.addEventListener('click', () => document.getElementById('release-callout').remove());
  wireCollapsibles();
  setStatus([
    `Segments: ${grouped(d.capture_set.segments)}`,
    `Frames indexed: ${grouped(d.capture_set.frames_indexed)}`,
    `Store: ${esc(d.capture_set.volume)}`,
    'Profile: Default',
  ]);
  done();
}

/* ================================================================== *
 * Capture search — the display filter form. Carries no results.
 * ================================================================== */

async function renderSearch() {
  begin('session_search');
  setRail('search');
  setCrumb([{ label: 'Capture search' }]);
  const d = await api('/api/search-form');

  surface.innerHTML = `
    <h1 class="page-title">Capture search</h1>
    <p class="page-sub">Compose a display filter and run it. The result set does not exist until the query is submitted.</p>

    <form id="filter-form">
      <div class="filterbar">
        <input class="expr" id="filter-expr" name="expression" autocomplete="off" spellcheck="false"
               placeholder="Apply a display filter … e.g. session.id" value="${esc(formExpression)}">
        <button class="btn primary" id="btn-run-query" type="submit">Search</button>
      </div>
      <div class="scoperow">
        <span class="lbl">Capture window</span>
        <select id="scope-select">
          ${d.windows.map((w) => `<option value="${esc(w.id)}"${w.id === formWindow ? ' selected' : ''}>${esc(w.label)}</option>`).join('')}
        </select>
        <span class="lbl">Active scope</span>
        <span class="active-scope" id="active-scope">${esc((d.windows.find((w) => w.id === formWindow) || {}).label || '')}</span>
        <span class="dim" id="scope-hint">${formWindow === 'latest_segment'
          ? 'Scoped to the most recently rotated segment — earlier segments are not searched.'
          : 'Every rotated segment in the stored set is searched.'}</span>
      </div>
      <div class="countstrip" id="expr-state">Enter an expression to run.</div>
    </form>

    <div class="grid2" style="margin-top:12px">
      <div class="card">
        <div class="card-head"><span>Saved filters</span></div>
        <div class="card-body">
          <div class="chips">${d.saved.map((s) => `
            <button class="chip" type="button" data-expr="${esc(s.expression)}">
              ${esc(s.label)} <span class="mono">${esc(s.expression)}</span>
            </button>`).join('')}</div>
        </div>
      </div>
      <div class="card collapsed" id="card-history">
        <div class="card-head"><span>Query history</span><button class="chev" type="button">expand</button></div>
        <div class="card-body" style="padding:0">
          <table class="dense">
            <thead><tr><th>Expression</th><th>Ran</th></tr></thead>
            <tbody>${d.history.map((h) => `
              <tr><td class="mono">${esc(h.expression)}</td><td class="mono dim">${esc(h.ran_at)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span>Fields this capture set indexes</span></div>
      <div class="card-body" style="padding:0">
        <table class="dense">
          <thead><tr><th>Field</th><th>Type</th><th>Meaning</th></tr></thead>
          <tbody>${d.fields.map((f) => `
            <tr><td class="mono">${esc(f.name)}</td><td class="dim">${esc(f.type)}</td><td>${esc(f.note)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  const input = document.getElementById('filter-expr');
  const state = document.getElementById('expr-state');
  const scope = document.getElementById('scope-select');

  const validate = async () => {
    formExpression = input.value;
    if (!input.value.trim()) {
      input.classList.remove('valid', 'invalid');
      state.innerHTML = 'Enter an expression to run.';
      return false;
    }
    const v = await api('/api/query/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: input.value }),
    });
    input.classList.toggle('valid', v.ok);
    input.classList.toggle('invalid', !v.ok);
    state.innerHTML = v.ok
      ? 'Expression parses against the indexed fields.'
      : `<span class="err">${esc(v.error)}</span>`;
    return v.ok;
  };

  input.addEventListener('input', validate);

  scope.addEventListener('change', () => {
    formWindow = scope.value;
    const label = scope.options[scope.selectedIndex].textContent;
    document.getElementById('active-scope').textContent = label;
    document.getElementById('scope-hint').textContent = formWindow === 'latest_segment'
      ? 'Scoped to the most recently rotated segment — earlier segments are not searched.'
      : 'Every rotated segment in the stored set is searched.';
  });

  surface.querySelectorAll('.chip[data-expr]').forEach((c) => {
    c.addEventListener('click', () => { input.value = c.dataset.expr; validate(); });
  });

  document.getElementById('filter-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!(await validate())) return;
    state.textContent = 'Running display filter over the capture window…';
    const result = await api('/api/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: input.value, window: formWindow }),
    });
    queryState = { expression: input.value, window: formWindow, result };
    location.hash = '#/results';
  });

  wireCollapsibles();
  if (formExpression) validate();
  setStatus(['No result set', `Capture window: ${formWindow === 'latest_segment' ? 'latest segment' : 'whole capture set'}`, 'Profile: Default']);
  done();
}

/* ================================================================== *
 * Session index — session-level rows only
 * ================================================================== */

const INDEX_COLUMNS = [
  { key: 'first_seen', label: 'First seen', cls: 'mono' },
  { key: 'last_seen', label: 'Last seen', cls: 'mono' },
  { key: 'session_id', label: 'Session id', cls: 'mono link' },
  { key: 'protocol', label: 'Protocol', cls: 'mono' },
  { key: 'bytes_client', label: 'Bytes c→s', cls: 'r' },
  { key: 'bytes_server', label: 'Bytes s→c', cls: 'r' },
  { key: 'sensor', label: 'Sensor', cls: 'mono' },
  { key: 'iface', label: 'Interface', cls: 'mono' },
  { key: 'vlan', label: 'VLAN', cls: 'r' },
  { key: 'segment', label: 'Segment', cls: 'mono' },
];
let hiddenColumns = new Set();

function renderResults() {
  if (!queryState) { location.hash = '#/search'; return; }
  begin('session_index');
  setRail('search');
  setCrumb([
    { label: 'Capture search', href: '#/search' },
    { label: 'Result set' },
  ]);
  const r = queryState.result;
  const cols = INDEX_COLUMNS.filter((c) => !hiddenColumns.has(c.key));

  surface.innerHTML = `
    <h1 class="page-title">Session index</h1>
    <p class="page-sub">Result set of the submitted display filter · ran ${esc(r.ran_at)} in ${r.elapsed_ms} ms</p>

    <div class="filterbar">
      <input class="expr valid" value="${esc(r.expression)}" readonly>
      <a class="btn" href="#/search" id="btn-refine">Refine query</a>
    </div>
    <div class="scoperow">
      <span class="lbl">Capture window</span>
      <span class="active-scope" id="result-window">${esc(r.window_label)}</span>
      <span class="dim">${r.segments_searched} segment${r.segments_searched === 1 ? '' : 's'} searched</span>
    </div>
    <div class="countstrip" id="result-count" data-matched="${r.matched}">
      Showing 1 - ${r.rows.length} of <b>${r.matched}</b> session${r.matched === 1 ? '' : 's'} matched
      ${r.window === 'latest_segment'
        ? '<span class="warn"> · the capture window is the most recently rotated segment; widen it to search the whole stored set</span>'
        : ' · whole stored capture set'}
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin:10px 0">
      <button class="btn small" id="btn-columns" type="button">Columns</button>
      <button class="btn small" id="btn-rows-density" type="button" aria-pressed="${document.body.classList.contains('compact')}">Compact rows</button>
      <span class="dim" style="font-size:12px">Rows are ordered by first seen, newest first.</span>
    </div>

    <div class="card">
      <div class="card-body" style="padding:0">
        <table class="dense" id="session-table">
          <thead><tr><th style="width:22px"></th>${cols.map((c) => `<th>${esc(c.label)}<span class="caret">▾</span></th>`).join('')}</tr></thead>
          <tbody>${r.rows.map((row) => `
            <tr class="row-link" data-session="${esc(row.session_id)}">
              <td class="dim">+</td>
              ${cols.map((c) => {
                const v = row[c.key];
                const text = (c.cls.includes('r') && typeof v === 'number') ? grouped(v) : v;
                if (c.key === 'session_id') {
                  return `<td class="mono"><a href="#/session/${encodeURIComponent(row.session_id)}" data-open-session="${esc(row.session_id)}">${esc(text)}</a></td>`;
                }
                return `<td class="${esc(c.cls)}">${esc(text)}</td>`;
              }).join('')}
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card collapsed" id="card-export">
      <div class="card-head"><span>Export queue</span><button class="chev" type="button">expand</button></div>
      <div class="card-body">
        <table class="dense">
          <thead><tr><th>Job</th><th>Requested</th><th>Progress</th></tr></thead>
          <tbody>
            <tr><td class="mono">pcap-export-4471</td><td class="mono dim">2026-08-14 09:12:03</td>
              <td style="width:180px"><div class="bar"><i style="width:64%"></i></div></td></tr>
            <tr><td class="mono">pcap-export-4468</td><td class="mono dim">2026-08-14 08:40:55</td>
              <td style="width:180px"><div class="bar"><i style="width:100%"></i></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  surface.querySelectorAll('tr.row-link').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'A') return;
      location.hash = `#/session/${encodeURIComponent(tr.dataset.session)}`;
    });
  });
  document.getElementById('btn-rows-density').addEventListener('click', toggleDensity);
  document.getElementById('btn-columns').addEventListener('click', openColumnChooser);
  wireCollapsibles();
  setStatus([
    `Sessions matched: ${r.matched}`,
    `Displayed: ${r.rows.length}`,
    `Window: ${r.window === 'latest_segment' ? 'latest segment' : 'whole capture set'}`,
    'Profile: Default',
  ]);
  done();
}

function openColumnChooser() {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">
    <div class="card-head">Columns</div>
    <div class="m-body">
      ${INDEX_COLUMNS.map((c) => `<label style="display:block;padding:2px 0">
        <input type="checkbox" data-col="${esc(c.key)}"${hiddenColumns.has(c.key) ? '' : ' checked'}> ${esc(c.label)}
      </label>`).join('')}
      <div style="margin-top:10px;text-align:right"><button class="btn small" id="cols-close">Close</button></div>
    </div></div>`;
  document.body.appendChild(back);
  back.querySelectorAll('input[data-col]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenColumns.delete(cb.dataset.col); else hiddenColumns.add(cb.dataset.col);
    });
  });
  back.querySelector('#cols-close').addEventListener('click', () => { back.remove(); renderResults(); });
}

/* ================================================================== *
 * Frame ledger — frame fields, never payload bytes
 * ================================================================== */

const LEDGER_COLUMNS = [
  { key: 'arrival', label: 'No.', cls: 'r', num: true },
  { key: 'message_id', label: 'Message id', cls: 'mono' },
  { key: 'tick', label: 'Tick', cls: 'mono', num: true },
  { key: 'fragment_index', label: 'Fragment index', cls: 'mono', num: true },
  { key: 'fragment_count', label: 'Fragment count', cls: 'mono', num: true },
  { key: 'wire_length', label: 'Length', cls: 'r', num: true },
  { key: 'checksum', label: 'Checksum', cls: '' },
  { key: 'direction', label: 'Direction', cls: '' },
  { key: 'sensor', label: 'Sensor', cls: 'mono' },
];

async function renderLedger(sessionId) {
  begin('frame_ledger');
  setRail('search');
  const d = await api(`/api/session/${encodeURIComponent(sessionId)}/ledger`);
  setCrumb([
    { label: 'Capture search', href: '#/search' },
    { label: 'Result set', href: '#/results' },
    { label: `Session ${d.session_id}` },
  ]);

  const rows = d.frames.slice().sort((a, b) => {
    const c = ledgerSort.col;
    const av = a[c], bv = b[c];
    if (av === bv) return a.arrival - b.arrival;
    return (av < bv ? -1 : 1) * ledgerSort.dir;
  });
  surface.dataset.frameSort = ledgerSort.col === 'arrival' && ledgerSort.dir === 1
    ? 'arrival' : 'other_column';

  surface.innerHTML = `
    <h1 class="page-title">Session <span class="mono">${esc(d.session_id)}</span></h1>
    <p class="page-sub">Frame ledger · every frame this session carries, in stored arrival order</p>

    <div class="card">
      <div class="card-head"><span>Session</span><button class="chev" type="button">collapse</button></div>
      <div class="card-body">
        <dl class="fv">
          <dt>Session id</dt><dd class="mono" id="hdr-session-id">${esc(d.session_id)}</dd>
          <dt>Protocol</dt><dd class="mono" id="hdr-protocol">${esc(d.protocol)}</dd>
          <dt>Sensor / interface</dt><dd class="mono">${esc(d.sensor)} · ${esc(d.iface)}</dd>
          <dt>VLAN</dt><dd class="num">${d.vlan}</dd>
          <dt>First seen</dt><dd class="mono">${esc(d.first_seen)}</dd>
        </dl>
      </div>
    </div>

    <div style="display:flex;gap:8px;align-items:center;margin:10px 0">
      <a class="btn small" href="#/results" id="btn-back-index">← Result set</a>
      <button class="btn small" id="btn-ledger-density" type="button">Compact rows</button>
      <span class="dim" style="font-size:12px" id="ledger-order-note">
        Ordered by ${esc(ledgerSort.col === 'arrival' ? 'stored arrival order' : LEDGER_COLUMNS.find((c) => c.key === ledgerSort.col).label.toLowerCase())}${ledgerSort.col !== 'arrival' ? (ledgerSort.dir === 1 ? ' ascending' : ' descending') : ''}.
        Selecting a row binds the byte inspector to that frame.
      </span>
    </div>

    <div class="card">
      <div class="card-body" style="padding:0">
        <table class="dense" id="frame-table">
          <thead><tr>${LEDGER_COLUMNS.map((c) => `
            <th class="sortable${ledgerSort.col === c.key ? ' sorted' : ''}" data-col="${esc(c.key)}">
              ${esc(c.label)}<span class="caret">${ledgerSort.col === c.key ? (ledgerSort.dir === 1 ? '▲' : '▼') : '▾'}</span>
            </th>`).join('')}</tr></thead>
          <tbody>${rows.map((f) => `
            <tr class="row-link${f.checksum === 'unverified' ? ' row-tint-amber' : ''}" data-arrival="${f.arrival}">
              ${LEDGER_COLUMNS.map((c) => {
                const v = c.key === 'arrival' ? f.arrival + 1 : f[c.key];
                return `<td class="${esc(c.cls)}" data-field="${esc(c.key)}">${esc(v)}</td>`;
              }).join('')}
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <p class="dim" style="font-size:12px">
      The ledger carries frame headers only. Payload bytes live in the byte inspector, which binds to one frame at a time.
    </p>`;

  surface.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (ledgerSort.col === col) ledgerSort.dir = -ledgerSort.dir;
      else ledgerSort = { col, dir: 1 };
      renderLedger(sessionId);
    });
  });
  surface.querySelectorAll('tr.row-link').forEach((tr) => {
    tr.addEventListener('click', () => {
      location.hash = `#/session/${encodeURIComponent(sessionId)}/frame/${tr.dataset.arrival}`;
    });
  });
  document.getElementById('btn-ledger-density').addEventListener('click', toggleDensity);
  wireCollapsibles();
  setStatus([`Session: ${d.session_id}`, `Frames: ${d.frames.length}`, 'Byte inspector: unbound', 'Profile: Default']);
  done();
}

/* ================================================================== *
 * Byte inspector — exactly one frame's bytes
 * ================================================================== */

async function renderBytes(sessionId, arrival) {
  begin('frame_bytes');
  setRail('search');
  const d = await api(`/api/session/${encodeURIComponent(sessionId)}/frame/${arrival}/bytes`);
  setCrumb([
    { label: 'Capture search', href: '#/search' },
    { label: 'Result set', href: '#/results' },
    { label: `Session ${d.session_id}`, href: `#/session/${encodeURIComponent(sessionId)}` },
    { label: `Frame ${d.arrival + 1}` },
  ]);

  const ascii = (b) => {
    const n = parseInt(b, 16);
    return n >= 32 && n <= 126 ? String.fromCharCode(n) : '.';
  };
  const groupHex = (bs) => {
    const left = bs.slice(0, 8).join(' ');
    const right = bs.slice(8, 16).join(' ');
    return right ? `${left}  ${right}` : left;
  };
  const groupAscii = (bs) => {
    const left = bs.slice(0, 8).map(ascii).join('');
    const right = bs.slice(8, 16).map(ascii).join('');
    return right ? `${left} ${right}` : left;
  };

  surface.innerHTML = `
    <h1 class="page-title">Frame byte inspector</h1>
    <p class="page-sub">Bound to frame ${d.arrival + 1} of session <span class="mono">${esc(d.session_id)}</span> · one frame, never a concatenation</p>

    <div style="display:flex;gap:8px;margin-bottom:10px">
      <a class="btn small" id="btn-close-bytes" href="#/session/${encodeURIComponent(sessionId)}">← Release inspector, back to frame ledger</a>
    </div>

    <div class="card">
      <div class="card-head"><span>Bound frame</span></div>
      <div class="card-body">
        <dl class="fv">
          <dt>Session id</dt><dd class="mono">${esc(d.session_id)}</dd>
          <dt>Frame</dt><dd class="num">${d.arrival + 1}</dd>
          <dt>Message id</dt><dd class="mono">${esc(d.message_id)}</dd>
          <dt>Tick</dt><dd class="mono">${d.tick}</dd>
          <dt>Fragment</dt><dd class="mono">${d.fragment_index} of ${d.fragment_count}</dd>
          <dt>Payload length</dt><dd class="num" id="byte-count">${d.byte_count} bytes</dd>
        </dl>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span>Payload bytes</span><span class="dim" style="font-size:12px">offset · hex · ascii</span></div>
      <div class="card-body">
        <div class="bytepane" id="byte-pane">${d.rows.map((row) => `
          <div class="brow">
            <span class="boff">${esc(row.offset)}</span>
            <span class="bhex" data-offset="${esc(row.offset)}">${esc(groupHex(row.bytes))}</span>
            <span class="basc">${esc(groupAscii(row.bytes))}</span>
          </div>`).join('')}</div>
      </div>
    </div>`;

  setStatus([
    `Session: ${d.session_id}`,
    `Byte inspector bound to frame ${d.arrival + 1}`,
    `${d.byte_count} bytes`,
    'Profile: Default',
  ]);
  done();
}

/* ================================================================== *
 * Replay profile library
 * ================================================================== */

async function renderProfiles() {
  begin('profile_library');
  setRail('profiles');
  setCrumb([{ label: 'Replay profiles' }]);
  const params = new URLSearchParams({ order: profileView.order });
  if (profileView.order === 'name_search') params.set('q', profileView.q);
  const d = await api(`/api/profiles?${params.toString()}`);
  surface.dataset.profileOrder = d.order;

  surface.innerHTML = `
    <h1 class="page-title">Replay profiles</h1>
    <p class="page-sub">Saved reassembly and replay configurations. A profile's parameters live only on its own record.</p>

    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <span class="segmented">
        <button class="btn small" id="btn-order-modified" aria-pressed="${d.order === 'last_modified'}" type="button">Recently modified</button>
        <button class="btn small" id="btn-order-status" aria-pressed="${d.order === 'status'}" type="button">Group by status</button>
      </span>
      <form id="profile-search-form" style="display:flex;gap:6px">
        <input class="btn small" style="width:220px;text-align:left;font-family:var(--mono)" id="profile-search"
               placeholder="Search profiles by name" autocomplete="off" value="${esc(profileView.order === 'name_search' ? profileView.q : '')}">
        <button class="btn small" id="btn-search-profiles" type="submit">Search names</button>
      </form>
    </div>

    <div class="countstrip" id="profile-note">${esc(d.note)}</div>

    <div class="card" style="border-top:none">
      <div class="card-body" style="padding:0">
        <table class="dense" id="profile-table">
          <thead><tr><th>Profile</th><th>Owning team</th><th>Created</th><th>Last modified</th><th>Status</th></tr></thead>
          <tbody>${d.rows.map((p) => `
            <tr class="row-link" data-slug="${esc(p.slug)}">
              <td><a href="#/profile/${esc(p.slug)}" data-open-profile="${esc(p.slug)}">${esc(p.name)}</a></td>
              <td>${esc(p.team)}</td>
              <td class="mono dim">${esc(p.created)}</td>
              <td class="mono dim">${esc(p.modified)}</td>
              <td>${p.status === 'in_force' ? 'in force' : 'superseded'}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <p class="dim" style="font-size:12px">
      The library lists provenance only. Mode, grouping key, dispatch order and the fragment-drop switch
      are published on a profile's parameter record, and only for the profile in force.
    </p>`;

  surface.querySelectorAll('tr.row-link').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.tagName === 'A') return;
      location.hash = `#/profile/${tr.dataset.slug}`;
    });
  });
  document.getElementById('btn-order-modified').addEventListener('click', () => {
    profileView = { order: 'last_modified', q: '' }; renderProfiles();
  });
  document.getElementById('btn-order-status').addEventListener('click', () => {
    profileView = { order: 'status', q: '' }; renderProfiles();
  });
  document.getElementById('profile-search-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    profileView = { order: 'name_search', q: document.getElementById('profile-search').value };
    renderProfiles();
  });

  setStatus([`Profiles: ${d.total}`, `Listed: ${d.rows.length}`, `Order: ${d.order}`, 'Profile: Default']);
  done();
}

async function renderProfile(slug) {
  begin('profile_detail');
  setRail('profiles');
  const d = await api(`/api/profile/${encodeURIComponent(slug)}`);
  setCrumb([
    { label: 'Replay profiles', href: '#/profiles' },
    { label: d.name },
  ]);

  const provenance = `
    <div class="card">
      <div class="card-head"><span>Record</span></div>
      <div class="card-body">
        <dl class="fv">
          <dt>Profile</dt><dd>${esc(d.name)}</dd>
          <dt>Owning team</dt><dd>${esc(d.team)}</dd>
          <dt>Status</dt><dd>${d.status === 'in_force' ? 'in force' : 'superseded'}</dd>
          <dt>Author</dt><dd class="mono">${esc(d.author)}</dd>
          <dt>Created</dt><dd class="mono">${esc(d.created)}</dd>
          <dt>Last modified</dt><dd class="mono">${esc(d.modified)}</dd>
          ${d.superseded_on ? `<dt>Superseded</dt><dd class="mono">${esc(d.superseded_on)}</dd>` : ''}
          ${d.approvals ? `<dt>Approval trail</dt><dd>${esc(d.approvals.join(' · '))}</dd>` : ''}
          <dt>Change note</dt><dd class="plain">${esc(d.change_note)}</dd>
        </dl>
      </div>
    </div>`;

  const parameters = d.parameters ? `
    <div class="card" id="parameter-record">
      <div class="card-head"><span>Parameters</span><span class="dim" style="font-size:12px">read-only · in force</span></div>
      <div class="card-body">
        <dl class="fv">
          <dt>Replay mode</dt><dd class="mono" id="param-mode">${esc(d.parameters.mode)}</dd>
          <dt>Grouping key field</dt><dd class="mono" id="param-key">${esc(d.parameters.key)}</dd>
          <dt>Strict fragment drop</dt>
            <dd class="mono" id="param-strict-fragment-drop">${esc(String(d.parameters.strict_fragment_drop))}</dd>
        </dl>
        <h3 style="font-size:13px;margin:14px 0 6px">Protocol dispatch sequence</h3>
        <table class="dense" id="dispatch-table" style="max-width:420px">
          <thead><tr><th style="width:90px">Position</th><th>Protocol class</th></tr></thead>
          <tbody>${d.parameters.dispatch.map((p) => `
            <tr data-position="${p.position}">
              <td class="r" data-field="position">${p.position}</td>
              <td class="mono" data-field="protocol">${esc(p.protocol)}</td>
            </tr>`).join('')}</tbody>
        </table>
        <p class="dim" style="font-size:12px;margin-top:8px">
          The scheduler drains protocol classes in the position order shown. This record is the console's
          only home for these four parameters.
        </p>
      </div>
    </div>` : `
    <div class="card" id="parameter-record">
      <div class="card-head"><span>Parameters</span></div>
      <div class="card-body">
        <div class="withheld" id="withheld-notice">${esc(d.withheld)}</div>
      </div>
    </div>`;

  surface.innerHTML = `
    <h1 class="page-title">${esc(d.name)}</h1>
    <p class="page-sub">Replay profile — parameter record</p>
    <div style="margin-bottom:10px"><a class="btn small" href="#/profiles" id="btn-back-profiles">← Profile library</a></div>
    ${parameters}
    ${provenance}`;

  setStatus([`Profile: ${d.name}`, `Status: ${d.status === 'in_force' ? 'in force' : 'superseded'}`,
    d.parameters ? 'Parameters published' : 'Parameters withheld']);
  done();
}

/* ================================================================== *
 * Replay format reference — sequential, no jump index
 * ================================================================== */

const REFERENCE_STATE = {
  front: 'spec_front', input: 'spec_input', output: 'spec_output',
  rejection: 'spec_rejection', baseline: 'spec_baseline',
};

async function renderReference(page) {
  begin(REFERENCE_STATE[page] || 'spec_front');
  setRail('reference');
  const d = await api(`/api/reference/${encodeURIComponent(page)}`);
  setCrumb([
    { label: 'Replay format reference', href: '#/reference/front' },
    { label: d.title },
  ]);

  let body = '';

  if (d.page === 'front') {
    body = `
      <p>${esc(d.adoption)}</p>
      <h3>Schema revision</h3>
      <dl class="fv" style="grid-template-columns:170px 1fr">
        <dt>Revision</dt><dd class="mono" id="ref-schema-version">${esc(d.schema_version)}</dd>
        <dt>Encoding</dt><dd class="mono" id="ref-encoding">${esc(d.encoding)}</dd>
      </dl>
      <h3>Pages that follow</h3>
      <ol class="seq" id="ref-contents" start="2">
        ${d.following_pages.map((p) => `<li>${esc(p.title)}</li>`).join('')}
      </ol>
      <p class="notice">Each page must be passed through to reach the next; the reference publishes no jump index.</p>
      <h3>Editorial change log</h3>
      <table class="defs"><thead><tr><th>Revised</th><th>Editor</th><th>Note</th></tr></thead>
        <tbody>${d.changelog.map((c) => `<tr><td class="mono">${esc(c.revised)}</td><td class="mono">${esc(c.editor)}</td><td>${esc(c.note)}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  if (d.page === 'input') {
    body = `
      <p>The replay engine accepts one capture argument. Its top level is closed:
         a member outside the contract is not tolerated.</p>
      <h3>Top level</h3>
      <dl class="fv" style="grid-template-columns:200px 1fr">
        <dt>Required members</dt><dd class="mono" id="ref-toplevel-required">${d.top_level_required.map(esc).join(', ')}</dd>
        <dt>Unknown members</dt><dd id="ref-toplevel-closed">${d.top_level_closed ? 'rejected — the container is closed' : 'tolerated'}</dd>
      </dl>
      <h3>Per-session fields</h3>
      <table class="defs" id="ref-record-fields">
        <thead><tr><th style="width:190px">Field</th><th>Type and bound</th></tr></thead>
        <tbody>${d.record_fields.map((f) => {
          const i = f.indexOf(':');
          return `<tr><td class="mono" data-field="name">${esc(f.slice(0, i))}</td><td class="mono" data-field="spec">${esc(f.slice(i + 1))}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <h3>Per-frame fields</h3>
      <table class="defs" id="ref-frame-fields">
        <thead><tr><th style="width:190px">Field</th><th>Type and bound</th></tr></thead>
        <tbody>${d.frame_fields.map((f) => {
          const i = f.indexOf(':');
          return `<tr><td class="mono" data-field="name">${esc(f.slice(0, i))}</td><td class="mono" data-field="spec">${esc(f.slice(i + 1))}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  if (d.page === 'output') {
    const keyList = (id, arr) => `<ol class="seq mono" id="${id}">${arr.map((k) => `<li>${esc(k)}</li>`).join('')}</ol>`;
    body = `
      <p>The result is a single object whose members appear in a fixed order, as do the members of every
         object nested inside it. Every array the result carries is ordered by a stated rule.</p>

      <h3>Result object — key order</h3>
      ${keyList('ref-result-key-order', d.result_key_order)}

      <h3>Session result object — key order</h3>
      ${keyList('ref-session-key-order', d.session_key_order)}
      <p><b>Ordering of <span class="mono">sessions</span>:</b>
         <span class="mono" id="ref-sessions-ordering">${esc(d.sessions_ordering)}</span></p>

      <h3>Assembled message object — key order</h3>
      ${keyList('ref-delivered-key-order', d.delivered_key_order)}
      <p><b>Ordering of <span class="mono">delivered_messages</span>:</b>
         <span class="mono" id="ref-delivered-ordering">${esc(d.delivered_ordering)}</span></p>

      <h3>Dropped message object — key order</h3>
      ${keyList('ref-dropped-key-order', d.dropped_key_order)}
      <p><b>Ordering of <span class="mono">dropped_messages</span>:</b>
         <span class="mono" id="ref-dropped-ordering">${esc(d.dropped_ordering)}</span></p>
      <p><b>Ordering of <span class="mono">missing_fragments</span>:</b>
         <span class="mono" id="ref-missing-ordering">${esc(d.missing_fragments_ordering)}</span></p>

      <h3>Global replay sequence</h3>
      <dl class="fv" style="grid-template-columns:170px 1fr">
        <dt>Element type</dt><dd class="mono" id="ref-replay-item-type">${esc(d.replay_order_item_type)}</dd>
        <dt>Element format, membership and sort keys</dt>
          <dd class="mono" id="ref-replay-ordering">${esc(d.replay_order_ordering)}</dd>
      </dl>

      <h3>Per-protocol regression matrix</h3>
      <p><b>Property order:</b> <span class="mono" id="ref-matrix-key-order">${d.matrix_key_order.map(esc).join(', ')}</span></p>
      <table class="defs" id="ref-matrix-classes">
        <thead><tr><th style="width:190px">Protocol class</th><th>Counter key order</th></tr></thead>
        <tbody>${d.matrix_classes.map((c) => `
          <tr><td class="mono" data-field="class">${esc(c.name)}</td>
              <td class="mono" data-field="counters">${c.counter_key_order.map(esc).join(', ')}</td></tr>`).join('')}</tbody>
      </table>

      <h3>Assembly, drop and scheduling rules</h3>
      <ul id="ref-rules" style="font-size:14px;line-height:1.6">
        ${d.rules.map((r) => `<li class="ref-rule">${esc(r)}</li>`).join('')}
      </ul>
      <p id="ref-scheduling-summary">${esc(d.scheduling_summary)}</p>

      <div class="pointer" id="ref-policy-pointer">${esc(d.policy_pointer)}</div>`;
  }

  if (d.page === 'rejection') {
    body = `
      <h3>Refusal</h3>
      <p>A call that does not conform must raise
         <span class="mono" id="ref-exception">${esc(d.exception)}</span> rather than produce a result.
         The conditions that require it:</p>
      <ul id="ref-conditions" style="font-size:14px;line-height:1.6">
        ${d.conditions.map((c) => `<li class="ref-condition">${esc(c)}</li>`).join('')}
      </ul>

      <h3>Argument handling</h3>
      <p id="ref-immutability">${esc(d.argument_handling)}</p>

      <h3>Run envelope</h3>
      <dl class="fv" style="grid-template-columns:230px 1fr">
        <dt>Network posture</dt><dd id="ref-offline">${d.execution.offline ? 'offline — no network access' : 'network permitted'}</dd>
        <dt>Interpreter floor</dt><dd class="mono" id="ref-python">${esc(d.execution.python)}</dd>
        <dt>Per-run time limit</dt>
          <dd class="mono num" id="ref-impl-timeout">${d.execution.implementation_timeout_seconds} s</dd>
        <dt>Delivered test time limit</dt>
          <dd class="mono num" id="ref-test-timeout">${d.execution.submitter_test_timeout_seconds} s</dd>
      </dl>

      <h3>Required artifacts</h3>
      <table class="defs" id="ref-artifacts">
        <thead><tr><th style="width:290px">Path</th><th>Required</th><th>Interface / format</th></tr></thead>
        <tbody>${d.artifacts.map((a) => `
          <tr>
            <td class="mono" data-field="path">${esc(a.path)}</td>
            <td data-field="required">${a.required ? 'yes' : 'no'}</td>
            <td class="mono" data-field="detail">${esc(a.interface || a.format || a.execution || (a.sections ? a.sections.join(' · ') : ''))}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  }

  if (d.page === 'baseline') {
    body = `
      <p>Every other clause of this reference states a rule. This one states a value: the result a
         conforming run produces for a capture that holds no sessions at all.</p>
      <pre class="jsonblock" id="ref-baseline">${esc(JSON.stringify(d.baseline_result, null, 2))}</pre>
      <p class="notice">This is the reference's only page that fixes a result by value.</p>`;
  }

  surface.innerHTML = `
    <div class="doc">
      <h2>Replay format reference — ${esc(d.title)}</h2>
      <div class="pageno">Page ${d.number} of ${d.total}</div>
      ${body}
      <div class="pager">
        <span>${d.prev
          ? `<a href="#/reference/${esc(d.prev)}" id="ref-prev">← ${esc(d.prev_title)}</a>`
          : '<span class="dim">— start of document —</span>'}</span>
        <span>${d.next
          ? `<a href="#/reference/${esc(d.next)}" id="ref-next">${esc(d.next_title)} →</a>`
          : '<span class="dim">— end of document —</span>'}</span>
      </div>
      <p class="notice" style="margin-top:14px">
        <button class="btn small" id="btn-print-view" type="button">Print view</button>
        <a href="#/" style="margin-left:8px" id="btn-close-reference">Close reference</a>
      </p>
    </div>`;

  const printBtn = document.getElementById('btn-print-view');
  if (printBtn) printBtn.addEventListener('click', () => {
    document.querySelector('.doc').classList.toggle('printview');
  });

  setStatus([`Reference page ${d.number} of ${d.total}`, esc(d.title), 'Sequential document — no jump index']);
  done();
}

/* ================================================================== *
 * Replay regression suite
 * ================================================================== */

async function renderRegression() {
  begin('regression_suite');
  setRail('regression');
  setCrumb([{ label: 'Replay regression suite' }]);
  const d = await api('/api/regression');

  surface.innerHTML = `
    <h1 class="page-title">Replay regression suite</h1>
    <p class="page-sub">The suite a replay delivery is held to before it is accepted.</p>

    <div class="card">
      <div class="card-head"><span>Suite</span><span class="dim" style="font-size:12px">${esc(d.ci_badge)} · ${esc(d.last_run_result)}</span></div>
      <div class="card-body">
        <dl class="fv">
          <dt>Cases held</dt><dd class="num" id="suite-case-count">${d.case_count}</dd>
          <dt>Suite schema</dt><dd class="mono" id="suite-schema-version">${esc(d.schema_version)}</dd>
          <dt>Last run</dt><dd class="mono">${esc(d.last_run)}</dd>
          <dt>Owning team</dt><dd class="plain">${esc(d.owner.team)} · ${esc(d.owner.contact)}</dd>
          <dt>Pipeline</dt><dd class="mono">${esc(d.owner.pipeline)}</dd>
        </dl>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span>Cases</span></div>
      <div class="card-body">
        <p class="dim" style="font-size:12px;margin-top:0">
          Cases are filed by kind. Choose a kind to read it; opening one puts the other away.
        </p>
        <span class="segmented">
          ${d.kinds.map((k) => `<a class="btn" href="#/regression/${esc(k.id)}" id="btn-kind-${esc(k.id)}">${esc(k.label)}</a>`).join('')}
        </span>
      </div>
    </div>`;

  setStatus([`Cases: ${d.case_count}`, `Last run: ${d.last_run}`, `CI: ${d.ci_badge}`]);
  done();
}

async function renderRegressionKind(kind) {
  begin(kind === 'rejections' ? 'regression_rejections' : 'regression_invariants');
  setRail('regression');
  const label = kind === 'rejections' ? 'Refusal cases' : 'Invariant cases';
  setCrumb([{ label: 'Replay regression suite', href: '#/regression' }, { label }]);
  const d = await api(`/api/regression/${encodeURIComponent(kind)}`);

  const table = kind === 'rejections' ? `
    <table class="dense" id="case-table">
      <thead><tr><th style="width:200px">Case id</th><th>Capture or policy under test</th><th>Expected outcome</th></tr></thead>
      <tbody>${d.cases.map((c) => `
        <tr data-case="${esc(c.id)}" class="row-tint-amber">
          <td class="mono" data-field="id">${esc(c.id)}</td>
          <td data-field="fixture">${esc(c.fixture)}</td>
          <td class="mono" data-field="expected_error">${esc(c.expected_error)}</td>
        </tr>`).join('')}</tbody>
    </table>` : `
    <table class="dense" id="case-table">
      <thead><tr><th style="width:200px">Case id</th><th>Capture or policy under test</th><th>Asserted property</th></tr></thead>
      <tbody>${d.cases.map((c) => `
        <tr data-case="${esc(c.id)}">
          <td class="mono" data-field="id">${esc(c.id)}</td>
          <td data-field="fixture">${esc(c.fixture)}</td>
          <td data-field="assertion">${c.assertion !== null
            ? esc(c.assertion)
            : `<span class="dim">checked against ${esc(c.reference)}</span>`}</td>
        </tr>`).join('')}</tbody>
    </table>`;

  surface.innerHTML = `
    <h1 class="page-title">${esc(label)}</h1>
    <p class="page-sub">${kind === 'rejections'
      ? 'Cases in which a conforming engine must decline to produce a result.'
      : 'Cases in which the engine must accept the capture and hold a property of the accepted run.'}</p>

    <div style="margin-bottom:10px">
      <a class="btn small" href="#/regression" id="btn-back-suite">← Suite</a>
      <span class="dim" style="font-size:12px;margin-left:8px">
        Return to the suite to open the other kind. The suite records what each case asserts, never a verdict.
      </span>
    </div>

    <div class="card"><div class="card-body" style="padding:0">${table}</div></div>`;

  setStatus([`${label}: ${d.cases.length}`, 'No verdicts recorded on this surface']);
  done();
}

/* ================================================================== *
 * Shared chrome
 * ================================================================== */

function wireCollapsibles() {
  surface.querySelectorAll('.card > .card-head .chev').forEach((btn) => {
    const card = btn.closest('.card');
    btn.textContent = card.classList.contains('collapsed') ? 'expand' : 'collapse';
    btn.addEventListener('click', () => {
      card.classList.toggle('collapsed');
      btn.textContent = card.classList.contains('collapsed') ? 'expand' : 'collapse';
    });
  });
}

function toggleDensity() {
  document.body.classList.toggle('compact');
  const on = document.body.classList.contains('compact');
  document.querySelectorAll('#btn-density, #btn-rows-density').forEach((b) => {
    if (b) b.setAttribute('aria-pressed', String(on));
  });
}

document.getElementById('btn-density').addEventListener('click', toggleDensity);
document.getElementById('btn-shortcuts').addEventListener('click', () => {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">
    <div class="card-head">Keyboard shortcuts</div>
    <div class="m-body">
      <dl class="fv" style="grid-template-columns:80px 1fr">
        <dt class="mono">/</dt><dd class="plain">Focus the display filter</dd>
        <dt class="mono">g s</dt><dd class="plain">Capture search</dd>
        <dt class="mono">g p</dt><dd class="plain">Replay profiles</dd>
        <dt class="mono">j / k</dt><dd class="plain">Next / previous row</dd>
        <dt class="mono">esc</dt><dd class="plain">Release the byte inspector</dd>
      </dl>
      <div style="margin-top:10px;text-align:right"><button class="btn small" id="sc-close">Close</button></div>
    </div></div>`;
  document.body.appendChild(back);
  back.querySelector('#sc-close').addEventListener('click', () => back.remove());
});
document.getElementById('btn-bundle').addEventListener('click', () => {
  const b = document.getElementById('btn-bundle');
  b.textContent = 'Support bundle queued';
  setTimeout(() => { b.textContent = 'Support bundle'; }, 1500);
});

/* ================================================================== *
 * Router
 * ================================================================== */

async function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const seg = hash.split('/').filter(Boolean).map(decodeURIComponent);
  try {
    if (seg.length === 0) return await renderHome();
    if (seg[0] === 'search') return await renderSearch();
    if (seg[0] === 'results') return renderResults();
    if (seg[0] === 'session' && seg[2] === 'frame') return await renderBytes(seg[1], seg[3]);
    if (seg[0] === 'session') return await renderLedger(seg[1]);
    if (seg[0] === 'profiles') return await renderProfiles();
    if (seg[0] === 'profile') return await renderProfile(seg[1]);
    if (seg[0] === 'reference') return await renderReference(seg[1] || 'front');
    if (seg[0] === 'regression' && seg[1]) return await renderRegressionKind(seg[1]);
    if (seg[0] === 'regression') return await renderRegression();
    return await renderHome();
  } catch (err) {
    surface.dataset.surface = 'error';
    surface.innerHTML = `<div class="card"><div class="card-body"><p class="err">${esc(err.message)}</p></div></div>`;
    done();
  }
}

window.addEventListener('hashchange', route);
route();

/* The rail's alert badge is console chrome; it is filled once at boot so it
 * reads the same on every surface. */
fetch('/api/home').then((r) => r.json()).then((d) => {
  document.getElementById('ids-badge').textContent = d.ids_unread;
}).catch(() => {});

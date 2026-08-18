'use strict';
/*
 * Helios Grid Console — client.
 *
 * Hash-routed, no build step. Every value that came out of the staged audit
 * input is fetched from the server at view time; the client transcribes none of
 * it. Each surface fetches ONLY the payload that surface is allowed to show:
 * the asset page never fetches layer data, the policy page never fetches the
 * authority order, the standard's front matter never fetches clause text.
 */

/* ------------------------------------------------------------------ *
 * tiny helpers
 * ------------------------------------------------------------------ */

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const get = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
});

const ICON = {
  overview: 'M3 12h4l2-6 3 12 2-8 2 2h5',
  registry: 'M4 6h16M4 12h16M4 18h10',
  policy: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  standard: 'M6 3h9l4 4v14H6z M15 3v4h4',
  audit: 'M4 19h16M7 15V9m5 6V5m5 10v-4',
  alarms: 'M12 3a5 5 0 00-5 5v4l-2 3h14l-2-3V8a5 5 0 00-5-5z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  sort: 'M4 7h12M4 12h8M4 17h4',
  display: 'M4 6h16v12H4z M4 10h16',
  refresh: 'M4 12a8 8 0 1114 5M4 12V7m0 5h5',
  download: 'M12 4v10m0 0l-4-4m4 4l4-4M5 19h14',
  doc: 'M7 4h7l4 4v12H7z',
};

function ico(name) {
  return `<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><path d="${ICON[name] || ''}"/></svg>`;
}

function diamond(identityIndex) {
  return `<span class="diamond lyr-${(identityIndex || 0) % 6}"></span>`;
}

/* ------------------------------------------------------------------ *
 * client-held view state (server stays stateless)
 * ------------------------------------------------------------------ */

const state = {
  region: 'north',
  page: 1,
  regions: [],
  // Set once the standard's normative clause body has actually been opened.
  // The reference annex is published as an appendix to that body, so its
  // control stays disabled until then.
  clausesRead: false,
  conditionsRead: false,
  advisoryDismissed: false,
  releaseNoteDismissed: false,
};

/* ------------------------------------------------------------------ *
 * chrome: sidebar nav + scope switcher
 * ------------------------------------------------------------------ */

const NAV = [
  { id: 'overview', href: '#/overview', label: 'Overview', icon: 'overview' },
  { id: 'registry', href: '#/registry', label: 'Setpoint Registry', icon: 'registry' },
  { id: 'policy', href: '#/policy', label: 'Governance Policy', icon: 'policy' },
  { id: 'standard', href: '#/standard', label: 'Commissioning Standard', icon: 'standard' },
  { id: 'audit', href: '#/audit', label: 'Audit Readiness', icon: 'audit' },
];

function renderNav(activeId) {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <div class="nav-group">Operations</div>
    ${NAV.slice(0, 2).map((n) => navItem(n, activeId)).join('')}
    <a href="#/overview" data-testid="nav-alarms">${ico('alarms')}<span>Alarm inbox</span><span class="badge">7</span></a>
    <div class="nav-group">Governance</div>
    ${NAV.slice(2).map((n) => navItem(n, activeId)).join('')}
  `;
}

function navItem(n, activeId) {
  return `<a href="${n.href}" data-testid="nav-${n.id}"
    class="${n.id === activeId ? 'active' : ''}">${ico(n.icon)}<span>${n.label}</span></a>`;
}

function renderScope() {
  const v = document.getElementById('scope-value');
  const r = state.regions.find((x) => x.key === state.region);
  v.textContent = r ? r.label : '—';
}

document.getElementById('scope-trigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('scope-menu');
  const trigger = document.getElementById('scope-trigger');
  if (!menu.hidden) { closeScope(); return; }
  menu.className = 'scope-menu';
  menu.innerHTML = state.regions.map((r) => `
    <button data-testid="scope-option-${r.key}" data-region="${r.key}">
      <span>${esc(r.label)}</span><span class="code">${esc(r.code)}</span>
    </button>`).join('');
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  menu.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.region = b.dataset.region;
      state.page = 1;
      closeScope();
      renderScope();
      if (location.hash.startsWith('#/registry')) route();
      else location.hash = '#/registry';
    });
  });
});

function closeScope() {
  const menu = document.getElementById('scope-menu');
  menu.hidden = true;
  menu.innerHTML = '';
  document.getElementById('scope-trigger').setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', closeScope);

/* ------------------------------------------------------------------ *
 * shared page furniture
 * ------------------------------------------------------------------ */

function header({ crumb, title, ident, subline, actions }) {
  return `
    <div class="crumb" data-testid="breadcrumb">${crumb}</div>
    <div class="page-head">
      <div>
        <h1>${esc(title)}</h1>
        ${ident ? `<div class="page-ident" data-testid="page-ident">${esc(ident)}</div>` : ''}
        ${subline ? `<div class="subline" data-testid="subline">${subline}</div>` : ''}
      </div>
      <div class="head-actions">${actions || ''}</div>
    </div>`;
}

// Monotonic render counter. A surface publishes it only once it has finished
// drawing, so a caller can tell a fresh render from the one it replaced.
let renderSeq = 0;

function ready(view) {
  app.dataset.view = view;
  app.dataset.render = String(++renderSeq);
  app.dataset.ready = 'true';
}

/* ------------------------------------------------------------------ *
 * Overview — operational chrome only. No identifiers, no layers, no policy.
 * ------------------------------------------------------------------ */

async function viewOverview() {
  const d = await get('/api/overview');
  const delta = d.area_load_mw - d.forecast_load_mw;
  const pct = ((delta / d.forecast_load_mw) * 100).toFixed(1);
  const out = Math.abs(d.frequency_deviation_mhz) > d.frequency_band_mhz;

  app.innerHTML = `
    ${header({
      crumb: 'Control room <span class="sep">/</span> Dispatch',
      title: 'Dispatch Overview',
      subline: 'Live system view for the operating area. Updated continuously from SCADA.',
      actions: `<button class="tool">${ico('refresh')}Refresh</button>
                <button class="tool" id="kbd-help">Shortcuts</button>`,
    })}

    ${state.releaseNoteDismissed ? '' : `
    <div class="release-note">
      <b>What's new in Helios 4.2</b>
      <span>Override ledgers now record declaration state separately from stored value.</span>
      <button id="dismiss-note">Dismiss</button>
    </div>`}

    <div class="stat-row">
      <div class="stat">
        <div class="lab">System frequency deviation</div>
        <div class="big ${out ? 'out' : ''}">${d.frequency_deviation_mhz > 0 ? '+' : ''}${d.frequency_deviation_mhz}<span class="unit">mHz</span></div>
        <div class="sub">Band ±${d.frequency_band_mhz} mHz · rolling 60 s</div>
        ${sparkline()}
      </div>
      <div class="stat">
        <div class="lab">Area load vs day-ahead forecast</div>
        <div class="big">${d.area_load_mw.toLocaleString('en-US')}<span class="unit">MW</span></div>
        <div class="sub">Forecast ${d.forecast_load_mw.toLocaleString('en-US')} MW · ${delta > 0 ? '+' : ''}${pct} %</div>
      </div>
      <div class="stat">
        <div class="lab">Generation mix</div>
        <div class="mixbar">
          ${d.generation_mix.map((m, i) => `<i style="width:${m.share}%" class="lyr-${i % 6}"></i>`).join('')}
        </div>
        <div class="mixlegend">
          ${d.generation_mix.map((m, i) => `<span>${diamond(i)} ${esc(m.source)} ${m.share} %</span>`).join('')}
        </div>
      </div>
    </div>

    ${state.advisoryDismissed ? '' : `
    <div class="advisory">
      <span class="glyph">⚠</span>
      <span class="pill pill-pend">${esc(d.advisory.severity)}</span>
      <span>${esc(d.advisory.text)}</span>
      <a href="#/overview">${esc(d.advisory.desk)}</a>
      <button class="dismiss" id="dismiss-advisory">Dismiss</button>
    </div>`}

    <div class="alarmline"><span class="alarmdot"></span>
      <span><b>${d.alarms_unread}</b> unacknowledged alarms in the inbox — breaker trips and comms-loss events.</span>
    </div>

    <div class="counter-row">
      <div class="stat">
        <div class="lab">Assets under configuration management</div>
        <div class="big" data-testid="counter-assets">${d.assets_under_configuration_management}</div>
      </div>
      <div class="stat">
        <div class="lab">Conformance checks outstanding</div>
        <div class="big" data-testid="counter-checks">${d.conformance_checks_outstanding}</div>
      </div>
    </div>

    <h2 class="section">Field operations</h2>
    <div class="two-col" style="margin-top:20px">
      <div class="card" style="margin-top:0">
        <div class="card-title">Crew dispatch board</div>
        <table class="grid">
          <thead><tr><th>Crew</th><th>Shift</th><th>Truck</th><th class="num">ETA</th></tr></thead>
          <tbody>${d.crew_board.map((c) => `<tr class="ledger-row">
            <td>${esc(c.crew)}</td><td>${esc(c.shift)}</td>
            <td><code>${esc(c.truck)}</code></td><td class="num">${esc(c.eta)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card" style="margin-top:0">
        <div class="card-title">SLA compliance <span class="caption">rolling 12 months</span></div>
        <table class="grid">
          <thead><tr><th>Index</th><th class="num">Actual</th><th class="num">Target</th><th>Status</th></tr></thead>
          <tbody>${d.sla.map((s) => {
            const okIdx = parseFloat(s.value) <= parseFloat(s.target);
            return `<tr class="ledger-row"><td>${esc(s.index)}</td>
              <td class="num"><code>${esc(s.value)}</code></td>
              <td class="num"><code>${esc(s.target)}</code></td>
              <td><span class="pill ${okIdx ? 'pill-ok' : 'pill-pend'}">${okIdx ? 'Within target' : 'Above target'}</span></td></tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const note = document.getElementById('dismiss-note');
  if (note) note.addEventListener('click', () => { state.releaseNoteDismissed = true; route(); });
  const adv = document.getElementById('dismiss-advisory');
  if (adv) adv.addEventListener('click', () => { state.advisoryDismissed = true; route(); });
  document.getElementById('kbd-help').addEventListener('click', shortcutsModal);
  ready('dispatch_overview');
}

function sparkline() {
  // Deterministic 60-sample trace; decorative only.
  let path = '';
  for (let i = 0; i < 60; i++) {
    const y = 14 + Math.round(8 * Math.sin(i / 3.1) + 4 * Math.sin(i / 1.7));
    path += `${i === 0 ? 'M' : 'L'}${(i * 4.2).toFixed(1)} ${y} `;
  }
  return `<svg class="trace" width="100%" height="30" viewBox="0 0 250 30" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="#8A919C" stroke-width="1"/></svg>`;
}

function shortcutsModal() {
  overlay.innerHTML = `<div class="scrim" id="scrim"><div class="modal">
    <h3>Keyboard shortcuts <button id="modal-x">✕</button></h3>
    <div class="kbd-grid">
      <div><kbd>g</kbd> <kbd>r</kbd> — Setpoint registry</div>
      <div><kbd>g</kbd> <kbd>p</kbd> — Governance policy</div>
      <div><kbd>g</kbd> <kbd>s</kbd> — Commissioning standard</div>
      <div><kbd>g</kbd> <kbd>a</kbd> — Audit readiness</div>
      <div><kbd>⌘</kbd> <kbd>B</kbd> — Hide sidebar</div>
      <div><kbd>?</kbd> — This dialog</div>
    </div>
  </div></div>`;
  const close = () => { overlay.innerHTML = ''; };
  document.getElementById('modal-x').addEventListener('click', close);
  document.getElementById('scrim').addEventListener('click', (e) => {
    if (e.target.id === 'scrim') close();
  });
}

/* ------------------------------------------------------------------ *
 * Setpoint registry — identifiers + operational columns. Never layers.
 * ------------------------------------------------------------------ */

async function viewRegistry() {
  const d = await get(`/api/registry?region=${encodeURIComponent(state.region)}&page=${state.page}`);
  state.regions = d.regions;
  state.region = d.region.key;
  state.page = d.page;
  renderScope();

  app.innerHTML = `
    ${header({
      crumb: `Setpoint Registry <span class="sep">/</span> ${esc(d.region.label)}`,
      title: 'Setpoint Registry',
      subline: `Configuration-managed assets in the ${esc(d.region.label)}. Sorted by commissioning window.`,
      actions: `<button class="tool" id="filters-btn">${ico('filter')}Filters<span class="count">1</span></button>
                <button class="tool">${ico('sort')}Sort</button>
                <button class="tool">${ico('display')}Display</button>`,
    })}

    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <span class="filter-pill" data-testid="region-filter-pill">Region : ${esc(d.region.label)}<button title="Clear">✕</button></span>
      <span class="caption">Assets are partitioned across interconnects by operating area.</span>
    </div>

    <div class="rowcount" data-testid="rowcount">${d.total_in_region} ${d.total_in_region === 1 ? 'asset' : 'assets'} in this region</div>

    <div class="card" data-testid="registry-card">
      <table class="grid" data-testid="registry-table">
        <thead><tr>
          <th class="gutter"></th>
          <th>Asset <span class="sortglyph">↑↓</span></th>
          <th class="num">Voltage class <span class="sortglyph">↑↓</span></th>
          <th>Commissioning window <span class="sortglyph on">↑</span></th>
          <th>Owning district <span class="sortglyph">↑↓</span></th>
          <th>Telemetry health</th>
          <th style="width:40px"></th>
        </tr></thead>
        <tbody>
          ${d.rows.length === 0 ? `<tr><td colspan="7" class="empty">No assets match this filter.</td></tr>` : ''}
          ${d.rows.map((r) => `
            <tr class="reg-row" data-testid="registry-row" tabindex="0">
              <td class="gutter"></td>
              <td>
                <div class="reg-id" data-testid="registry-row-id">${esc(r.id)}</div>
                <div class="reg-meta">
                  <span>${r.voltage_class_kv} kV</span><span class="dot">·</span>
                  <span>${esc(r.district)}</span><span class="dot">·</span>
                  <span>in service ${esc(r.commissioning_window)}</span>
                </div>
              </td>
              <td class="num"><code>${r.voltage_class_kv}</code> <span class="caption">kV</span></td>
              <td><code>${esc(r.commissioning_window)}</code></td>
              <td>${esc(r.district)}</td>
              <td><span class="pill ${r.telemetry_health === 'Nominal' ? 'pill-ok' : 'pill-neutral'}">${esc(r.telemetry_health)}</span></td>
              <td style="text-align:right;color:var(--ink-3)">···</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <span class="range" data-testid="pager-range">${d.range_from}-${d.range_to} of ${d.total_in_region}</span>
      <span class="pages">
        ${Array.from({ length: d.page_count }, (_, i) => i + 1).map((p) => `
          <button data-testid="page-btn" data-page="${p}" ${p === d.page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}
        <button data-testid="page-next" ${d.page >= d.page_count ? 'disabled' : ''}>›</button>
      </span>
    </div>

    <h2 class="section">Feeder loading by district</h2>
    <div class="card">
      <table class="grid">
        <thead><tr><th>District</th><th>Peak loading</th><th class="num">%</th></tr></thead>
        <tbody>${d.feeder_loading.map((f) => `<tr class="ledger-row">
          <td>${esc(f.district)}</td>
          <td><span style="display:inline-block;height:8px;border-radius:999px;background:#DEE1E6;width:160px">
            <i style="display:block;height:8px;border-radius:999px;background:#64748B;width:${f.loading_pct}%"></i></span></td>
          <td class="num"><code>${f.loading_pct}</code></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  app.querySelectorAll('[data-testid="registry-row"]').forEach((tr) => {
    const id = tr.querySelector('[data-testid="registry-row-id"]').textContent;
    tr.addEventListener('click', () => { location.hash = `#/asset/${encodeURIComponent(id)}`; });
  });
  app.querySelectorAll('[data-testid="page-btn"]').forEach((b) => {
    b.addEventListener('click', () => { state.page = Number(b.dataset.page); route(); });
  });
  const next = app.querySelector('[data-testid="page-next"]');
  next.addEventListener('click', () => {
    if (state.page < d.page_count) { state.page += 1; route(); }
  });
  document.getElementById('filters-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    filterPopover(d);
  });

  ready('asset_roster');
}

function filterPopover(d) {
  const btn = document.getElementById('filters-btn');
  const r = btn.getBoundingClientRect();
  overlay.innerHTML = `<div class="popover" data-testid="filter-popover"
      style="top:${r.bottom + window.scrollY + 6}px; left:${r.left + window.scrollX - 200}px">
    <h3>Filter assets by… <button id="pop-x">✕</button></h3>
    <div class="sec"><h4>Interconnect region</h4>
      ${d.regions.map((x) => `<button class="opt-pill" data-region="${x.key}"
        aria-pressed="${x.key === state.region}">${esc(x.label)}</button>`).join('')}
    </div>
    <div class="sec"><h4>Telemetry health</h4>
      <button class="opt-pill" aria-pressed="false">Any</button>
      <button class="opt-pill" aria-pressed="false">Nominal</button>
      <button class="opt-pill" aria-pressed="false">Degraded</button>
      <button class="opt-pill" aria-pressed="false">Stale</button>
    </div>
    <div class="foot"><button class="btn">Clear</button></div>
  </div>`;
  const close = () => { overlay.innerHTML = ''; };
  document.getElementById('pop-x').addEventListener('click', close);
  overlay.querySelector('.popover').addEventListener('click', (e) => e.stopPropagation());
  overlay.querySelectorAll('[data-region]').forEach((b) => {
    b.addEventListener('click', () => {
      state.region = b.dataset.region;
      state.page = 1;
      close();
      route();
    });
  });
  document.addEventListener('click', close, { once: true });
}

/* ------------------------------------------------------------------ *
 * Asset configuration — the ledger is a collapsed disclosure and its payload
 * is fetched only when it is opened.
 * ------------------------------------------------------------------ */

async function viewAsset(assetId) {
  const a = await get(`/api/assets/${encodeURIComponent(assetId)}`);

  app.innerHTML = `
    ${header({
      crumb: `<a href="#/registry" data-testid="back-to-registry">Setpoint Registry</a>
              <span class="sep">/</span> ${esc(a.region.label)} <span class="sep">/</span> Asset`,
      title: 'Asset Configuration',
      ident: a.id,
      subline: `${esc(a.owner)} · commissioned ${esc(a.commissioning_window)}`,
      actions: `<button class="tool" id="back-btn">${ico('registry')}Back to registry</button>`,
    })}

    <div class="card">
      <div class="card-title">Asset identity</div>
      <div class="card-pad">
        <div class="defgrid">
          <div class="k">Asset identifier</div><div class="v"><code data-testid="detail-id">${esc(a.id)}</code></div>
          <div class="k">Voltage class</div><div class="v"><code>${a.voltage_class_kv}</code> <span class="caption">kV</span></div>
          <div class="k">Nameplate rating</div><div class="v"><code>${a.nameplate_mva}</code> <span class="caption">MV·A</span></div>
          <div class="k">Feeder</div><div class="v"><code>${esc(a.feeder)}</code></div>
          <div class="k">Owning district</div><div class="v">${esc(a.district)}</div>
          <div class="k">Interconnect</div><div class="v">${esc(a.region.label)} <span class="caption">(${esc(a.region.code)})</span></div>
          <div class="k">Commissioning window</div><div class="v"><code>${esc(a.commissioning_window)}</code></div>
          <div class="k">Last inspection</div><div class="v"><code>${esc(a.last_inspection)}</code></div>
          <div class="k">Telemetry health</div><div class="v"><span class="pill ${a.telemetry_health === 'Nominal' ? 'pill-ok' : 'pill-neutral'}">${esc(a.telemetry_health)}</span></div>
          <div class="k">Maintenance notes</div><div class="v">${esc(a.maintenance_note)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="disclosure">
        <button class="disc-head" id="ledger-toggle" data-testid="ledger-disclosure" aria-expanded="false" aria-controls="ledger-body">
          <span class="disc-chev">›</span>
          <span class="disc-title">Override ledger</span>
          <span class="disc-summary" data-testid="ledger-summary">not yet opened</span>
        </button>
        <div id="ledger-body" data-testid="ledger-body" hidden></div>
      </div>
    </div>

    <h2 class="section">Shift handover notes</h2>
    <div class="card">
      <div class="card-pad">
        <div class="caption" style="margin-bottom:6px">Entered 06:12 · Shift A</div>
        <div>Setpoint governance walkdown continued for this district. No field changes made this shift.</div>
        <div style="margin-top:12px"><button class="btn">Acknowledge</button></div>
      </div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => { location.hash = '#/registry'; });
  document.getElementById('ledger-toggle').addEventListener('click', toggleLedger);
  ready('asset_detail');
}

async function toggleLedger() {
  const btn = document.getElementById('ledger-toggle');
  const body = document.getElementById('ledger-body');
  const summary = app.querySelector('[data-testid="ledger-summary"]');

  if (btn.getAttribute('aria-expanded') === 'true') {
    btn.setAttribute('aria-expanded', 'false');
    body.hidden = true;
    body.innerHTML = '';
    summary.textContent = 'not yet opened';
    app.dataset.view = 'asset_detail';
    app.dataset.ledger = 'collapsed';
    return;
  }

  const id = app.querySelector('[data-testid="detail-id"]').textContent;
  app.dataset.ledger = 'loading';
  const led = await get(`/api/assets/${encodeURIComponent(id)}/ledger`);

  body.innerHTML = `
    <table class="grid" data-testid="ledger-table">
      <thead><tr>
        <th class="gutter"></th>
        <th>Override layer</th>
        <th>Stored value</th>
        <th>State</th>
      </tr></thead>
      <tbody>
        ${led.entries.map((e) => ledgerRow(e)).join('')}
      </tbody>
    </table>
    <div class="card-pad" style="padding-top:12px;border-top:1px solid var(--rule)">
      <div class="caption">Layers are listed in catalogue order (alphabetical). A layer this asset
        does not declare is written <span class="sentinel">(not declared)</span>; a declared layer
        holding no value is written <span class="sentinel">(no value)</span>; a declared layer holding a
        zero-length value is written <span class="vchip">""</span> and captioned <em>empty string</em>.
        These are three different facts and are never collapsed together.</div>
    </div>`;

  btn.setAttribute('aria-expanded', 'true');
  body.hidden = false;
  summary.textContent = 'open';
  app.dataset.view = 'layer_overrides';
  app.dataset.ledger = 'expanded';
}

function ledgerRow(e) {
  let value;
  let pill;
  if (e.state === 'not_declared') {
    value = `<span class="sentinel" data-testid="ledger-sentinel">(not declared)</span>`;
    pill = `<span class="pill pill-neutral">Not declared</span>`;
  } else if (e.state === 'no_value') {
    value = `<span class="sentinel" data-testid="ledger-sentinel">(no value)</span>`;
    pill = `<span class="pill pill-neutral">Declared, no value</span>`;
  } else if (e.state === 'empty_string') {
    // The stored characters are rendered between explicit quote marks so a
    // zero-length value reads as "" rather than as a blank cell. The raw
    // characters live alone inside <code data-testid="ledger-raw">.
    value = `<span class="vchip">"<code data-testid="ledger-raw"></code>"</span>
             <span class="caption" data-testid="ledger-empty-caption">empty string</span>`;
    pill = `<span class="pill pill-neutral">Declared, empty string</span>`;
  } else {
    value = `<span class="vchip">"<code data-testid="ledger-raw">${esc(e.value)}</code>"</span>`;
    pill = `<span class="pill pill-ok">Declared</span>`;
  }
  return `<tr class="ledger-row" data-testid="ledger-row" data-state="${e.state}">
    <td class="gutter">${e.state === 'not_declared' ? '' : diamond(e.identity)}</td>
    <td><code data-testid="ledger-layer">${esc(e.layer)}</code></td>
    <td data-testid="ledger-value">${value}</td>
    <td data-testid="ledger-state">${pill}</td>
  </tr>`;
}

/* ------------------------------------------------------------------ *
 * Governance policy — mode and key here; the ordering only behind the panel.
 * ------------------------------------------------------------------ */

async function viewPolicy() {
  const p = await get('/api/policy');

  app.innerHTML = `
    ${header({
      crumb: 'Governance <span class="sep">/</span> Configuration governance policy',
      title: 'Governance Policy',
      subline: 'The configuration-governance policy in force for the operating area.',
      actions: `<button class="btn" id="open-authority" data-testid="open-authority">Open override authority</button>`,
    })}

    <div class="card">
      <div class="card-title">Policy record <span class="caption">in force</span></div>
      <div class="card-pad">
        <div class="defgrid">
          <div class="k">Governing mode</div>
          <div class="v"><code data-testid="policy-mode">${esc(p.mode)}</code></div>
          <div class="k">Identifying key field</div>
          <div class="v"><code data-testid="policy-key">${esc(p.key)}</code></div>
          <div class="k">Authority layers defined</div>
          <div class="v"><code data-testid="policy-layer-count">${p.authority_layer_count}</code>
            <span class="caption" style="margin-left:6px">names and rank order are held in the override-authority panel</span></div>
          <div class="k">Effective date</div><div class="v"><code>${esc(p.effective_date)}</code></div>
          <div class="k">Approving committee</div><div class="v">${esc(p.approving_committee)}</div>
          <div class="k">Review cadence</div><div class="v">${esc(p.review_cadence)}</div>
          <div class="k">Policy owner</div><div class="v">${esc(p.policy_owner)}</div>
        </div>
      </div>
    </div>

    <div id="authority-slot"></div>

    <h2 class="section">Superseded revisions</h2>
    <div class="card">
      <table class="grid" data-testid="superseded-table">
        <thead><tr><th>Revision</th><th>Withdrawn</th><th>Approved by</th><th>Status</th></tr></thead>
        <tbody>${p.superseded.map((s) => `<tr class="ledger-row">
          <td><code>${esc(s.revision)}</code></td>
          <td><code>${esc(s.withdrawn)}</code></td>
          <td>${esc(s.approver)}</td>
          <td><span class="pill pill-neutral">Historical</span></td></tr>`).join('')}
        </tbody>
      </table>
      <div class="card-pad" style="border-top:1px solid var(--rule)">
        <div class="caption">Superseded revisions are retained for audit trail only. They carry dates and
          approvers; no withdrawn revision carries an authority ordering.</div>
      </div>
    </div>`;

  document.getElementById('open-authority').addEventListener('click', openAuthority);
  ready('policy_page');
}

async function openAuthority() {
  const slot = document.getElementById('authority-slot');
  if (slot.dataset.open === 'true') return;
  const d = await get('/api/policy/authority');

  slot.dataset.open = 'true';
  slot.innerHTML = `
    <div class="card" data-testid="authority-panel">
      <div class="card-title">Override authority
        <span class="caption">highest authority first</span></div>
      <div class="ladder">
        ${d.ranks.map((r, i) => `
          ${i ? '<div class="connector"><i></i></div>' : '<div style="height:12px"></div>'}
          <div class="rank-card" data-testid="rank-row">
            <span class="rank-chip" data-testid="rank-number">${r.rank}</span>
            ${diamond(r.identity)}
            <span class="rank-layer" data-testid="rank-layer">${esc(r.layer)}</span>
            <span class="rank-qual">${i === 0 ? 'highest authority'
              : (i === d.ranks.length - 1 ? 'base layer' : `rank ${r.rank} of ${d.ranks.length}`)}</span>
          </div>`).join('')}
      </div>
      <div class="card-pad" style="border-top:1px solid var(--rule);display:flex;align-items:center">
        <span class="caption">Rank 1 is consulted first; the base layer is consulted last.</span>
        <span style="margin-left:auto"><button class="btn" data-testid="close-authority">Dismiss</button></span>
      </div>
    </div>`;

  slot.querySelector('[data-testid="close-authority"]').addEventListener('click', () => {
    slot.dataset.open = 'false';
    slot.innerHTML = '';
    app.dataset.view = 'policy_page';
  });
  app.dataset.view = 'precedence_ladder';
}

/* ------------------------------------------------------------------ *
 * Commissioning standard — front matter, then each part on its own surface.
 * ------------------------------------------------------------------ */

async function viewStandard() {
  const s = await get('/api/standard');
  const notes = {
    clauses: 'Accepted input, rejection conditions, result shape, key order and sort order.',
    conditions: 'The envelope a conforming run executes inside.',
    annex: 'The one outcome this standard fixes by value.',
  };

  app.innerHTML = `
    ${header({
      crumb: 'Standards library <span class="sep">/</span> Commissioning standard',
      title: 'Commissioning Standard',
      subline: 'Front matter. None of the normative parts are printed on this page; each is opened below.',
      actions: `<button class="tool">${ico('doc')}Print view</button>`,
    })}

    <div class="card">
      <div class="card-title">Front matter</div>
      <div class="card-pad">
        <div class="defgrid">
          <div class="k">Revision in force</div><div class="v"><code data-testid="standard-revision">${esc(s.revision)}</code></div>
          <div class="k">Text encoding rule</div><div class="v"><code data-testid="standard-encoding">${esc(s.encoding)}</code></div>
          <div class="k">Adopted</div><div class="v"><code>${esc(s.adopted)}</code></div>
          <div class="k">Published by</div><div class="v">${esc(s.editor)}</div>
        </div>
      </div>
    </div>

    <h2 class="section">Published parts</h2>
    <div class="card parts-list" data-testid="parts-list">
      ${s.parts.map((p) => {
        const locked = p.id === 'annex' && !state.clausesRead;
        return `<div class="part">
          <span class="pnum">${esc(p.number)}</span>
          <span>
            <div class="ptitle">${esc(p.title)}</div>
            <div class="pnote">${notes[p.id]}${locked
              ? ' <span data-testid="annex-locked-note">Published as an appendix to the normative clause body — open Part 1 first.</span>'
              : ''}</div>
          </span>
          <span class="pact">
            <button class="btn ${p.id === 'clauses' ? 'btn-primary' : ''}" data-testid="open-part-${p.id}"
              data-part="${p.id}" ${locked ? 'disabled' : ''}>Open</button>
          </span>
        </div>`;
      }).join('')}
    </div>

    <h2 class="section">Adoption and amendments</h2>
    <div class="card">
      <div class="card-pad">
        <div class="caption">Adopted by the Regional Configuration Control Board. Amendments listed below are
          editorial; none alters a normative clause.</div>
      </div>
      <table class="grid">
        <thead><tr><th>Amendment</th><th>Date</th><th>Editor</th><th>Kind</th></tr></thead>
        <tbody>${s.amendments.map((a) => `<tr class="ledger-row">
          <td><code>${esc(a.ref)}</code></td><td><code>${esc(a.date)}</code></td>
          <td>${esc(a.editor)}</td><td><span class="pill pill-neutral">${esc(a.kind)}</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  app.querySelectorAll('[data-part]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.disabled) return;
      location.hash = `#/standard/${b.dataset.part}`;
    });
  });
  ready('standard_index');
}

function docShell({ crumbTail, title, subline, anchors, body }) {
  return `
    ${header({
      crumb: `Standards library <span class="sep">/</span>
              <a href="#/standard" data-testid="back-to-standard">Commissioning Standard</a>
              <span class="sep">/</span> ${esc(crumbTail)}`,
      title,
      subline,
      actions: `<button class="btn" data-testid="close-part">Return to front matter</button>`,
    })}
    <div class="doc-wrap">
      <div class="doc" data-testid="doc-body">${body}</div>
      <div class="doc-anchors">
        <div class="t">On this part</div>
        ${anchors.map((a, i) => `<a href="#/standard" class="${i === 0 ? 'on' : ''}">${esc(a)}</a>`).join('')}
      </div>
    </div>`;
}

function wireClose() {
  app.querySelector('[data-testid="close-part"]').addEventListener('click', () => {
    location.hash = '#/standard';
  });
}

async function viewClauses() {
  const d = await get('/api/standard/clauses');
  state.clausesRead = true;

  const body = d.clauses.map((c) => {
    let inner = '';
    if (c.kind === 'prose') {
      inner = `<p data-testid="clause-body">${esc(c.text)}</p>`;
    } else if (c.kind === 'literal') {
      inner = `<p><span class="lit" data-testid="clause-body">${esc(c.text)}</span></p>`;
    } else if (c.kind === 'literal-list') {
      inner = `<p>${c.values.map((v) => `<span class="lit" data-testid="clause-literal">${esc(v)}</span>`).join(' ')}</p>`;
    } else if (c.kind === 'literal-pairs') {
      inner = `<div class="pairs">${c.pairs.map((p) => `
        <div data-testid="clause-pair">
          <code data-testid="clause-pair-name">${esc(p.name)}</code> —
          <span class="lit" data-testid="clause-pair-text">${esc(p.text)}</span>
        </div>`).join('')}</div>`;
    }
    return `<div class="clause" data-testid="clause" data-clause="${esc(c.no)}">
      <div class="no" data-testid="clause-no">${esc(c.no)}</div>
      <div><h3 data-testid="clause-title">${esc(c.title)}</h3>${inner}</div>
    </div>`;
  }).join('');

  app.innerHTML = docShell({
    crumbTail: 'Normative clauses',
    title: 'Normative Clauses',
    subline: 'Part 1. What input is accepted, what must be rejected, and what shape the produced result takes.',
    anchors: d.clauses.map((c) => `${c.no} ${c.title}`),
    body: `${body}
      <div class="clause" style="border-top:1px solid var(--rule);padding-top:12px;margin-top:12px">
        <div class="no">Note</div>
        <div><p>Where a clause depends on the governance policy in force, it refers to
          <a href="#/policy" data-testid="policy-pointer">the governance policy record</a> and its
          override-authority panel. This standard does not restate the policy's governing mode,
          identifying key field or authority ordering.</p></div>
      </div>`,
  });
  wireClose();
  ready('standard_clauses');
}

async function viewConditions() {
  const d = await get('/api/standard/conditions');
  state.conditionsRead = true;

  const body = `<div class="defgrid" data-testid="conditions-grid">
    ${d.conditions.map((c) => `
      <div class="k" data-testid="condition-label">${esc(c.no)} ${esc(c.label)}</div>
      <div class="v" data-testid="condition" data-field="${esc(c.field)}">
        <code data-testid="condition-field">${esc(c.field)}</code>
        <span style="margin:0 6px;color:var(--ink-3)">=</span>
        <span class="lit"><code data-testid="condition-value">${esc(String(c.value))}</code></span>
        ${c.unit ? `<span class="caption" style="margin-left:4px">${esc(c.unit)}</span>` : ''}
      </div>`).join('')}
  </div>
  <p style="margin-top:16px;font-size:13.5px;line-height:1.7;color:var(--ink-2);max-width:68ch">
    These conditions govern how a conforming run is performed. They do not describe what it produces;
    that is Part 1.</p>`;

  app.innerHTML = docShell({
    crumbTail: 'Conditions of use',
    title: 'Conditions of Use',
    subline: 'Part 2. The envelope a conforming run must execute inside.',
    anchors: d.conditions.map((c) => `${c.no} ${c.label}`),
    body,
  });
  wireClose();
  ready('standard_envelope');
}

async function viewAnnex() {
  if (!state.clausesRead) {
    app.innerHTML = `
      ${header({
        crumb: `Standards library <span class="sep">/</span>
                <a href="#/standard" data-testid="back-to-standard">Commissioning Standard</a>
                <span class="sep">/</span> Reference annex`,
        title: 'Reference Annex',
        subline: 'Not available yet.',
        actions: `<button class="btn" data-testid="close-part">Return to front matter</button>`,
      })}
      <div class="card"><div class="card-pad">
        <div class="pending-note" data-testid="annex-locked">The reference annex is published as an
          appendix to the normative clause body. Open Part 1 — Normative clauses before opening this annex.</div>
      </div></div>`;
    wireClose();
    ready('standard_annex_locked');
    return;
  }

  const d = await get('/api/standard/annex');
  const body = `
    <div class="clause">
      <div class="no">A.1</div>
      <div>
        <h3>Reference outcome for an empty population</h3>
        <p>Where the accepted input carries no records, a conforming run produces exactly the
          following result. This is the one outcome this standard fixes by value rather than by rule.</p>
        <pre class="annex-block" data-testid="annex-payload">${esc(JSON.stringify(d.reference_outcome, null, 2))}</pre>
      </div>
    </div>`;

  app.innerHTML = docShell({
    crumbTail: 'Reference annex',
    title: 'Reference Annex',
    subline: 'Annex A. Normative. The one worked outcome the standard fixes by value.',
    anchors: ['A.1 Reference outcome for an empty population'],
    body,
  });
  wireClose();
  ready('standard_annex');
}

/* ------------------------------------------------------------------ *
 * Audit readiness and the rendered conformance matrix
 * ------------------------------------------------------------------ */

async function viewAudit() {
  const a = await get('/api/audit');

  app.innerHTML = `
    ${header({
      crumb: 'Governance <span class="sep">/</span> Commissioning audit readiness',
      title: 'Commissioning Audit Readiness',
      subline: 'Which conformance checks the current configuration regime is accountable for before sign-off.',
      actions: `<button class="btn btn-primary" id="render-matrix" data-testid="render-matrix">Render conformance matrix</button>`,
    })}

    <div class="card">
      <div class="card-title">Readiness summary</div>
      <div class="card-pad">
        <div class="defgrid">
          <div class="k">Conformance checks accountable</div>
          <div class="v"><code data-testid="audit-check-count">${a.checks_accountable}</code></div>
          <div class="k">Sign-off status</div>
          <div class="v"><span class="pill pill-pend" data-testid="signoff-status">${esc(a.sign_off_status)}</span></div>
          <div class="k">Matrix last rendered</div>
          <div class="v"><span class="sentinel">(not rendered in this session)</span></div>
        </div>
        <div class="caption" style="margin-top:12px">The individual checks are not listed on this page.
          Render the conformance matrix to produce the document that carries them.</div>
      </div>
    </div>

    <h2 class="section">Auditor</h2>
    <div class="card">
      <div class="card-pad">
        <div class="defgrid">
          <div class="k">Lead auditor</div><div class="v">${esc(a.auditor.name)}</div>
          <div class="k">Role</div><div class="v">${esc(a.auditor.role)}</div>
          <div class="k">Desk</div><div class="v">${esc(a.auditor.desk)}</div>
          <div class="k">Extension</div><div class="v"><code>${esc(a.auditor.phone)}</code></div>
          <div class="k">Contact window</div><div class="v">${esc(a.auditor.window)}</div>
        </div>
      </div>
    </div>`;

  document.getElementById('render-matrix').addEventListener('click', () => {
    location.hash = '#/audit/matrix';
  });
  ready('audit_readiness');
}

async function viewMatrix() {
  app.innerHTML = `
    ${header({
      crumb: `Governance <span class="sep">/</span>
              <a href="#/audit" data-testid="back-to-audit">Commissioning Audit Readiness</a>
              <span class="sep">/</span> Conformance matrix`,
      title: 'Conformance Matrix',
      subline: 'Rendered document.',
      actions: `<button class="btn" data-testid="close-matrix">Return to audit readiness</button>`,
    })}
    <div class="card"><div class="card-pad">
      <span class="pending-note" data-testid="matrix-progress">Rendering conformance matrix…</span>
    </div></div>`;
  app.querySelector('[data-testid="close-matrix"]').addEventListener('click', () => {
    location.hash = '#/audit';
  });

  const doc = document.createElement('div');
  doc.dataset.testid = 'matrix';
  doc.setAttribute('data-testid', 'matrix');
  doc.setAttribute('data-matrix-state', 'rendering');

  // Deterministic, bounded render delay. The surface publishes an explicit
  // ready signal (data-matrix-state="ready") rather than expecting a sleep.
  const d = await get('/api/audit/matrix');
  await new Promise((r) => setTimeout(r, 150));

  doc.className = 'export-sheet';
  doc.innerHTML = `
    <div class="export-head">
      <h2>${esc(d.document.title)}</h2>
      <div class="meta">Standard revision <code data-testid="matrix-revision">${esc(d.document.standard_revision)}</code>
        · ${esc(d.document.generated)}
        · <span data-testid="matrix-rowcount">${d.document.row_count}</span> rows</div>
    </div>
    <table class="export-table" data-testid="matrix-table">
      <thead><tr><th class="cno">#</th><th>Conformance check</th></tr></thead>
      <tbody>
        ${d.rows.map((r) => `<tr data-testid="matrix-row">
          <td class="cno" data-testid="matrix-no">${r.no}</td>
          <td data-testid="matrix-check">${esc(r.check)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="export-actions">
      <a class="btn" data-testid="download-matrix" href="/api/audit/matrix.csv"
         download="${esc(d.document.filename)}">${ico('download')}Download</a>
      <span class="export-filename">${esc(d.document.filename)}</span>
    </div>`;

  app.querySelector('.card').replaceWith(doc);
  doc.setAttribute('data-matrix-state', 'ready');
  ready('conformance_export');
}

/* ------------------------------------------------------------------ *
 * router
 * ------------------------------------------------------------------ */

const ROUTES = [
  [/^#\/overview$/, 'overview', viewOverview],
  [/^#\/registry$/, 'registry', viewRegistry],
  [/^#\/asset\/(.+)$/, 'registry', (m) => viewAsset(decodeURIComponent(m[1]))],
  [/^#\/policy$/, 'policy', viewPolicy],
  [/^#\/standard$/, 'standard', viewStandard],
  [/^#\/standard\/clauses$/, 'standard', viewClauses],
  [/^#\/standard\/conditions$/, 'standard', viewConditions],
  [/^#\/standard\/annex$/, 'standard', viewAnnex],
  [/^#\/audit$/, 'audit', viewAudit],
  [/^#\/audit\/matrix$/, 'audit', viewMatrix],
];

async function route() {
  const hash = location.hash || '#/overview';
  overlay.innerHTML = '';
  app.dataset.ready = 'false';
  delete app.dataset.ledger;

  const hit = ROUTES.find(([re]) => re.test(hash));
  if (!hit) { location.hash = '#/overview'; return; }
  renderNav(hit[1]);
  try {
    await hit[2](hash.match(hit[0]));
  } catch (err) {
    app.innerHTML = `<div class="card"><div class="card-pad"><div class="empty">${esc(err.message)}</div></div></div>`;
    ready('error');
  }
}

async function boot() {
  // Region metadata only: the shell must not fetch registry rows to draw itself.
  const d = await get('/api/regions');
  state.regions = d.regions;
  renderScope();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/overview';
  else route();
}

boot();

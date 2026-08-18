'use strict';

/* ============================================================
 * Forge CI — front end.
 *
 * Surface discipline: the inventory grid renders build id, start
 * time, runner and suite. Branch, status, wall clock and revision
 * are not inventory columns; they belong to a build's own page and,
 * for the last two, to the timing tooltip and the commit accordion.
 * ============================================================ */

const view = document.getElementById('view');
const crumbs = document.getElementById('crumbs');

/** Deterministic, bounded render latency so the grid settles visibly. */
const LATENCY_MS = 140;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

async function api(pathname) {
  const res = await fetch(pathname, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`);
  return res.json();
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

function ready(name) {
  view.dataset.view = name;
  view.dataset.ready = 'true';
}
function busy(name) {
  view.dataset.view = name;
  view.dataset.ready = 'false';
}

function fmtStamp(iso) {
  const d = new Date(iso);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n) => String(n).padStart(2, '0');
  return `${mon} ${p(d.getUTCDate())}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function osClass(runner) {
  if (runner.startsWith('macos')) return 'mac';
  if (runner.startsWith('ubuntu')) return 'ubuntu';
  return '';
}

function setCrumbs(parts) {
  crumbs.innerHTML = parts
    .map((p, i) => {
      const last = i === parts.length - 1;
      const label = last ? `<span class="cur">${esc(p.label)}</span>`
        : `<a href="${esc(p.href)}" data-link>${esc(p.label)}</a>`;
      return (i ? '<span class="sep">/</span>' : '') + label;
    })
    .join('');
}

function markNav(key) {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === key);
  });
}

/* ------------------------------ chrome ------------------------------ */

const BANNER_KEY = 'forge.banner.dismissed';
function bannerHtml() {
  if (window.__bannerDismissed) return '';
  return `<div class="banner" id="banner">
    <span class="tag">NEW</span>
    <span>Pipeline insights now break flake rate down per suite. Cache v3 rolls out to Linux runners this week.</span>
    <a href="/settings" data-link>Read the changelog</a>
    <button class="x" id="banner-x" aria-label="Dismiss announcement">×</button>
  </div>`;
}
function wireBanner() {
  const x = document.getElementById('banner-x');
  if (x) x.addEventListener('click', () => {
    window.__bannerDismissed = true;
    const b = document.getElementById('banner');
    if (b) b.remove();
  });
}

const bellBtn = document.getElementById('bell-btn');
const bellPop = document.getElementById('bell-popover');
bellBtn.addEventListener('click', async () => {
  const open = bellPop.hidden;
  bellPop.hidden = !open;
  bellBtn.setAttribute('aria-expanded', String(open));
  if (open && !bellPop.dataset.loaded) {
    const items = await api('/api/notifications');
    bellPop.innerHTML = '<h4>Notifications</h4>' + items.map((n) => `
      <div class="note"><span>${esc(n.text)}</span><span class="age">${esc(n.age)}</span></div>`).join('');
    bellPop.dataset.loaded = '1';
  }
});
document.addEventListener('click', (e) => {
  if (!bellPop.hidden && !bellPop.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
    bellPop.hidden = true;
    bellBtn.setAttribute('aria-expanded', 'false');
  }
});

function sparkline(series, color) {
  const w = 148, h = 26;
  const min = Math.min(...series), max = Math.max(...series);
  const span = Math.max(1, max - min);
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 5);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" points="${pts.join(' ')}"/>
  </svg>`;
}

async function fleetWidget() {
  const fleet = await api('/api/fleet');
  return `<section class="card">
    <header><h3>Runner fleet health</h3><span class="sub">live</span></header>
    <div class="body">
      ${fleet.map((f) => {
        const cls = f.saturation_pct > 80 ? 'hot' : f.saturation_pct > 60 ? 'mid' : '';
        return `<div class="gauge">
          <div class="g-head"><span class="name">${esc(f.runner)}</span><span class="pct">${f.saturation_pct}%</span></div>
          <div class="g-track"><div class="g-fill ${cls}" style="width:${f.saturation_pct}%"></div></div>
          <div class="g-sub">${f.lanes} lanes · mean queue ${f.mean_queue_wait_sec}s</div>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

/* ------------------------------ overview ------------------------------ */

async function renderOverview() {
  busy('overview');
  markNav('overview');
  setCrumbs([{ label: 'heliostack', href: '/' }, { label: 'platform', href: '/' }, { label: 'Overview' }]);
  view.innerHTML = '<div class="skeleton">Loading pipeline health…</div>';

  const [o, fleet] = await Promise.all([api('/api/overview'), fleetWidget()]);
  await settle(LATENCY_MS);

  view.innerHTML = `
    ${bannerHtml()}
    <div class="page-head">
      <div>
        <h1>Pipeline health</h1>
        <p>Aggregate signal across all tracked branches, ${esc(o.window)}.</p>
      </div>
      <div class="right">
        <button class="btn ghost">Compare window</button>
        <a class="btn primary" href="/builds" data-link>Open build inventory</a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="k">Builds executed</div><div class="v">${o.total_builds}</div>
        <div class="d"><span class="up">▲ 6%</span> vs previous window</div>
        ${sparkline(o.sparklines.throughput, '#2f6df6')}
      </div>
      <div class="kpi">
        <div class="k">Pass rate</div><div class="v">${o.pass_rate_pct}%</div>
        <div class="d"><span class="down">▼ 2.1pt</span> vs previous window</div>
        ${sparkline(o.sparklines.flake_rate, '#cf2f45')}
      </div>
      <div class="kpi">
        <div class="k">Mean queue wait</div><div class="v">${o.mean_queue_wait_sec}s</div>
        <div class="d"><span class="up">▲ 11s</span> peak weekday load</div>
        ${sparkline(o.sparklines.queue_depth, '#b06a00')}
      </div>
      <div class="kpi">
        <div class="k">Tracked branches</div><div class="v">${o.tracked_branches}</div>
        <div class="d">${o.active_runners} runner pools online</div>
        ${sparkline(o.sparklines.runner_saturation, '#1f8a5b')}
      </div>
    </div>

    <div class="cols">
      <section class="card">
        <header><h3>Outcome mix</h3><span class="sub">${esc(o.window)}</span></header>
        <div class="body">
          ${Object.entries(o.status_counts).map(([s, n]) => {
            const pct = Math.round((n / o.total_builds) * 100);
            return `<div class="bar-row">
              <span class="status ${esc(s)}">${esc(s)}</span>
              <span class="bar-track"><span class="bar-fill s-${esc(s)}" style="width:${pct}%"></span></span>
              <span class="n">${n}</span></div>`;
          }).join('')}
          <p class="footnote">Outcome mix is an aggregate roll-up. Per-build outcome, wall clock and revision
          live on each build's own page in the inventory.</p>
        </div>
      </section>
      ${fleet}
    </div>

    <div class="cols" style="margin-top:16px">
      <section class="card">
        <header><h3>Throughput</h3><span class="sub">builds started per day · ${esc(o.window)}</span></header>
        <div class="body">
          <div class="cols-chart">
            ${o.sparklines.throughput.map((v) => `<span style="height:${Math.round((v / 95) * 100)}%"></span>`).join('')}
          </div>
          <div class="chart-axis"><span>day 1</span><span>day 12</span><span>day 24</span></div>
        </div>
      </section>
      <section class="card">
        <header><h3>Policy checks</h3></header>
        <div class="body">
          <div class="checklist">
            <div class="item"><span class="mark ok">✓</span> Required status checks<span class="tail">enforced</span></div>
            <div class="item"><span class="mark ok">✓</span> Signed commits<span class="tail">enforced</span></div>
            <div class="item"><span class="mark warn">!</span> Artifact retention<span class="tail">review</span></div>
            <div class="item"><span class="mark off">·</span> Merge queue<span class="tail">off</span></div>
          </div>
          <p class="footnote">Policy is evaluated per branch at merge time.</p>
        </div>
      </section>
    </div>
  `;
  wireBanner();
  ready('overview');
}

/* ------------------------------ builds ------------------------------ */

const uiState = { panel: null, draftBranch: '', draftStatus: '' };

async function renderBuilds(query) {
  busy('builds');
  markNav('builds');
  const branch = query.get('branch') || '';
  const status = query.get('status') || '';
  const page = parseInt(query.get('page') || '0', 10) || 0;

  setCrumbs([
    { label: 'heliostack', href: '/' },
    { label: 'platform', href: '/' },
    { label: 'Builds' },
  ]);
  view.innerHTML = '<div class="skeleton">Loading build inventory…</div>';

  const qs = new URLSearchParams();
  if (branch) qs.set('branch', branch);
  if (status) qs.set('status', status);
  if (page) qs.set('page', String(page));
  window.__lastInventoryQuery = qs.toString() ? `?${qs}` : '';
  const [data, facets, fleet] = await Promise.all([
    api('/api/builds' + (qs.toString() ? `?${qs}` : '')),
    api('/api/facets'),
    fleetWidget(),
  ]);
  await settle(LATENCY_MS);

  uiState.draftBranch = branch;
  uiState.draftStatus = status;

  const tally = document.getElementById('nav-tally');
  if (tally) tally.textContent = String(data.total);

  const from = data.total === 0 ? 0 : data.page * data.page_size + 1;
  const to = Math.min(data.total, (data.page + 1) * data.page_size);

  view.innerHTML = `
    ${bannerHtml()}
    <div class="page-head">
      <div>
        <h1>Build inventory</h1>
        <p>Every pipeline run recorded for this project. Open a build for its outcome, timing and revision.</p>
      </div>
      <div class="right">
        <button class="btn ghost">Saved views</button>
        <button class="btn">Re-run selected</button>
      </div>
    </div>

    <div class="cols">
      <div>
        <section class="card">
          <div class="toolbar">
            <div class="tabs" role="tablist">
              <button class="tab" id="tab-filters" aria-expanded="false" aria-controls="panel-filters">Filters <span class="caret">▾</span></button>
              <button class="tab" id="tab-actions" aria-expanded="false" aria-controls="panel-actions">Actions <span class="caret">▾</span></button>
              <button class="tab" id="tab-insights" aria-expanded="false" aria-controls="panel-insights">Insights <span class="caret">▾</span></button>
              <span class="spacer"></span>
              <span class="hint">${data.total} build${data.total === 1 ? '' : 's'} in scope</span>
            </div>
          </div>

          <div class="panel" id="panel-filters" role="region" aria-labelledby="tab-filters" hidden>
            <div class="facet-grid">
              <div class="facet">
                <h4>Branch</h4>
                <div class="facet-opts" id="facet-branch">
                  ${facets.branches.map((b) => `<button class="chip" data-facet="branch" data-value="${esc(b)}" aria-pressed="${b === branch}">${esc(b)}</button>`).join('')}
                </div>
              </div>
              <div class="facet">
                <h4>Status</h4>
                <div class="facet-opts" id="facet-status">
                  ${facets.statuses.map((s) => `<button class="chip" data-facet="status" data-value="${esc(s)}" aria-pressed="${s === status}">${esc(s)}</button>`).join('')}
                </div>
              </div>
            </div>
            <div class="panel-actions">
              <button class="btn primary" id="apply-facets">Apply filters</button>
              <button class="btn ghost" id="clear-facets">Clear</button>
              <span class="export-row meta">Facets narrow the inventory; they do not add columns.</span>
            </div>
          </div>

          <div class="panel" id="panel-actions" role="region" aria-labelledby="tab-actions" hidden>
            <div class="export-row">
              <a class="btn primary" id="export-csv" href="/api/export.csv" download="forge-ci-build-inventory.csv">Export inventory (CSV)</a>
              <button class="btn" disabled>Re-run failures</button>
              <button class="btn" disabled>Bulk cancel</button>
              <span class="meta">CSV carries build id, branch, status, start time, runner and suite for all builds.
              Wall clock and revision are per-build fields and are not included.</span>
            </div>
          </div>

          <div class="panel" id="panel-insights" role="region" aria-labelledby="tab-insights" hidden>
            <div class="insight-grid" id="insights-body"><div class="skeleton">Loading insights…</div></div>
          </div>

          ${(branch || status) ? `<div class="filter-summary">
            <span>Filtered by</span>
            ${branch ? `<span class="pill">branch: ${esc(branch)} <button data-drop="branch" aria-label="Remove branch filter">×</button></span>` : ''}
            ${status ? `<span class="pill">status: ${esc(status)} <button data-drop="status" aria-label="Remove status filter">×</button></span>` : ''}
          </div>` : ''}

          <div class="table-wrap">
            <table class="grid" id="builds-table">
              <thead>
                <tr>
                  <th style="width:96px">Build</th>
                  <th style="width:210px">Started</th>
                  <th style="width:210px">Runner</th>
                  <th>Suite</th>
                  <th style="width:30px"></th>
                </tr>
              </thead>
              <tbody id="builds-body">
                ${data.rows.length === 0
                  ? `<tr><td colspan="5" class="empty">No builds match these facets.</td></tr>`
                  : data.rows.map((r) => `
                    <tr data-build="${r.build_id}">
                      <td class="id"><a href="/builds/${r.build_id}" data-link>#${r.build_id}</a></td>
                      <td class="dim">${esc(fmtStamp(r.started_at))}</td>
                      <td><span class="runner-cell"><i class="os-glyph ${osClass(r.runner)}"></i><span class="mono">${esc(r.runner)}</span></span></td>
                      <td><span class="suite">${esc(r.test_suite)}</span></td>
                      <td class="row-open">›</td>
                    </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <div class="pager">
            <span>Showing <span class="pnum">${from}–${to}</span> of <span class="pnum">${data.total}</span></span>
            <span class="grow">
              <button class="btn" id="prev-page" ${data.page === 0 ? 'disabled' : ''}>Previous</button>
              <span>Page <span class="pnum" id="page-num">${data.page + 1}</span> of ${data.pages}</span>
              <button class="btn" id="next-page" ${data.page >= data.pages - 1 ? 'disabled' : ''}>Next</button>
            </span>
          </div>
        </section>
      </div>
      ${fleet}
    </div>
  `;

  wireBanner();
  wireToolbar(branch, status, page, data);
  ready('builds');
}

function navQuery(branch, status, page) {
  const qs = new URLSearchParams();
  if (branch) qs.set('branch', branch);
  if (status) qs.set('status', status);
  if (page) qs.set('page', String(page));
  go('/builds' + (qs.toString() ? `?${qs}` : ''));
}

function wireToolbar(branch, status, page, data) {
  const panels = {
    filters: [document.getElementById('tab-filters'), document.getElementById('panel-filters')],
    actions: [document.getElementById('tab-actions'), document.getElementById('panel-actions')],
    insights: [document.getElementById('tab-insights'), document.getElementById('panel-insights')],
  };

  for (const [key, [tab, panel]] of Object.entries(panels)) {
    tab.addEventListener('click', async () => {
      const opening = panel.hidden;
      for (const [k, [t, p]] of Object.entries(panels)) {
        p.hidden = true;
        t.setAttribute('aria-expanded', 'false');
        if (k === key && opening) {
          p.hidden = false;
          t.setAttribute('aria-expanded', 'true');
        }
      }
      if (key === 'insights' && opening) await loadInsights();
    });
  }

  document.querySelectorAll('#panel-filters .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const field = chip.dataset.facet;
      const value = chip.dataset.value;
      const current = field === 'branch' ? uiState.draftBranch : uiState.draftStatus;
      const next = current === value ? '' : value;
      if (field === 'branch') uiState.draftBranch = next; else uiState.draftStatus = next;
      document.querySelectorAll(`#panel-filters .chip[data-facet="${field}"]`).forEach((c) => {
        c.setAttribute('aria-pressed', String(c.dataset.value === next));
      });
    });
  });

  document.getElementById('apply-facets').addEventListener('click', () => {
    navQuery(uiState.draftBranch, uiState.draftStatus, 0);
  });
  document.getElementById('clear-facets').addEventListener('click', () => navQuery('', '', 0));

  document.querySelectorAll('[data-drop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const drop = btn.dataset.drop;
      navQuery(drop === 'branch' ? '' : branch, drop === 'status' ? '' : status, 0);
    });
  });

  const prev = document.getElementById('prev-page');
  const next = document.getElementById('next-page');
  prev.addEventListener('click', () => { if (data.page > 0) navQuery(branch, status, data.page - 1); });
  next.addEventListener('click', () => { if (data.page < data.pages - 1) navQuery(branch, status, data.page + 1); });

  document.querySelectorAll('#builds-body tr[data-build]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      go(`/builds/${tr.dataset.build}`);
    });
  });
}

async function loadInsights() {
  const host = document.getElementById('insights-body');
  if (host.dataset.loaded) return;
  const ins = await api('/api/insights');
  const maxQ = Math.max(...ins.queue_wait_by_runner.map((r) => r.mean_queue_wait_sec));
  const maxB = Math.max(...ins.builds_by_suite.map((r) => r.builds));
  host.innerHTML = `
    <div>
      <h4 style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#79838f">Mean queue wait by runner pool</h4>
      ${ins.queue_wait_by_runner.map((r) => `<div class="bar-row">
        <span class="mono">${esc(r.runner)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((r.mean_queue_wait_sec / maxQ) * 100)}%"></span></span>
        <span class="n">${r.mean_queue_wait_sec}s</span></div>`).join('')}
    </div>
    <div>
      <h4 style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#79838f">Builds by test suite</h4>
      ${ins.builds_by_suite.map((r) => `<div class="bar-row">
        <span>${esc(r.test_suite)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((r.builds / maxB) * 100)}%;background:#1f8a5b"></span></span>
        <span class="n">${r.builds}</span></div>`).join('')}
    </div>`;
  host.dataset.loaded = '1';
}

/* ------------------------------ detail ------------------------------ */

const PHASE_COLORS = ['#2f6df6', '#5b8ef8', '#8fb0f8', '#1f8a5b', '#d9a02f', '#98a2ae'];

async function renderDetail(id) {
  busy('build_detail');
  markNav('builds');
  view.innerHTML = '<div class="skeleton">Loading build…</div>';

  let b;
  try {
    b = await api(`/api/builds/${id}`);
  } catch {
    setCrumbs([{ label: 'heliostack', href: '/' }, { label: 'Builds', href: '/builds' }, { label: 'Not found' }]);
    view.innerHTML = '<div class="empty">That build does not exist.</div>';
    ready('build_detail');
    return;
  }
  await settle(LATENCY_MS);

  setCrumbs([
    { label: 'heliostack', href: '/' },
    { label: 'platform', href: '/' },
    { label: 'Builds', href: '/builds' },
    { label: `#${b.build_id}` },
  ]);

  const phases = b.timing.phases;
  view.innerHTML = `
    <div class="detail-head">
      <h1>#${b.build_id}</h1>
      <span class="status ${esc(b.status)}" id="detail-status">${esc(b.status)}</span>
      <div class="right">
        <button class="btn ghost">Download logs</button>
        <button class="btn">Re-run</button>
        <a class="btn" href="/builds${window.__lastInventoryQuery || ''}" data-link id="back-to-list">Back to inventory</a>
      </div>
    </div>

    <div class="cols">
      <div>
        <section class="card" style="margin-bottom:16px">
          <header><h3>Summary</h3><span class="sub">build ${b.build_id}</span></header>
          <div class="summary-grid">
            <div class="field"><div class="label">Branch</div><div class="value mono" id="detail-branch">${esc(b.branch)}</div></div>
            <div class="field"><div class="label">Status</div><div class="value"><span class="status ${esc(b.status)}">${esc(b.status)}</span></div></div>
            <div class="field"><div class="label">Started</div><div class="value">${esc(fmtStamp(b.started_at))}</div></div>
            <div class="field"><div class="label">Queue wait</div><div class="value">${b.queue_wait_sec}s</div></div>
            <div class="field"><div class="label">Runner</div><div class="value mono">${esc(b.runner)}</div></div>
            <div class="field"><div class="label">Test suite</div><div class="value">${esc(b.test_suite)}</div></div>
            <div class="field"><div class="label">Triggered by</div><div class="value">${esc(b.triggered_by)}</div></div>
            <div class="field"><div class="label">Trigger</div><div class="value">push</div></div>
          </div>
        </section>

        <section class="card" style="margin-bottom:16px">
          <header><h3>Stage timing</h3><span class="sub">hover the bar for exact wall clock</span></header>
          <div class="timing">
            <div class="legend">
              ${phases.map((p, i) => `<span><i style="background:${PHASE_COLORS[i]}"></i>${esc(p.name)} · ${p.pct}%</span>`).join('')}
            </div>
            <div class="phasebar" id="phasebar" data-build="${b.build_id}" tabindex="0" role="img"
                 aria-label="Stage timing breakdown for build ${b.build_id}">
              ${phases.map((p, i) => `<div class="phase-seg" data-phase="${esc(p.name)}" style="width:${p.pct}%;background:${PHASE_COLORS[i]}"></div>`).join('')}
            </div>
            <div class="axis"><span>start</span><span>relative stage share</span><span>finish</span></div>
            <p class="timing-note">Stage shares are relative. Wall clock is not printed here — hover the bar to read it.</p>
          </div>
        </section>

        <section class="card">
          <div class="accordion">
            <button class="acc-head" id="acc-commit-head" aria-expanded="false" aria-controls="acc-commit-body">
              <span class="caret">▸</span> Commit details <span class="hint">revision, author, message</span>
            </button>
            <div class="acc-body" id="acc-commit-body" hidden><div class="skeleton">Loading revision…</div></div>
          </div>
          <div class="accordion">
            <button class="acc-head" id="acc-log-head" aria-expanded="false" aria-controls="acc-log-body">
              <span class="caret">▸</span> Log tail <span class="hint">last lines from the runner</span>
            </button>
            <div class="acc-body" id="acc-log-body" hidden>
              <div class="log-lines">
                <div>[runner] pool ${esc(b.runner)} claimed job</div>
                <div>[setup] restoring cache key ${esc(b.test_suite)}-v3</div>
                <div>[${esc(b.test_suite)}] executing suite</div>
                <div>[artifacts] uploading junit report</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="card">
        <header><h3>Pipeline context</h3></header>
        <div class="body">
          <dl class="kv">
            <dt>Project</dt><dd>heliostack/platform</dd>
            <dt>Pipeline</dt><dd class="mono">ci.yaml</dd>
            <dt>Concurrency</dt><dd>group per branch</dd>
            <dt>Retention</dt><dd>90 days</dd>
          </dl>
          <p class="footnote">Wall clock lives in the stage timing chart. The full revision is inside the
          collapsed commit section.</p>
        </div>
      </section>
    </div>
  `;

  wireTiming(b.build_id);
  wireCommit(b.build_id);
  ready('build_detail');
}

function wireTiming(buildId) {
  const bar = document.getElementById('phasebar');
  let tip = null;
  let token = 0;

  async function show(evt) {
    const mine = ++token;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.id = 'timing-tooltip';
      tip.dataset.ttReady = 'false';
      tip.innerHTML = '<div class="tt-loading">Reading wall clock…</div>';
      document.body.appendChild(tip);
    }
    position(evt);

    const t = await api(`/api/builds/${buildId}/timing`);
    if (mine !== token || !tip) return;
    const mins = Math.floor(t.duration_sec / 60);
    const secs = t.duration_sec % 60;
    tip.innerHTML = `
      <div class="tt-title">Wall clock · build ${t.build_id}</div>
      <div class="tt-row"><span class="tt-k">Elapsed</span><span class="tt-v">${mins}m ${String(secs).padStart(2, '0')}s</span></div>
      <div class="tt-sep"></div>
      <div class="tt-row tt-total"><span class="tt-k">Duration</span><span class="tt-v tt-total-value">${t.duration_sec} s</span></div>`;
    tip.dataset.ttReady = 'true';
  }

  function position(evt) {
    if (!tip) return;
    const r = bar.getBoundingClientRect();
    const x = (evt && evt.clientX != null ? evt.clientX : r.left + r.width / 2);
    tip.style.left = `${Math.round(x + window.scrollX + 12)}px`;
    tip.style.top = `${Math.round(r.top + window.scrollY - 12)}px`;
  }

  function hide() {
    token++;
    if (tip) { tip.remove(); tip = null; }
  }

  bar.addEventListener('mouseenter', show);
  bar.addEventListener('mousemove', position);
  bar.addEventListener('mouseleave', hide);
  bar.addEventListener('focus', show);
  bar.addEventListener('blur', hide);
}

function wireCommit(buildId) {
  const head = document.getElementById('acc-commit-head');
  const body = document.getElementById('acc-commit-body');
  head.addEventListener('click', async () => {
    const opening = body.hidden;
    body.hidden = !opening;
    head.setAttribute('aria-expanded', String(opening));
    if (!opening || body.dataset.loaded) return;
    const c = await api(`/api/builds/${buildId}/commit`);
    body.innerHTML = `
      <div class="field" style="margin-bottom:9px">
        <div class="label">Revision</div>
        <code class="sha" id="commit-sha">${esc(c.commit_sha)}</code>
      </div>
      <dl class="kv">
        <dt>Message</dt><dd>${esc(c.commit_message)}</dd>
        <dt>Author</dt><dd>${esc(c.author)}</dd>
        <dt>Branch</dt><dd class="mono">${esc(c.branch)}</dd>
      </dl>`;
    body.dataset.loaded = '1';
  });

  const logHead = document.getElementById('acc-log-head');
  const logBody = document.getElementById('acc-log-body');
  logHead.addEventListener('click', () => {
    const opening = logBody.hidden;
    logBody.hidden = !opening;
    logHead.setAttribute('aria-expanded', String(opening));
  });
}

/* ------------------------------ placeholders ------------------------------ */

const PLACEHOLDERS = {
  branches: ['Branches', 'Branch-level policies and required checks.'],
  schedules: ['Schedules', 'Cron-triggered pipelines and their windows.'],
  runners: ['Runner fleet', 'Pools, lanes and autoscaling policy.'],
  caches: ['Caches', 'Restore keys, sizes and eviction.'],
  settings: ['Settings', 'Project configuration and integrations.'],
  audit: ['Audit log', 'Who changed what, and when.'],
};

async function renderPlaceholder(key) {
  busy(key);
  markNav(key);
  const [title, sub] = PLACEHOLDERS[key];
  setCrumbs([{ label: 'heliostack', href: '/' }, { label: 'platform', href: '/' }, { label: title }]);
  const fleet = await fleetWidget();
  view.innerHTML = `
    ${bannerHtml()}
    <div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
    <div class="cols">
      <section class="card"><div class="body"><div class="empty">Nothing configured yet for this project.</div></div></section>
      ${fleet}
    </div>`;
  wireBanner();
  ready(key);
}

/* ------------------------------ router ------------------------------ */

function go(url) {
  history.pushState({}, '', url);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

function route() {
  const url = new URL(window.location.href);
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const detail = p.match(/^\/builds\/(\d+)$/);
  if (p === '/' || p === '/overview') return renderOverview();
  if (p === '/builds') return renderBuilds(url.searchParams);
  if (detail) return renderDetail(detail[1]);
  const key = p.slice(1);
  if (PLACEHOLDERS[key]) return renderPlaceholder(key);
  busy('notfound');
  view.innerHTML = '<div class="empty">Page not found.</div>';
  ready('notfound');
}

route();

/* Meridian suite -- Studio, Taxonomy manager, Delivery Console.
   No build step: hash routing, fetch, string templates.
   Every field value rendered here comes from the read APIs, which project the
   corpus per surface. Nothing is cached across surfaces. */

'use strict';

const canvas = document.getElementById('canvas');
const panelEl = document.getElementById('panel');
const railEl = document.getElementById('rail');
const overlayEl = document.getElementById('overlay');

/* ------------------------------ helpers ------------------------------ */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function api(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.json();
}

function fmtDate(iso) {
  const d = new Date(iso);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return mon + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear() + ' ' + hh + ':' + mm;
}

function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return Math.round(n / 1e3) + ' KB';
}

const icons = {
  feather: '<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8 2 22"/>',
  tag: '<path d="M20.59 13.41 12 22l-9-9V3h10l7.59 7.59a2 2 0 0 1 0 2.82z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  dots: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>'
};

function svg(name, size) {
  return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
}

function chip(text, kind, glyph) {
  return '<span class="chip ' + (kind || '') + '">' +
    (glyph ? '<span class="glyph">' + glyph + '</span>' : '') + esc(text) + '</span>';
}

/* ------------------------------ routing ------------------------------ */

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/studio';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = {};
  new URLSearchParams(queryPart || '').forEach((v, k) => { query[k] = v; });
  return { segments, query, path: pathPart };
}

function go(path) {
  // Drop the ready flag synchronously, before the hash changes, so a caller that
  // waits on the flag can never observe the outgoing surface as ready.
  document.body.dataset.ready = '0';
  if (location.hash === '#' + path) render();
  else location.hash = path;
}

function setReady(pageId) {
  document.body.dataset.page = pageId;
  document.body.dataset.ready = '1';
}

/* ------------------------------ chrome ------------------------------ */

const APPS = [
  { key: 'studio', icon: 'feather', route: '/studio', label: 'Studio' },
  { key: 'taxonomy', icon: 'tag', route: '/taxonomy', label: 'Taxonomy' },
  { key: 'delivery', icon: 'send', route: '/delivery', label: 'Delivery Console' },
  { key: 'settings', icon: 'gear', route: '/settings', label: 'Settings' }
];

function renderRail(active) {
  railEl.innerHTML =
    '<div class="rail-mark">' + svg('feather', 15) + '</div>' +
    APPS.map((a) =>
      '<button class="rail-btn' + (a.key === active ? ' active' : '') + '" data-go="' + a.route +
      '" title="' + a.label + '" aria-label="' + a.label + '" data-testid="rail-' + a.key + '">' +
      svg(a.icon) + '</button>'
    ).join('') +
    '<div class="rail-spacer"></div>' +
    '<div class="rail-avatar" title="d.rossi">DR</div>';
}

function navItem(label, route, badge, active) {
  return '<a class="nav-item' + (active ? ' active' : '') + '" data-go="' + route + '" href="#' + route + '">' +
    '<span><span class="nav-dot">•</span> ' + esc(label) + '</span>' +
    (badge != null ? '<span class="badge">' + esc(badge) + '</span>' : '') + '</a>';
}

function renderPanel(app, activeRoute, counts) {
  counts = counts || {};
  let html = '';
  if (app === 'studio') {
    html =
      '<div class="panel-head"><h1>Studio</h1><span class="panel-sub">engineering-status</span></div>' +
      '<div class="nav-group">' +
        navItem('Overview', '/studio', null, activeRoute === '/studio') +
      '</div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Collection types</span><span>3</span></div>' +
        navItem('Build Reports', '/studio/build-reports', counts.buildReports, activeRoute.startsWith('/studio/build-reports')) +
        navItem('Incident Notes', '/studio/incident-notes', 0, activeRoute === '/studio/incident-notes') +
        navItem('Release Digests', '/studio/release-digests', 0, activeRoute === '/studio/release-digests') +
      '</div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Workspace</span></div>' +
        navItem('Media Library', '/studio/media', null, activeRoute === '/studio/media') +
        navItem('Localization', '/studio/localization', 5, activeRoute === '/studio/localization') +
        navItem('Inbox', '/studio/inbox', 2, activeRoute === '/studio/inbox') +
        navItem('Trash', '/studio/trash', 3, activeRoute === '/studio/trash') +
      '</div>' +
      '<div class="panel-foot"><div class="promo"><b>Meridian plugins</b>' +
        'Scheduled publishing, image transforms and 40 more integrations.' +
        '<div style="margin-top:8px"><a href="#/studio">Browse marketplace →</a></div></div></div>';
  } else if (app === 'taxonomy') {
    html =
      '<div class="panel-head"><h1>Taxonomy</h1><span class="panel-sub">manager</span></div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Vocabularies</span><span>3</span></div>' +
        navItem('Pipeline lines', '/taxonomy', counts.terms, activeRoute.startsWith('/taxonomy')) +
        navItem('Components', '/taxonomy/vocab/components', 0, false) +
        navItem('Severities', '/taxonomy/vocab/severities', 0, false) +
      '</div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Governance</span></div>' +
        navItem('Assignment rules', '/taxonomy/rules', null, false) +
        navItem('Merge history', '/taxonomy/history', null, false) +
      '</div>';
  } else if (app === 'delivery') {
    html =
      '<div class="panel-head"><h1>Delivery</h1><span class="panel-sub">read API</span></div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Explore</span></div>' +
        navItem('Query composer', '/delivery', null, activeRoute === '/delivery') +
        navItem('Content model', '/delivery/model', null, activeRoute === '/delivery/model') +
      '</div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Operations</span></div>' +
        navItem('Webhook log', '/delivery/webhooks', 12, activeRoute === '/delivery/webhooks') +
        navItem('API keys', '/delivery/keys', 2, activeRoute === '/delivery/keys') +
      '</div>';
  } else {
    html =
      '<div class="panel-head"><h1>Settings</h1></div>' +
      '<div class="nav-group"><div class="nav-group-title"><span>Project</span></div>' +
        navItem('General', '/settings', null, true) +
        navItem('Roles & permissions', '/settings/roles', null, false) +
        navItem('Audit trail', '/settings/audit', null, false) +
      '</div>';
  }
  panelEl.innerHTML = html;
}

function pageHead(opts) {
  return '<div class="page-head">' +
    (opts.back ? '<button class="back-btn" data-go="' + opts.back + '" aria-label="Back" data-testid="back">' + svg('back', 14) + '</button>' : '') +
    '<div class="grow">' +
      '<div class="eyebrow">' + esc(opts.eyebrow || '') + '</div>' +
      '<h2 class="page-title" data-testid="page-title">' + esc(opts.title) + '</h2>' +
      (opts.sub ? '<div class="page-sub' + (opts.subMono ? ' mono' : '') + '" data-testid="page-sub">' + opts.sub + '</div>' : '') +
    '</div>' +
    (opts.actions ? '<div class="head-actions">' + opts.actions + '</div>' : '') +
  '</div>';
}

function pager(info, hrefFor, testid) {
  const from = info.total === 0 ? 0 : info.page * info.pageSize + 1;
  const to = Math.min(info.total, (info.page + 1) * info.pageSize);
  return '<div class="pager" data-testid="' + (testid || 'pager') + '">' +
    '<span>' + from + '–' + to + ' of ' + info.total + '</span><span class="grow"></span>' +
    '<span style="font-family:var(--mono)">Page ' + (info.page + 1) + ' / ' + info.pageCount + '</span>' +
    '<button class="btn" data-go="' + hrefFor(info.page - 1) + '" data-testid="prev-page"' +
      (info.page <= 0 ? ' disabled' : '') + '>Previous</button>' +
    '<button class="btn" data-go="' + hrefFor(info.page + 1) + '" data-testid="next-page"' +
      (info.page >= info.pageCount - 1 ? ' disabled' : '') + '>Next</button>' +
  '</div>';
}

/* ------------------------------ Studio: dashboard ------------------------------ */

async function renderDashboard() {
  const d = await api('/api/studio/dashboard');
  const maxV = Math.max.apply(null, d.velocity.map((v) => v.entries));
  const bars = d.velocity.map((v) =>
    '<div class="bar' + (v.entries === maxV ? ' hi' : '') + '" style="height:' +
    Math.round((v.entries / maxV) * 100) + '%" title="' + v.day + '"></div>').join('');

  const byDay = {};
  d.velocity.forEach((v) => { byDay[v.day] = v.entries; });
  const first = new Date(d.velocity[0].day + 'T00:00:00Z');
  const monthStart = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const startDow = monthStart.getUTCDay();
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<div class="day out"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const key = monthStart.toISOString().slice(0, 8) + String(day).padStart(2, '0');
    const n = byDay[key] || 0;
    cells += '<div class="day' + (n ? ' has' : '') + '">' + day +
      (n ? '<span class="n">' + n + ' scheduled</span>' : '') + '</div>';
  }

  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      eyebrow: 'Workspace',
      title: 'Overview',
      sub: 'engineering-status · production environment'
    }) +
    '<div class="banner" data-testid="onboarding-banner">' +
      '<div class="grow"><b>Finish setting up the workspace</b>' +
      '<div class="steps">3 of 6 steps complete — invite an editor, connect a second environment, set a default locale.</div></div>' +
      '<button class="btn" data-dismiss-banner>Dismiss</button>' +
      '<button class="btn primary" data-go="/settings">Continue setup</button>' +
    '</div>' +
    '<div class="tiles">' +
      '<div class="tile"><div class="k">Entries</div><div class="v">' + d.publication.total + '</div><div class="n">across 3 collection types</div></div>' +
      '<div class="tile"><div class="k">Live on site</div><div class="v">' + d.publication.live + '</div><div class="n">served by the read API</div></div>' +
      '<div class="tile"><div class="k">Draft</div><div class="v">' + d.publication.draft + '</div><div class="n">not yet published</div></div>' +
      '<div class="tile"><div class="k">Contributors</div><div class="v">6</div><div class="n">with authoring rights</div></div>' +
    '</div>' +
    '<div class="section-heading">Authoring activity</div>' +
    '<div class="two-col">' +
      '<div class="card"><div class="card-title">Content velocity — entries edited per day</div>' +
        '<div class="card-pad"><div class="chart">' + bars + '</div>' +
        '<div class="chart-axis"><span>' + d.velocity[0].day + '</span><span>' +
          d.velocity[d.velocity.length - 1].day + '</span></div></div></div>' +
      '<div class="card"><div class="card-title">Recently edited</div>' +
        '<div class="recent-list">' + d.recent.map((r) =>
          '<div class="row" data-testid="recent-title">' + esc(r.title) + '</div>').join('') +
        '</div></div>' +
    '</div>' +
    '<div class="section-heading">Editorial calendar</div>' +
    '<div class="card"><div class="card-pad"><div class="cal">' +
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => '<div class="dow">' + x + '</div>').join('') +
      cells + '</div></div></div>' +
  '</div>';
  setReady('studio_dashboard');
}

/* ------------------------------ Studio: collection ------------------------------ */

async function renderCollection(query) {
  const page = Number(query.page) || 0;
  const q = query.q || '';
  const data = await api('/api/studio/collection?page=' + page + '&q=' + encodeURIComponent(q));
  const base = (p, qq) => '/studio/build-reports?page=' + p + (qq ? '&q=' + encodeURIComponent(qq) : '');

  const rows = data.rows.map((r) =>
    '<tr class="clickable" data-go="/studio/build-reports/' + encodeURIComponent(r.reference) + '" data-testid="row-' + r.reference + '">' +
      '<td class="col-check"><input type="checkbox" aria-label="select ' + r.reference + '" /></td>' +
      '<td class="mono" data-testid="cell-reference">' + esc(r.reference) + '</td>' +
      '<td class="truncate" data-testid="cell-title">' + esc(r.title) + '</td>' +
      '<td class="dim">' + esc(r.author) + '</td>' +
      '<td class="dim mono">' + esc(fmtDate(r.modifiedAt)) + '</td>' +
      '<td>' + (r.live ? chip('Live', 'pass', '●') : chip('Draft', '', '◔')) + '</td>' +
    '</tr>').join('');

  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      eyebrow: 'Content / Collection types',
      title: 'Build Reports',
      sub: data.total + ' entries found' + (q ? ' matching “' + esc(q) + '”' : ''),
      actions: '<button class="btn" data-testid="open-options">Options</button>' +
        '<button class="btn primary">Create new entry</button>'
    }) +
    '<div class="toolbar">' +
      '<div class="search-wrap">' + svg('search', 14) +
        '<input class="input" id="collection-search" data-testid="collection-search" placeholder="Search reference or title" value="' + esc(q) + '" />' +
      '</div>' +
      '<button class="btn" data-testid="collection-search-submit">Search</button>' +
      (q ? '<button class="btn tertiary" data-go="' + base(0, '') + '" data-testid="clear-search">Clear</button>' : '') +
      '<span class="grow"></span>' +
      '<button class="btn">Filters</button>' +
      '<select class="input" style="height:28px"><option>Default view</option><option>Last 7 days</option></select>' +
    '</div>' +
    '<div class="card">' +
      '<table class="grid" data-testid="collection-table">' +
      '<colgroup><col style="width:32px"/><col style="width:110px"/><col/><col style="width:150px"/><col style="width:180px"/><col style="width:110px"/></colgroup>' +
      '<thead><tr>' +
        '<th class="col-check"><input type="checkbox" aria-label="select all" /></th>' +
        '<th class="sortable mono">Reference <span class="caret">▲</span></th>' +
        '<th>Title</th><th>Authored by</th><th>Last modified</th><th>Publication</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="empty">No entries match this search</td></tr>') + '</tbody></table>' +
      pager(data, (p) => base(p, q), 'collection-pager') +
    '</div>' +
  '</div>';

  const input = document.getElementById('collection-search');
  const submit = () => go(base(0, input.value.trim()));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  canvas.querySelector('[data-testid="collection-search-submit"]').addEventListener('click', submit);
  setReady(q ? 'collection_list_searched' : 'collection_list');
}

/* ------------------------------ Studio: entry editor ------------------------------ */

async function renderEntry(reference) {
  const e = await api('/api/studio/entry/' + encodeURIComponent(reference));

  const seoChecks = e.seo.checks.map((c) =>
    '<div class="row"><span class="' + (c.pass ? 'ok' : 'no') + '">' + (c.pass ? '✓' : '○') + '</span>' + esc(c.label) + '</div>').join('');

  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      back: '/studio/build-reports',
      eyebrow: 'Content / Build Reports',
      title: e.title,
      sub: '<span data-testid="entry-reference">' + esc(e.reference) + '</span> · ' + esc(e.author) +
           ' · rev <span data-testid="source-chip-inline">' + esc(e.sourceChip) + '</span>',
      subMono: true,
      actions:
        '<button class="btn" data-go="/studio/build-reports/' + encodeURIComponent(e.reference) + '/preview" data-testid="preview-entry">' +
          svg('eye', 14) + 'Preview</button>' +
        '<div class="menu-wrap">' +
          '<button class="btn icon" data-testid="entry-actions" aria-label="Entry actions" aria-expanded="false">' + svg('dots', 14) + '</button>' +
        '</div>' +
        '<button class="btn primary">Save</button>'
    }) +
    '<div class="detail">' +
      '<div class="detail-main">' +
        '<div class="card"><div class="card-pad">' +
          '<div class="field-grid">' +
            '<div class="field"><label class="field-label">Title</label>' +
              '<input class="input" value="' + esc(e.title) + '" data-testid="field-title" /></div>' +
            '<div class="field"><label class="field-label">Slug</label>' +
              '<input class="input" value="' + esc(e.slug) + '" data-testid="field-slug" /></div>' +
            '<div class="field"><label class="field-label">Authored by</label>' +
              '<input class="input readonly" value="' + esc(e.author) + '" readonly /></div>' +
            '<div class="field"><label class="field-label">Reference</label>' +
              '<input class="input readonly" value="' + esc(e.reference) + '" readonly /></div>' +
          '</div>' +
          '<div style="margin-top:12px"><label class="field-label">Body</label>' +
            '<textarea class="body-editor" data-testid="field-body" spellcheck="false">' + esc(e.body) + '</textarea>' +
            '<div class="token-note">Template tokens are stored unresolved. They expand against the pipeline record when the entry is rendered for the site — use Preview to see the published text.</div>' +
          '</div>' +
        '</div></div>' +
        '<div class="card" data-testid="seo-card">' +
          '<div class="collapse-head" data-collapse="seo">' +
            '<div class="card-title">SEO readiness</div><span class="chev" data-chev="seo">▸</span></div>' +
          '<div class="card-pad" data-collapse-body="seo" hidden>' +
            '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">' +
              '<div class="score-ring">' + e.seo.score + '</div>' +
              '<div class="meta-note">Score is advisory. It is computed from the entry’s own copy and does not affect delivery.</div>' +
            '</div>' +
            '<div class="check-list">' + seoChecks + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="meta-rail">' +
        '<div class="card"><div class="card-title">Entry</div><div class="card-pad">' +
          '<div class="meta-row"><span class="k">Publication</span><span class="v">' +
            (e.live ? chip('Live', 'pass', '●') : chip('Draft', '', '◔')) + '</span></div>' +
          '<div class="meta-row"><span class="k">Created</span><span class="v mono">' + esc(fmtDate(e.createdAt)) + '</span></div>' +
          '<div class="meta-row"><span class="k">Modified</span><span class="v mono">' + esc(fmtDate(e.modifiedAt)) + '</span></div>' +
          '<button class="btn block" style="margin-top:4px">' + (e.live ? 'Unpublish' : 'Publish') + '</button>' +
          '<button class="btn block">Save draft</button>' +
        '</div></div>' +
        '<div class="card"><div class="card-title">Source</div><div class="card-pad">' +
          '<div class="meta-row"><span class="k">Revision</span><span class="v">' +
            '<span class="chip mono" data-testid="source-chip">' + esc(e.sourceChip) + '</span></span></div>' +
          '<div class="meta-note">Abbreviated for display. The full-length identifier travels with the publish bundle only.</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-title">Classification</div><div class="card-pad">' +
          '<div class="meta-note" data-testid="classification-note"><em>Not editable here.</em> Terms are assigned by the publish pipeline and governed in the Taxonomy manager; open a term there to see which entries carry it.</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-title">Workflow</div><div class="card-pad">' +
          '<div class="meta-note" data-testid="workflow-note"><em>Not shown here.</em> Workflow stage lives with the delivery layer. Compose a stage query in the Delivery Console to see which entries sit in a stage.</div>' +
        '</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';

  const actionsBtn = canvas.querySelector('[data-testid="entry-actions"]');
  actionsBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleEntryMenu(actionsBtn, e.reference);
  });
  setReady('entry_editor');
}

function toggleEntryMenu(btn, reference) {
  const wrap = btn.parentElement;
  const existing = wrap.querySelector('.menu');
  if (existing) { existing.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.dataset.testid = 'entry-menu';
  menu.innerHTML =
    '<button data-testid="menu-export">Export publish bundle</button>' +
    '<button data-testid="menu-duplicate">Duplicate entry</button>' +
    '<button data-testid="menu-copy-ref">Copy reference</button>' +
    '<div class="menu-sep"></div>' +
    '<button class="danger" data-testid="menu-trash">Move to trash</button>';
  wrap.appendChild(menu);
  btn.setAttribute('aria-expanded', 'true');
  menu.querySelector('[data-testid="menu-export"]').addEventListener('click', () => {
    menu.remove();
    btn.setAttribute('aria-expanded', 'false');
    exportBundle(reference);
  });
  menu.querySelectorAll('[data-testid="menu-duplicate"],[data-testid="menu-copy-ref"],[data-testid="menu-trash"]')
    .forEach((b) => b.addEventListener('click', () => { menu.remove(); btn.setAttribute('aria-expanded', 'false'); }));
  document.addEventListener('click', function closer(ev) {
    if (!wrap.contains(ev.target)) { menu.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', closer); }
  });
}

function exportBundle(reference) {
  const filename = reference + '.bundle.md';
  const a = document.createElement('a');
  a.href = '/api/studio/entry/' + encodeURIComponent(reference) + '/bundle';
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  overlayEl.innerHTML =
    '<div class="scrim" data-testid="export-dialog">' +
      '<div class="dialog">' +
        '<div class="dialog-head">Publish bundle exported</div>' +
        '<div class="dialog-body">The authoring source for this entry has been written to your downloads. ' +
          'Bundles cover a single entry and carry its frontmatter and unresolved body; derived metrics and ' +
          'relational fields are not part of the bundle format.' +
          '<div class="file-line" data-testid="export-filename">' + esc(filename) + '</div>' +
        '</div>' +
        '<div class="dialog-foot">' +
          '<button class="btn primary" data-testid="export-dismiss">Done</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.dataset.export = 'complete';
  overlayEl.querySelector('[data-testid="export-dismiss"]').addEventListener('click', () => {
    overlayEl.innerHTML = '';
    delete document.body.dataset.export;
  });
}

/* ------------------------------ Studio: site preview ------------------------------ */

function renderMarkdown(md) {
  return md.split(/\n{2,}/).map((block) => {
    const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');
    if (block.startsWith('## ')) return '<h2>' + inline(block.slice(3).trim()) + '</h2>';
    return '<p>' + inline(block).replace(/\n/g, ' ') + '</p>';
  }).join('');
}

async function renderPreview(reference) {
  const p = await api('/api/studio/entry/' + encodeURIComponent(reference) + '/preview');
  canvas.innerHTML =
    '<div class="preview-bar">' +
      '<button class="btn" data-go="/studio/build-reports/' + encodeURIComponent(reference) + '" data-testid="close-preview">' +
        svg('back', 14) + 'Back to editor</button>' +
      '<div class="preview-url">https://status.example.dev/build-reports/' + esc(p.slug) + '</div>' +
      '<button class="btn" disabled>Desktop</button>' +
      '<button class="btn" disabled>Mobile</button>' +
      '<span class="chip warn" style="margin-left:4px"><span class="glyph">◔</span>Rendered preview</span>' +
    '</div>' +
    '<div class="preview-stage"><article class="site" data-testid="preview-article">' +
      '<div class="site-mast">Engineering status · Build reports</div>' +
      '<h1 data-testid="preview-headline">' + esc(p.headline) + '</h1>' +
      '<div class="byline">By ' + esc(p.byline) + ' · published ' + esc(fmtDate(p.publishedAt)) + '</div>' +
      renderMarkdown(p.body) +
      '<div class="credit">Rendered from source revision <span class="mono" data-testid="preview-credit">' +
        esc(p.credit) + '</span> · reference <span class="mono">' + esc(p.reference) + '</span></div>' +
    '</article></div>';
  setReady('entry_preview');
}

/* ------------------------------ Taxonomy ------------------------------ */

async function renderTaxonomy() {
  const d = await api('/api/taxonomy/terms');
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      eyebrow: 'Taxonomy / Vocabularies',
      title: 'Pipeline lines',
      sub: d.terms.length + ' terms · applied to Build Reports at ingest',
      actions: '<button class="btn">Import terms</button><button class="btn primary">New term</button>'
    }) +
    '<div class="card"><table class="grid" data-testid="term-table"><thead><tr>' +
      '<th class="col-check"><input type="checkbox" aria-label="select all" /></th>' +
      '<th>Term</th><th class="mono">Slug</th><th style="text-align:right">Entries</th>' +
    '</tr></thead><tbody>' +
      d.terms.map((t) =>
        '<tr class="clickable" data-go="/taxonomy/' + encodeURIComponent(t.slug) + '" data-testid="term-row-' + t.slug + '">' +
          '<td class="col-check"><input type="checkbox" aria-label="select ' + esc(t.name) + '" /></td>' +
          '<td class="mono" data-testid="term-name">' + esc(t.name) + '</td>' +
          '<td class="mono dim">' + esc(t.slug) + '</td>' +
          '<td class="num">' + t.count + '</td>' +
        '</tr>').join('') +
    '</tbody></table></div>' +
    '<div class="section-heading">About this vocabulary</div>' +
    '<div class="card"><div class="card-pad meta-note">Terms are counted, not listed, on this screen. ' +
      'Open a term to see its membership roster.</div></div>' +
  '</div>';
  setReady('taxonomy_tree');
}

async function renderTerm(slug, query) {
  const page = Number(query.page) || 0;
  const t = await api('/api/taxonomy/terms/' + encodeURIComponent(slug) + '?page=' + page);
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      back: '/taxonomy',
      eyebrow: 'Taxonomy / Pipeline lines',
      title: t.name,
      sub: t.total + ' entries classified · slug <span style="font-family:var(--mono)">' + esc(t.slug) + '</span>',
      actions: '<button class="btn">Rename</button><button class="btn primary">Save term</button>'
    }) +
    '<div class="detail"><div class="detail-main">' +
      '<div class="card"><div class="card-title">Membership</div>' +
        '<table class="grid" data-testid="member-table">' +
          '<colgroup><col style="width:130px"/><col/></colgroup>' +
          '<thead><tr>' +
          '<th class="mono">Reference</th><th>Title</th>' +
        '</tr></thead><tbody>' +
          t.members.map((m) =>
            '<tr data-testid="member-row"><td class="mono" data-testid="member-reference">' + esc(m.reference) + '</td>' +
            '<td class="truncate">' + esc(m.title) + '</td></tr>').join('') +
        '</tbody></table>' +
        pager({ total: t.total, page: t.page, pageCount: t.pageCount, pageSize: t.pageSize },
          (p) => '/taxonomy/' + encodeURIComponent(slug) + '?page=' + p, 'member-pager') +
      '</div>' +
    '</div>' +
    '<div class="meta-rail">' +
      '<div class="card"><div class="card-title">Term</div><div class="card-pad">' +
        '<div class="meta-row"><span class="k">Entries</span><span class="v mono">' + t.total + '</span></div>' +
        '<div class="meta-row"><span class="k">Vocabulary</span><span class="v">Pipeline lines</span></div>' +
        '<div class="meta-row"><span class="k">Assignment</span><span class="v">At ingest</span></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-title">Description</div><div class="card-pad">' +
        '<div class="meta-note">' + esc(t.description) + '</div>' +
      '</div></div>' +
    '</div></div>' +
  '</div>';
  setReady('term_detail');
}

/* ------------------------------ Delivery Console ------------------------------ */

async function renderDelivery(query) {
  const schema = await api('/api/delivery/schema');
  const stage = query.stage || '';
  const since = query.since || '';
  const run = query.run === '1' && stage;
  const page = Number(query.page) || 0;

  const schemaRows = schema.fields.map((f) =>
    '<tr><td class="mono">' + esc(f.name) + '</td><td class="mono dim">' + esc(f.type) + '</td>' +
    '<td>' + (f.visibility === 'public'
      ? chip('public', 'pass', '✓')
      : chip('private', '', '✕')) +
      (f.note ? ' <span class="dim" style="font-size:12px">' + esc(f.note) + '</span>' : '') + '</td>' +
    '<td>' + (f.queryable ? chip('filterable', 'warn', '●') : '<span class="dim">—</span>') + '</td></tr>').join('');

  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({
      eyebrow: 'Delivery / Read API',
      title: 'Query composer',
      sub: 'GET /content/v2/build_report · environment <span style="font-family:var(--mono)">production</span>',
      actions: '<button class="btn" data-go="/delivery/webhooks">Webhook log</button>'
    }) +
    '<div class="card"><div class="card-title">Content model — build_report</div>' +
      '<table class="grid" data-testid="schema-table">' +
      '<colgroup><col style="width:200px"/><col style="width:120px"/><col/><col style="width:130px"/></colgroup>' +
      '<thead><tr>' +
        '<th>Field</th><th>Type</th><th>Visibility</th><th>Query</th></tr></thead>' +
        '<tbody>' + schemaRows + '</tbody></table>' +
      '<div class="card-pad"><div class="schema-note">Private fields are stripped from every response; they exist only in the authoring layer. ' +
        'Classification is resolved at publish time and is therefore not a queryable dimension.</div></div>' +
    '</div>' +

    '<div class="section-heading">Compose</div>' +
    '<div class="card"><div class="card-pad">' +
      '<div class="composer">' +
        '<div class="field"><label class="field-label" for="stage-select">Workflow stage</label>' +
          '<select class="input" id="stage-select" data-testid="stage-select">' +
            '<option value="">Select a stage…</option>' +
            schema.stages.map((s) => '<option value="' + esc(s) + '"' + (s === stage ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
          '</select>' +
          '<div class="helper">Required. The composer returns nothing until a stage is chosen.</div>' +
        '</div>' +
        '<div class="field"><label class="field-label" for="since-input">Modified on or after</label>' +
          '<input class="input" id="since-input" data-testid="since-input" placeholder="YYYY-MM-DD" value="' + esc(since) + '" />' +
          '<div class="helper">Optional.</div>' +
        '</div>' +
        '<div class="field" style="min-width:0">' +
          '<button class="btn primary" id="run-query" data-testid="run-query">Run query</button>' +
        '</div>' +
      '</div>' +
      '<div class="query-preview" data-testid="query-preview">GET /content/v2/build_report?filter[workflow_stage]=' +
        esc(stage || '‹unset›') + (since ? '&filter[modified_at][gte]=' + esc(since) : '') + '&page=' + page + '</div>' +
    '</div></div>' +

    '<div class="section-heading">Response</div>' +
    '<div class="card" id="result-area" data-testid="result-area" data-query-state="' + (run ? 'running' : 'empty') + '">' +
      (run ? '<div class="spinner-line" data-testid="result-pending">Running query…</div>'
           : '<div class="empty" data-testid="result-empty">No query has been run in this session</div>') +
    '</div>' +
  '</div>';

  const runBtn = document.getElementById('run-query');
  runBtn.addEventListener('click', () => {
    const s = document.getElementById('stage-select').value;
    const sc = document.getElementById('since-input').value.trim();
    if (!s) return;
    go('/delivery?stage=' + encodeURIComponent(s) + (sc ? '&since=' + encodeURIComponent(sc) : '') + '&run=1&page=0');
  });

  if (run) {
    const res = await api('/api/delivery/query?stage=' + encodeURIComponent(stage) +
      (since ? '&since=' + encodeURIComponent(since) : '') + '&page=' + page);
    const area = document.getElementById('result-area');
    if (!area) return;
    const href = (p) => '/delivery?stage=' + encodeURIComponent(stage) +
      (since ? '&since=' + encodeURIComponent(since) : '') + '&run=1&page=' + p;
    area.innerHTML =
      '<div class="result-head"><span data-testid="result-total">200 OK · ' + res.total + ' matches</span>' +
        '<span>projection: ' + res.projection.join(', ') + '</span>' +
        '<span>took ' + res.took_ms + 'ms</span></div>' +
      '<table class="grid" data-testid="result-table">' +
      '<colgroup><col style="width:130px"/><col style="width:40%"/><col/></colgroup>' +
      '<thead><tr>' +
        '<th class="mono">Reference</th><th class="mono">Slug</th><th>Title</th>' +
      '</tr></thead><tbody>' +
        res.data.map((r) =>
          '<tr data-testid="result-row"><td class="mono" data-testid="result-reference">' + esc(r.reference) + '</td>' +
          '<td class="mono dim truncate">' + esc(r.slug) + '</td>' +
          '<td class="truncate">' + esc(r.title) + '</td></tr>').join('') +
      '</tbody></table>' +
      pager({ total: res.total, page: res.page, pageCount: res.pageCount, pageSize: res.pageSize }, href, 'result-pager');
    area.dataset.queryState = 'ready';
  }
  setReady(run ? 'delivery_query_result' : 'delivery_query');
}

async function renderWebhooks() {
  const d = await api('/api/delivery/webhooks');
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Delivery / Operations', title: 'Webhook log', sub: d.deliveries.length + ' recent deliveries' }) +
    '<div class="card"><table class="grid"><thead><tr>' +
      '<th class="mono">Delivery</th><th>Event</th><th>Endpoint</th><th style="text-align:right">Code</th><th style="text-align:right">Time</th><th>At</th>' +
    '</tr></thead><tbody>' + d.deliveries.map((x) =>
      '<tr><td class="mono">' + esc(x.id) + '</td><td class="mono dim">' + esc(x.event) + '</td>' +
      '<td class="mono dim truncate">' + esc(x.url || x.endpoint) + '</td>' +
      '<td class="num">' + (x.code === 200 ? chip('200', 'pass', '✓') : chip('500', 'fail', '✕')) + '</td>' +
      '<td class="num">' + x.ms + 'ms</td><td class="dim mono">' + esc(x.at) + '</td></tr>').join('') +
    '</tbody></table></div></div>';
  setReady('delivery_webhooks');
}

function renderKeys() {
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Delivery / Operations', title: 'API keys', sub: '2 active keys' }) +
    '<div class="card"><table class="grid"><thead><tr><th>Label</th><th class="mono">Prefix</th><th>Scope</th><th>Created</th></tr></thead>' +
    '<tbody>' +
      '<tr><td>Status site (SSG)</td><td class="mono">mk_live_7f2a…</td><td>read</td><td class="dim mono">2026-03-04</td></tr>' +
      '<tr><td>Search indexer</td><td class="mono">mk_live_c081…</td><td>read</td><td class="dim mono">2026-05-19</td></tr>' +
    '</tbody></table></div>' +
    '<div class="section-heading">Rotation</div>' +
    '<div class="card"><div class="card-pad meta-note">Keys are scoped to the public projection. A key cannot widen a response beyond the fields marked public in the content model.</div></div>' +
  '</div>';
  setReady('delivery_keys');
}

/* ------------------------------ chrome pages ------------------------------ */

async function renderMedia() {
  const d = await api('/api/chrome/media');
  const pct = Math.round((d.quota.usedBytes / d.quota.limitBytes) * 100);
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Workspace', title: 'Media Library', sub: d.files.length + ' assets',
      actions: '<button class="btn">New folder</button><button class="btn primary">Upload</button>' }) +
    '<div class="detail"><div class="detail-main"><div class="card">' +
      '<table class="grid"><thead><tr><th class="col-check"><input type="checkbox" aria-label="select all" /></th>' +
      '<th>Name</th><th>Folder</th><th class="mono">Type</th><th style="text-align:right">Size</th><th>Uploaded</th></tr></thead><tbody>' +
      d.files.map((f) => '<tr class="clickable"><td class="col-check"><input type="checkbox" aria-label="select ' + esc(f.name) + '" /></td>' +
        '<td class="mono">' + esc(f.name) + '</td><td class="dim">' + esc(f.folder) + '</td>' +
        '<td class="mono dim">' + esc(f.type) + '</td><td class="num">' + fmtBytes(f.bytes) + '</td>' +
        '<td class="dim mono">' + esc(fmtDate(f.uploadedAt)) + '</td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="meta-rail"><div class="card"><div class="card-title">Storage</div><div class="card-pad">' +
        '<div class="meta-row"><span class="k">Used</span><span class="v mono">' + fmtBytes(d.quota.usedBytes) + '</span></div>' +
        '<div class="meter"><span style="width:' + Math.max(pct, 2) + '%"></span></div>' +
        '<div class="meta-note">' + pct + '% of ' + fmtBytes(d.quota.limitBytes) + ' used on the project plan.</div>' +
      '</div></div></div></div></div>';
  setReady('media_library');
}

async function renderLocalization() {
  const d = await api('/api/chrome/localization');
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Workspace', title: 'Localization', sub: d.locales.length + ' locales · scope: ' + d.scope.join(', ') }) +
    '<div class="card"><table class="grid"><thead><tr><th>Locale</th><th class="mono">Code</th>' +
    '<th style="text-align:right">Translated</th><th style="text-align:right">Outdated</th><th>Default</th></tr></thead><tbody>' +
    d.locales.map((l) => '<tr><td>' + esc(l.name) + '</td><td class="mono dim">' + esc(l.code) + '</td>' +
      '<td class="num">' + l.translated + '%</td><td class="num">' + l.outdated + '</td>' +
      '<td>' + (l.isDefault ? chip('default', 'pass', '●') : '<span class="dim">—</span>') + '</td></tr>').join('') +
    '</tbody></table></div>' +
    '<div class="section-heading">Note</div><div class="card"><div class="card-pad meta-note">' +
    'Build Reports are authored in the default locale only; the pipeline does not emit translated variants.</div></div></div>';
  setReady('localization');
}

async function renderInbox() {
  const d = await api('/api/chrome/inbox');
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Workspace', title: 'Inbox', sub: d.threads.filter((t) => t.unread).length + ' unread threads' }) +
    '<div class="card"><table class="grid"><thead><tr><th>Subject</th><th>From</th><th>Updated</th><th></th></tr></thead><tbody>' +
    d.threads.map((t) => '<tr class="clickable"><td>' + esc(t.subject) + '</td><td class="dim">' + esc(t.from) + '</td>' +
      '<td class="dim mono">' + esc(fmtDate(t.at)) + '</td><td>' + (t.unread ? chip('unread', 'warn', '●') : '') + '</td></tr>').join('') +
    '</tbody></table></div></div>';
  setReady('inbox');
}

async function renderTrash() {
  const d = await api('/api/chrome/trash');
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Workspace', title: 'Trash', sub: d.items.length + ' soft-deleted entries · purged after 30 days' }) +
    '<div class="card"><table class="grid"><thead><tr><th>Title</th><th>Collection</th><th>Deleted by</th><th>Deleted</th></tr></thead><tbody>' +
    d.items.map((i) => '<tr><td>' + esc(i.title) + '</td><td class="dim">' + esc(i.collection) + '</td>' +
      '<td class="dim">' + esc(i.deletedBy) + '</td><td class="dim mono">' + esc(fmtDate(i.deletedAt)) + '</td></tr>').join('') +
    '</tbody></table></div></div>';
  setReady('trash');
}

function renderEmptyCollection(name) {
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Content / Collection types', title: name, sub: '0 entries found',
      actions: '<button class="btn primary">Create new entry</button>' }) +
    '<div class="card"><div class="empty">No entries have been created in this collection</div></div></div>';
  setReady('empty_collection');
}

function renderSettings() {
  canvas.innerHTML = '<div class="canvas-inner">' +
    pageHead({ eyebrow: 'Project', title: 'General', sub: 'engineering-status' }) +
    '<div class="card"><div class="card-pad"><div class="field-grid">' +
      '<div class="field"><label class="field-label">Project name</label><input class="input" value="engineering-status" /></div>' +
      '<div class="field"><label class="field-label">Default locale</label><input class="input readonly" value="English (en)" readonly /></div>' +
      '<div class="field"><label class="field-label">Delivery domain</label><input class="input" value="status.example.dev" /></div>' +
      '<div class="field"><label class="field-label">Timezone</label><input class="input" value="UTC" /></div>' +
    '</div></div></div></div>';
  setReady('settings');
}

/* ------------------------------ render loop ------------------------------ */

async function render() {
  document.body.dataset.ready = '0';
  overlayEl.innerHTML = '';
  const { segments, query, path } = parseHash();
  const app = segments[0] === 'taxonomy' ? 'taxonomy'
    : segments[0] === 'delivery' ? 'delivery'
    : segments[0] === 'settings' ? 'settings' : 'studio';

  renderRail(app);
  let counts = {};
  try {
    if (app === 'studio') counts.buildReports = (await api('/api/studio/dashboard')).collections[0].count;
    if (app === 'taxonomy') counts.terms = (await api('/api/taxonomy/terms')).terms.length;
  } catch (e) { /* panel badges are decorative */ }
  renderPanel(app, path, counts);
  canvas.scrollTop = 0;

  try {
    if (app === 'studio') {
      if (segments[1] === 'build-reports') {
        if (segments[2] && segments[3] === 'preview') await renderPreview(decodeURIComponent(segments[2]));
        else if (segments[2]) await renderEntry(decodeURIComponent(segments[2]));
        else await renderCollection(query);
      } else if (segments[1] === 'media') await renderMedia();
      else if (segments[1] === 'localization') await renderLocalization();
      else if (segments[1] === 'inbox') await renderInbox();
      else if (segments[1] === 'trash') await renderTrash();
      else if (segments[1] === 'incident-notes') renderEmptyCollection('Incident Notes');
      else if (segments[1] === 'release-digests') renderEmptyCollection('Release Digests');
      else await renderDashboard();
    } else if (app === 'taxonomy') {
      if (segments[1] && segments[1] !== 'vocab' && segments[1] !== 'rules' && segments[1] !== 'history') {
        await renderTerm(decodeURIComponent(segments[1]), query);
      } else await renderTaxonomy();
    } else if (app === 'delivery') {
      if (segments[1] === 'webhooks') await renderWebhooks();
      else if (segments[1] === 'keys') renderKeys();
      else await renderDelivery(query);
    } else {
      renderSettings();
    }
  } catch (err) {
    canvas.innerHTML = '<div class="canvas-inner">' +
      pageHead({ eyebrow: 'Error', title: 'Something went wrong' }) +
      '<div class="card"><div class="card-pad meta-note">' + esc(err.message) + '</div></div></div>';
    setReady('error');
  }
}

document.addEventListener('click', (ev) => {
  const target = ev.target.closest('[data-go]');
  if (target) {
    if (target.hasAttribute('disabled')) { ev.preventDefault(); return; }
    ev.preventDefault();
    go(target.getAttribute('data-go'));
    return;
  }
  const dismiss = ev.target.closest('[data-dismiss-banner]');
  if (dismiss) { dismiss.closest('.banner').remove(); return; }
  const collapse = ev.target.closest('[data-collapse]');
  if (collapse) {
    const key = collapse.getAttribute('data-collapse');
    const body = document.querySelector('[data-collapse-body="' + key + '"]');
    const chev = document.querySelector('[data-chev="' + key + '"]');
    if (body) { body.hidden = !body.hidden; chev.textContent = body.hidden ? '▸' : '▾'; }
  }
});

window.addEventListener('hashchange', render);
render();

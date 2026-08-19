'use strict';
/* Foliant Content Library — client shell.
   Nothing here holds library data: every surface fetches its own payload,
   and each payload carries only what that surface may show. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
};
const qp = () => new URLSearchParams(location.search);
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();

const canvas = () => $('#canvas');
const setSurface = (id, html) => {
  const c = canvas();
  c.dataset.surface = id;
  c.innerHTML = html;
};

/* ---------------- navigation rail ---------------- */
const RAIL = [
  { href: '/', label: 'Home', icon: 'M8 1.5 1.5 7v7.5h5v-4h3v4h5V7L8 1.5Z' },
  { href: '/documents', label: 'Documents', icon: 'M2 2.5h4.5l1.5 2H14v9H2v-11Z' },
  { href: '/governance', label: 'Governance library', icon: 'M8 1.5 14 4v3.5c0 3.6-2.4 6.2-6 7-3.6-.8-6-3.4-6-7V4l6-2.5Z' },
  { href: '/approvals', label: 'Approvals', icon: 'M3 2.5h10v11H3v-11Zm2.5 5 2 2 3.5-4', badge: 6 },
  { href: '/settings', label: 'Library administration', icon: 'M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Zm6 2.5-1.4-.4-.4-1 .7-1.3-1.7-1.7-1.3.7-1-.4L8.5 2h-1l-.4 1.4-1 .4-1.3-.7-1.7 1.7.7 1.3-.4 1L2 7.5v1l1.4.4.4 1-.7 1.3 1.7 1.7 1.3-.7 1 .4.4 1.4h1l.4-1.4 1-.4 1.3.7 1.7-1.7-.7-1.3.4-1L14 8.5v-.5Z' },
  { href: '/developer', label: 'Developer center', icon: 'M5.5 4 1.5 8l4 4 .8-.8L3.1 8l3.2-3.2L5.5 4Zm5 0-.8.8L12.9 8l-3.2 3.2.8.8 4-4-4-4Z' },
];

function renderRail() {
  const here = location.pathname;
  const isActive = (href) => (href === '/' ? here === '/' : here === href || here.startsWith(href + '/'));
  $('#rail').innerHTML = `
    <div class="rail-group">
      ${RAIL.map(
        (r) => `<a href="${r.href}" class="${isActive(r.href) ? 'active' : ''}">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${r.icon}"/></svg>
          <span>${r.label}</span>${r.badge ? `<span class="badge">${r.badge}</span>` : ''}
        </a>`
      ).join('')}
    </div>
    <div class="rail-group">
      <div class="rail-head">SITE</div>
      <a href="/site-contents"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3h12v2H2V3Zm0 4h12v2H2V7Zm0 4h12v2H2v-2Z"/></svg><span>Site contents</span></a>
      <a href="/shared"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M11 2a2.5 2.5 0 1 1-1.9 4.1L6.4 7.6a2.5 2.5 0 0 1 0 .8l2.7 1.5A2.5 2.5 0 1 1 8.5 12l-2.7-1.5a2.5 2.5 0 1 1 0-5L8.5 4A2.5 2.5 0 0 1 11 2Z"/></svg><span>Shared with us</span></a>
    </div>
    <div class="rail-foot">
      <a href="/recycle-bin"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 2h4l.5 1H14v1H2V3h3.5L6 2ZM3.5 5h9l-.7 9h-7.6l-.7-9Z"/></svg><span>Recycle bin</span></a>
    </div>`;
}

/* ---------------- shared overlay plumbing ---------------- */
function closeOverlays() {
  $$('.popover,.dialog').forEach((n) => n.remove());
  $('#scrim').hidden = true;
}
$('#scrim').addEventListener('click', closeOverlays);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlays();
});

function openDialog(html, opts = {}) {
  closeOverlays();
  const d = document.createElement('div');
  d.className = 'dialog' + (opts.wide ? ' wide' : '');
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  if (opts.surface) d.dataset.surface = opts.surface;
  d.innerHTML = html;
  document.body.appendChild(d);
  $('#scrim').hidden = false;
  const closeBtn = $('.dlg-close', d);
  if (closeBtn) closeBtn.addEventListener('click', closeOverlays);
  return d;
}

function openPopover(anchor, html, opts = {}) {
  closeOverlays();
  const p = document.createElement('div');
  p.className = 'popover';
  if (opts.surface) p.dataset.surface = opts.surface;
  p.innerHTML = html;
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  p.style.top = `${window.scrollY + r.bottom + 4}px`;
  p.style.left = `${window.scrollX + r.left}px`;
  return p;
}

/* ---------------- keyboard shortcuts overlay ---------------- */
$('#open-shortcuts').addEventListener('click', async () => {
  const data = await j('/api/shortcuts');
  openDialog(
    `<button class="dlg-close" aria-label="Close">✕</button>
     <h2>Keyboard shortcuts</h2>
     <p class="dlg-sub">Accessibility bindings published by this workspace.</p>
     <div style="margin-top:20px" data-testid="shortcuts-body">
       ${data.groups
         .map(
           (g) => `<div class="sc-group">
             <h3>${esc(g.title.toUpperCase())}</h3>
             ${g.bindings
               .map(
                 (b) => `<div class="kbdrow"${b.id ? ` data-binding="${esc(b.id)}"` : ''}>
                   <span>${esc(b.action)}</span>
                   <span class="keys">${b.keys.map((k) => `<kbd class="key">${esc(k)}</kbd>`).join('')}</span>
                 </div>`
               )
               .join('')}
           </div>`
         )
         .join('')}
     </div>`,
    { surface: 'shortcuts_overlay' }
  );
});

$('#whats-new').addEventListener('click', () =>
  openDialog(
    `<button class="dlg-close" aria-label="Close">✕</button>
     <h2>What’s new in Foliant 6.3</h2>
     <p class="dlg-sub">Released 12 May 2026</p>
     <ul style="font-size:13px;color:#242424;padding-left:18px;margin-top:16px">
       <li>Responsive preview presets in the library command bar.</li>
       <li>Transfer monitor now reports the target node for each queued item.</li>
       <li>Governance previewer supports paged rendering of long documents.</li>
     </ul>
     <div class="footer"><button class="btn secondary dlg-close-2">Close</button></div>`
  ).addEventListener('click', (e) => {
    if (e.target.classList.contains('dlg-close-2')) closeOverlays();
  })
);

/* ---------------- crumbs ---------------- */
const crumbs = (parts) =>
  `<div class="crumbs">${parts
    .map((p, i) =>
      i === parts.length - 1
        ? `<span class="here">${esc(p.label)}</span>`
        : `<a href="${p.href}">${esc(p.label)}</a><span class="sep">›</span>`
    )
    .join('')}</div>`;

/* ================= library_home ================= */
async function viewHome() {
  const d = await j('/api/home');
  const pct = Math.round((d.quota.used_gb / d.quota.plan_gb) * 100);
  setSurface(
    'library_home',
    `<div class="content">
      ${crumbs([{ label: 'Northwind Group' }])}
      <h1 class="page-title">Engineering site</h1>
      <p class="page-sub">Workspace home · Foliant Content Library 6.3</p>

      <div class="banner" data-testid="retention-banner">
        <svg viewBox="0 0 16 16" width="16" height="16" style="fill:#0F6CBD;margin-top:2px"><path d="M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5ZM7.4 4.5h1.2v1.2H7.4V4.5Zm0 2.4h1.2v4.6H7.4V6.9Z"/></svg>
        <span>${esc(d.retention_banner)}</span>
        <button type="button" aria-label="Dismiss" onclick="this.closest('.banner').remove()">✕</button>
      </div>

      <div class="cards">
        <div class="card">
          <h3>Storage</h3>
          <div class="stat">${d.quota.used_gb.toLocaleString('en-GB')} GB</div>
          <div class="meter"><i style="width:${pct}%"></i></div>
          <div class="small muted">of ${d.quota.plan_gb.toLocaleString('en-GB')} GB plan allowance · ▲ ${d.quota.trend_pct}% this month</div>
        </div>
        <div class="card">
          <h3>Search index</h3>
          <div class="small muted">Last rebuilt</div>
          <div style="font-size:14px;margin-top:2px">${esc(fmtDateTime(d.index.rebuilt))}</div>
          <div class="small muted" style="margin-top:12px">${d.index.queued} items queued for indexing</div>
        </div>
        <div class="card">
          <h3>At a glance</h3>
          <div class="kv" style="gap:12px">
            ${d.counters
              .map((c) => `<div><div class="k">${esc(c.label)}</div><div class="v" data-counter="${esc(c.label)}">${c.value}</div></div>`)
              .join('')}
          </div>
        </div>
        <div class="card">
          <h3>Licensing</h3>
          <div class="small muted">Seats in use</div>
          <div class="stat">${d.seats.active} / ${d.seats.provisioned}</div>
          <div class="small muted">Provisioned under Enterprise agreement</div>
        </div>
      </div>

      <div class="split" style="margin-top:32px">
        <div class="main">
          <div class="section"><h2>Recent activity</h2>
            <ul class="feed">
              ${d.activity
                .map((a) => `<li><span><b style="font-weight:600">${esc(a.actor)}</b> ${esc(a.verb)}</span><span class="when">${esc(a.when)}</span></li>`)
                .join('')}
            </ul>
          </div>
          <div class="section"><h2>Connected apps</h2>
            <div class="cards" style="margin-top:0">
              ${d.apps
                .map(
                  (a) => `<div class="card"><h3>${esc(a.name)}</h3><div class="small muted">${esc(a.detail)}</div>
                    <div style="margin-top:12px"><span class="chip ${a.state === 'Connected' ? 'ok' : ''}"><span class="dot"></span>${esc(a.state)}</span></div></div>`
                )
                .join('')}
            </div>
          </div>
        </div>
        <div class="side">
          <h3>QUICK LINKS</h3>
          <ul>
            <li><a href="/documents">Shared document library</a></li>
            <li><a href="/governance">Governance library</a></li>
            <li><a href="/settings">Library administration</a></li>
            <li><a href="/developer">Integration developer center</a></li>
          </ul>
          <h3>APPROVALS</h3>
          <ul>
            <li>${d.approvals_unread} requests awaiting your review</li>
            <li class="muted">None relate to ingestion</li>
          </ul>
        </div>
      </div>
    </div>`
  );
}

/* ================= document_grid (+ properties panel) ================= */
async function viewDocuments(openId) {
  const params = qp();
  const page = params.get('page') || '1';
  const sort = params.get('sort') || 'modified';
  const d = await j(`/api/documents?page=${encodeURIComponent(page)}&sort=${encodeURIComponent(sort)}`);
  const link = (p, s) => `/documents?page=${p}&sort=${s}`;
  const propsHref = (id) => `/documents/properties/${encodeURIComponent(id)}?page=${d.page}&sort=${d.sort.id}`;

  const rows = d.rows
    .map(
      (r) => `<tr data-doc-id="${esc(r.document_id)}" class="${openId === r.document_id ? 'row-selected' : ''}">
        <td class="c-check"><input type="checkbox" aria-label="Select ${esc(r.name)}"></td>
        <td>
          <span class="doc-cell">
            <span class="glyph ${esc(extOf(r.name))}">${esc(extOf(r.name))}</span>
            <a class="doc-name" data-col="name" href="${propsHref(r.document_id)}">${esc(r.name)}</a>
          </span>
        </td>
        <td data-col="label">${esc(r.label)}</td>
        <td data-col="document_id" class="mono muted">${esc(r.document_id)}</td>
        <td class="small muted">${esc(fmtDate(r.modified_at))}</td>
        <td class="small">${esc(r.modified_by)}</td>
        <td class="small muted">${esc(r.location)}</td>
        <td class="small muted">${esc(r.version)}</td>
        <td><span class="chip">${esc(r.permission)}</span></td>
        <td style="text-align:right">
          <a class="cmd" data-testid="open-properties" href="${propsHref(r.document_id)}" title="Details">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5Zm-.6 3h1.2v1.2H7.4V4.5Zm0 2.4h1.2v4.6H7.4V6.9Z"/></svg>
          </a>
        </td>
      </tr>`
    )
    .join('');

  const listing = `
    ${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Documents' }])}
    <h1 class="page-title">Documents</h1>
    <p class="page-sub">Shared document library</p>

    <div class="cmdbar">
      <button class="cmd" type="button"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 3v10M3 8h10" stroke="#616161" stroke-width="1.5" fill="none"/></svg>New</button>
      <button class="cmd" type="button" data-testid="open-tray">
        <svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2 4 6h2.5v5h3V6H12L8 2ZM3 13h10v1H3v-1Z"/></svg>
        Upload<span class="count" data-testid="tray-count-hint"></span>
      </button>
      <button class="cmd" type="button"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2a6 6 0 1 0 5.7 4h-1.1A5 5 0 1 1 8 3v2l3-2.5L8 0v2Z"/></svg>Sync</button>
      <span class="divider"></span>
      <a class="cmd" data-testid="open-transfers" href="/documents/transfers">
        <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 4h12v1.5H2V4Zm0 3.2h9V8.8H2V7.2ZM2 10.5h6V12H2v-1.5Z"/></svg>
        Transfer monitor
      </a>
      <button class="cmd" type="button" data-testid="open-presets" aria-expanded="false">
        <svg viewBox="0 0 16 16" width="16" height="16"><path d="M1.5 3h9v8h-9V3Zm10.5 1.5h2.5v7H12v-7Z"/></svg>
        Responsive preview ▾
      </button>
      <span class="spacer"></span>
      <a class="cmd" href="${link(1, d.next_sort)}" data-testid="cycle-sort">
        <svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2 1.5 5h5L4 2Zm0 12 2.5-3h-5L4 14Zm4-9h6v1.5H8V5Zm0 4h6v1.5H8V9Z"/></svg>
        ${esc(d.sort.column)} ▾
      </a>
      <button class="cmd" type="button" title="Show or hide columns"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 3h4v10H2V3Zm5 0h4v10H7V3Zm5 0h2v10h-2V3Z"/></svg></button>
    </div>

    <table class="grid" data-testid="documents-grid">
      <thead>
        <tr>
          <th class="c-check"><input type="checkbox" aria-label="Select all on this page"></th>
          <th><button type="button" onclick="location.href='${link(1, 'modified')}'">Name</button></th>
          <th>Display name</th>
          <th>Item ID</th>
          <th><a href="${link(1, 'modified')}">Modified${d.sort.id === 'modified' ? ' ↓' : ''}</a></th>
          <th><a href="${link(1, 'owner')}">Modified By${d.sort.id === 'owner' ? ' ↑' : ''}</a></th>
          <th><a href="${link(1, 'location')}">Location${d.sort.id === 'location' ? ' ↑' : ''}</a></th>
          <th>Version</th>
          <th>Permission</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="10" class="empty-line">No items in this view.</td></tr>`}</tbody>
    </table>

    <div class="pager">
      <span class="range" data-testid="grid-range">${d.range.from}-${d.range.to} of ${d.total}</span>
      <a class="cmd" data-testid="grid-prev" href="${link(Math.max(1, d.page - 1), d.sort.id)}"
         ${d.page === 1 ? 'aria-disabled="true" style="pointer-events:none;color:#A19F9D"' : ''}>‹ Previous</a>
      <span class="pageno" data-testid="grid-page">Page ${d.page} of ${d.page_count}</span>
      <a class="cmd" data-testid="grid-next" href="${link(Math.min(d.page_count, d.page + 1), d.sort.id)}"
         ${d.page === d.page_count ? 'aria-disabled="true" style="pointer-events:none;color:#A19F9D"' : ''}>Next ›</a>
    </div>

    <div class="small muted" style="margin-top:12px">Recycle bin holds ${d.recycle_bin.items} items · purged in ${d.recycle_bin.purge_in_days} days</div>
  `;

  const side = `<div class="side" style="padding-top:64px">
      <h3>SAVED SEARCHES</h3>
      <ul>${d.saved_searches.map((s) => `<li><a href="#">${esc(s)}</a></li>`).join('')}</ul>
    </div>`;

  if (!openId) {
    setSurface('document_grid', `<div class="content"><div class="split"><div class="main">${listing}</div>${side}</div></div>`);
  } else {
    setSurface(
      'document_properties',
      `<div class="with-panel">
         <div class="listing">${listing}</div>
         <aside class="panel" data-testid="properties-panel"><div class="muted small">Loading…</div></aside>
       </div>`
    );
    await renderProperties(openId, d.page, d.sort.id);
  }

  wireGridControls();
}

async function renderProperties(id, page, sort) {
  const p = await j(`/api/documents/${encodeURIComponent(id)}/properties`);
  const panel = $('[data-testid="properties-panel"]');
  // Two distinct readings: a stored count renders as its exact integer; a size
  // that was never reported renders as its own statement, never as the same
  // text a zero-byte item would get.
  const sizeCell = p.bytes_reported
    ? `<div class="v mono" data-field="bytes" data-bytes-reported="true">${esc(p.bytes)}</div>`
    : `<div class="v" data-field="bytes" data-bytes-reported="false">Not reported</div>`;
  panel.innerHTML = `
    <div class="panel-head">
      <span class="glyph ${esc(extOf(p.name))}">${esc(extOf(p.name))}</span>
      <h2>${esc(p.name)}</h2>
      <a class="panel-close" data-testid="close-properties" href="/documents?page=${page}&sort=${sort}" aria-label="Close details">✕</a>
    </div>
    <div class="group">
      <h3>PROPERTIES</h3>
      <div class="kv">
        <div><div class="k">Item ID</div><div class="v mono" data-field="document_id">${esc(p.document_id)}</div></div>
        <div><div class="k">File name</div><div class="v" data-field="name">${esc(p.name)}</div></div>
        <div><div class="k">Display name</div><div class="v" data-field="label">${esc(p.label)}</div></div>
        <div><div class="k">Content type</div><div class="v mono" data-field="mime">${esc(p.mime)}</div></div>
        <div><div class="k">Stored size (bytes)</div>${sizeCell}</div>
        <div><div class="k">Location</div><div class="v small muted">${esc(p.location)}</div></div>
        <div><div class="k">Checked out to</div><div class="v small muted">${p.checked_out_to ? esc(p.checked_out_to) : '—'}</div></div>
      </div>
    </div>
    <div class="group">
      <h3>SHARING AND PERMISSIONS</h3>
      <div class="kv" style="gap:8px">
        ${p.sharing.groups.map((g) => `<div class="v small">${esc(g)}</div>`).join('')}
        <div class="small"><span class="chip">Link expires ${esc(p.sharing.link.expires)}</span></div>
        <div class="small muted">${esc(p.sharing.link.kind)}</div>
      </div>
    </div>
    <div class="group">
      <h3>VERSION HISTORY</h3>
      ${p.versions
        .map(
          (v) => `<div style="display:flex;gap:8px;padding:6px 0;font-size:12px">
            <span class="mono">${esc(v.rev)}</span>
            <span>${esc(v.author)}</span>
            <span class="muted" style="margin-left:auto">${esc(v.comment)}</span>
          </div>`
        )
        .join('')}
    </div>`;
}

function wireGridControls() {
  const presetBtn = $('[data-testid="open-presets"]');
  if (presetBtn)
    presetBtn.addEventListener('click', async () => {
      if (presetBtn.getAttribute('aria-expanded') === 'true') {
        closeOverlays();
        presetBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      const d = await j('/api/viewport-presets');
      presetBtn.setAttribute('aria-expanded', 'true');
      openPopover(
        presetBtn,
        `<div class="pop-head">PREVIEW AT</div>
         ${d.presets
           .map(
             (p, i) => `<button class="pop-item" type="button" data-testid="preset-option" data-width="${p.width}">
               <span class="w">${p.width} px</span><span class="d">${esc(p.device)}</span>
             </button>`
           )
           .join('')}
         <hr><button class="pop-item" type="button"><span class="w">Fit window</span></button>`,
        { surface: 'viewport_presets' }
      );
    });

  const trayBtn = $('[data-testid="open-tray"]');
  if (trayBtn)
    trayBtn.addEventListener('click', async () => {
      const d = await j('/api/upload-tray');
      openDialog(
        `<button class="dlg-close" aria-label="Close" data-testid="close-tray">✕</button>
         <h2>Upload</h2>
         <p class="dlg-sub"><span data-testid="tray-count">${d.count}</span> item(s) staged for the next upload</p>
         <div class="drop">Drag files here, or <a href="#">Browse</a> this device</div>
         <table class="grid" data-testid="tray-table" style="margin-top:0">
           <thead><tr><th>Name</th><th>Item ID</th><th>Source</th><th>Staged</th></tr></thead>
           <tbody>
             ${d.items
               .map(
                 (it) => `<tr data-testid="tray-item" data-doc-id="${esc(it.document_id)}">
                   <td><span class="doc-cell"><span class="glyph ${esc(extOf(it.name))}">${esc(extOf(it.name))}</span><span data-col="name">${esc(it.name)}</span></span></td>
                   <td class="mono muted" data-col="document_id">${esc(it.document_id)}</td>
                   <td class="small muted">${esc(it.source)}</td>
                   <td class="small muted">${esc(it.added)}</td>
                 </tr>`
               )
               .join('')}
           </tbody>
         </table>
         <div class="footer">
           <button class="btn secondary" type="button" data-testid="cancel-tray">Cancel</button>
           <button class="btn primary" type="button">Upload</button>
         </div>`,
        { wide: true, surface: 'upload_tray' }
      ).addEventListener('click', (e) => {
        if (e.target.dataset.testid === 'cancel-tray') closeOverlays();
      });
    });
}

/* ================= transfer_monitor ================= */
const STATE_CHIP = (s) => {
  const k = String(s).toLowerCase();
  if (k.indexOf('fail') === 0) return 'bad';
  if (k.indexOf('ready') === 0) return 'ok';
  return 'warn';
};
async function viewTransfers() {
  const d = await j('/api/transfers');
  setSurface(
    'transfer_monitor',
    `<div class="content">
      ${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Documents', href: '/documents' }, { label: 'Transfer monitor' }])}
      <h1 class="page-title">Transfer monitor</h1>
      <p class="page-sub">Ingestion queue for this library</p>
      <div class="cmdbar">
        <a class="cmd" data-testid="close-transfers" href="/documents">‹ Back to the library</a>
        <span class="divider"></span>
        <button class="cmd" type="button">Retry all</button>
        <button class="cmd" type="button">Pause queue</button>
      </div>
      <table class="grid" data-testid="transfers-table">
        <thead><tr><th>Name</th><th>Item ID</th><th>Transfer state</th><th>Queued at</th><th>Retries</th><th>Connection profile</th><th>Target node</th></tr></thead>
        <tbody>
          ${d.rows
            .map(
              (r) => `<tr data-doc-id="${esc(r.document_id)}">
                <td><span class="doc-cell"><span class="glyph ${esc(extOf(r.name))}">${esc(extOf(r.name))}</span><span data-col="name">${esc(r.name)}</span></span></td>
                <td class="mono muted" data-col="document_id">${esc(r.document_id)}</td>
                <td><span class="chip ${STATE_CHIP(r.upload_state)}" data-col="upload_state"><span class="dot"></span>${esc(r.upload_state)}</span></td>
                <td class="small muted">${esc(fmtDateTime(r.queued_at))}</td>
                <td class="small muted">${r.retries}</td>
                <td class="small mono muted">${esc(r.profile)}</td>
                <td class="small mono muted">${esc(r.node)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="small muted" style="margin-top:12px">Queue drains automatically; failed transfers are retried on the next scheduled sweep.</div>
    </div>`
  );
}

/* ================= library administration ================= */
async function viewSettings() {
  const g = await j('/api/settings/general');
  setSurface(
    'library_settings',
    `<div class="content">
      ${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Library administration' }])}
      <h1 class="page-title">Library administration</h1>
      <p class="page-sub">Shared document library · settings in force</p>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-testid="tab-general">General</button>
        <button role="tab" aria-selected="false" data-testid="tab-content-types">Content types &amp; transfer states</button>
        <button role="tab" aria-selected="false">Permissions</button>
        <button role="tab" aria-selected="false">Retention</button>
      </div>
      <div id="tabpanel" role="tabpanel"></div>
    </div>`
  );
  $('[data-testid="tab-general"]').addEventListener('click', () => renderGeneralTab(g));
  $('[data-testid="tab-content-types"]').addEventListener('click', renderContentTab);
  renderGeneralTab(g);
}

function selectTab(which) {
  $('[data-testid="tab-general"]').setAttribute('aria-selected', String(which === 'general'));
  $('[data-testid="tab-content-types"]').setAttribute('aria-selected', String(which === 'content'));
  canvas().dataset.surface = which === 'general' ? 'library_settings' : 'settings_content_types';
}

function renderGeneralTab(g) {
  selectTab('general');
  $('#tabpanel').innerHTML = `
    <div class="split" style="margin-top:24px">
      <div class="main">
        <div class="section" style="margin-top:0"><h2>Library behaviour</h2>
          <div data-testid="general-settings">
            ${g.settings
              .map(
                (s) => `<div class="setting-row" data-setting="${esc(s.key)}">
                  <div class="lbl"><div class="name">${esc(s.label)}</div><div class="help">${esc(s.help)}</div></div>
                  <div class="val ${s.mono ? 'mono' : ''}" data-value>${esc(s.value)}</div>
                </div>`
              )
              .join('')}
          </div>
        </div>
        <div class="section"><h2>Change log</h2>
          <table class="plain">
            <thead><tr><th>Date</th><th>Administrator</th><th>Entry</th></tr></thead>
            <tbody>${g.change_log.map((c) => `<tr><td>${esc(c.at)}</td><td>${esc(c.by)}</td><td class="muted">${esc(c.note)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="side" style="width:280px">
        <h3>LIBRARY</h3>
        <ul>
          <li>Owner · ${esc(g.chrome.owner)}</li>
          <li>Created · ${esc(g.chrome.created)}</li>
          <li>Quota class · ${esc(g.chrome.quota_class)}</li>
          <li>Versioning · ${esc(g.chrome.versioning)}</li>
          <li>Template · ${esc(g.chrome.template)}</li>
        </ul>
      </div>
    </div>`;
}

async function renderContentTab() {
  const c = await j('/api/settings/content-types');
  selectTab('content');
  $('#tabpanel').innerHTML = `
    <div class="split" style="margin-top:24px">
      <div class="main" style="max-width:740px">
        <div class="section" style="margin-top:0"><h2>Accepted content types</h2>
          <p class="small muted">Media types this library accepts on ingest, in the order they are evaluated.</p>
          <ol class="orderlist" data-testid="allowed-mimes">
            ${c.allowed_mimes.map((m) => `<li data-testid="allowed-mime">${esc(m)}</li>`).join('')}
          </ol>
          <div class="small muted" style="margin-top:16px">Enforcement · ${esc(c.chrome.enforcement)}</div>
          <div class="small muted">${esc(c.chrome.scanning)}</div>
        </div>
        <div class="section"><h2>Transfer states</h2>
          <p class="small muted">The states a transfer in this library may occupy.</p>
          <ol class="orderlist" data-testid="upload-states">
            ${c.upload_states.map((s) => `<li data-testid="upload-state">${esc(s)}</li>`).join('')}
          </ol>
        </div>
      </div>
    </div>`;
}

/* ================= governance ================= */
async function viewGovernance() {
  const d = await j('/api/governance');
  setSurface(
    'governance_collection',
    `<div class="content">
      ${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Governance library' }])}
      <h1 class="page-title">Governance library</h1>
      <p class="page-sub">System-managed collection · policy and certification documents</p>
      <div class="cmdbar"><button class="cmd" type="button">Export list</button><span class="divider"></span><button class="cmd" type="button">Subscribe</button></div>
      <table class="grid" data-testid="governance-table">
        <thead><tr><th>Title</th><th>Owner</th><th>Effective</th><th>Revision</th></tr></thead>
        <tbody>
          ${d.rows
            .map(
              (r) => `<tr data-testid="gov-row" data-doc="${esc(r.id)}">
                <td><span class="doc-cell"><span class="glyph">doc</span>
                  ${r.href ? `<a class="doc-name" href="${r.href}">${esc(r.title)}</a>` : `<span>${esc(r.title)}</span>`}</span></td>
                <td class="small">${esc(r.owner)}</td>
                <td class="small muted">${esc(r.effective)}</td>
                <td class="small mono muted">${esc(r.revision)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="small muted" style="margin-top:12px">${d.rows.length} items · this collection is separate from the shared document library.</div>
    </div>`
  );
}

async function viewCertification() {
  setSurface(
    'certification_viewer',
    `<div class="content">
      ${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Governance library', href: '/governance' }, { label: 'Integration certification checklist' }])}
      <h1 class="page-title">Integration certification checklist</h1>
      <p class="page-sub">Document preview</p>
      <div class="cmdbar">
        <a class="cmd" data-testid="close-viewer" href="/governance">‹ Back to the collection</a>
        <span class="divider"></span><button class="cmd" type="button">Download</button><button class="cmd" type="button">Print</button>
      </div>
      <div class="viewer"><div class="sheet" id="sheet"></div></div>
      <div class="viewer-bar">
        <span class="grow" data-testid="viewer-page-label"></span>
        <button type="button" data-testid="viewer-prev">‹ Previous page</button>
        <button type="button" data-testid="viewer-next">Next page ›</button>
      </div>
    </div>`
  );
  let page = 1;
  const load = async (n) => {
    const d = await j(`/api/governance/certification?page=${n}`);
    page = d.page;
    $('#sheet').innerHTML = `
      <h2>${esc(d.title)}</h2>
      <div class="docmeta">Revision <span class="mono" data-testid="cert-revision">${esc(d.revision)}</span> · page ${d.page} of ${d.page_count}</div>
      ${d.first_page ? `<p style="font-size:13px;margin:0 0 16px">Each case below fixes one required behaviour of a conforming integration — either the outcome it must produce or the rejection it must raise. All cases must pass before certification is granted.</p>` : ''}
      <div data-testid="cert-cases">
        ${d.blocks
          .map(
            (b) => `<div class="case" data-testid="cert-case" data-case-id="${esc(b.id)}" data-case-kind="${esc(b.kind)}">
              <div class="case-head">
                <span class="case-ord">${b.ordinal}.</span>
                <span class="case-id">${esc(b.id)}</span>
                <span class="case-kind">${b.kind === 'rejection' ? 'Required rejection' : 'Required outcome'}</span>
              </div>
              <div class="case-body">${
                b.kind === 'rejection'
                  ? `Must raise <code class="inline case-error">${esc(b.error)}</code>.`
                  : b.kind === 'pointer'
                  ? `<span class="case-pointer">The reference response published in the Developer Center — <a href="/developer/reference">Endpoint reference ▸ Sample request console</a>. <span class="pointer"><span class="ptr">${esc(b.pointer)}</span></span></span>`
                  : `<span class="case-rule">${esc(b.rule)}</span>`
              }</div>
            </div>`
          )
          .join('')}
      </div>
      ${d.last_page ? `<p style="font-size:12px;color:#616161;margin-top:24px;padding-top:12px;border-top:1px solid #EDEBE9">End of checklist. Signed off by the integration governance board.</p>` : ''}`;
    $('[data-testid="viewer-page-label"]').textContent = `Page ${d.page} of ${d.page_count}`;
    $('[data-testid="viewer-prev"]').disabled = d.first_page;
    $('[data-testid="viewer-next"]').disabled = d.last_page;
    $('#sheet').dataset.page = String(d.page);
  };
  $('[data-testid="viewer-next"]').addEventListener('click', () => load(page + 1));
  $('[data-testid="viewer-prev"]').addEventListener('click', () => load(page - 1));
  await load(1);
}

/* ================= developer center ================= */
const DEV_LINKS = [
  { id: 'index', title: 'Overview', href: '/developer' },
  { id: 'reference', title: 'Endpoint reference', href: '/developer/reference' },
  { id: 'behavior', title: 'Behaviour guide', href: '/developer/behavior' },
  { id: 'errors', title: 'Error reference', href: '/developer/errors' },
  { id: 'components', title: 'Component & module contract', href: '/developer/components' },
];

function devShell(active, body, onThis) {
  return `<div class="content" style="max-width:none">
    <div class="dev">
      <nav class="devnav">
        <h3>DOCS NAVIGATION</h3>
        ${DEV_LINKS.map(
          (l) => `<a href="${l.href}" class="${l.id === active ? 'active' : ''}" data-dev-link="${l.id}">${esc(l.title)}</a>`
        ).join('')}
      </nav>
      <article class="prose">${body}</article>
      <aside class="onthis">
        <h3>ON THIS PAGE</h3>
        ${(onThis || []).map((t) => `<a href="#${t.id}">${esc(t.label)}</a>`).join('')}
      </aside>
    </div>
  </div>`;
}

const asText = (v) => (Array.isArray(v) ? v.join(', ') : String(v));
const conRow = (c) =>
  `<span data-con="${esc(c.name)}"><b>${esc(c.name)}</b> <span class="conv">${esc(asText(c.value))}</span></span>`;

const fieldBlock = (f, kind) => `
  <div class="param" data-testid="${kind}" data-name="${esc(f.name)}">
    <div class="head">
      <span class="pname">${esc(f.name)}</span>
      <span class="ptype" data-testid="field-type">${esc(f.type)}</span>
      ${f.nullable ? '<span class="ptype">nullable</span>' : ''}
    </div>
    ${f.constraints.length ? `<div class="con">${f.constraints.map(conRow).join('')}</div>` : ''}
  </div>`;

const orderList = (items, testid) =>
  `<ol class="orderlist numbered" data-testid="${testid}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`;

async function viewDeveloperIndex() {
  const d = await j('/api/developer/index');
  const x = d.execution;
  setSurface(
    'developer_index',
    devShell(
      'index',
      `${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Developer center' }])}
       <h1>Integration developer center</h1>
       <p class="muted">The published view-model contract an integration must reproduce.</p>

       <div class="note">
         <b>Contract revision <span class="mono" data-field="schema_version">${esc(d.schema_version)}</span>.</b>
         Text encoding: <span data-field="encoding">${esc(d.encoding)}</span>.
       </div>

       <div class="section" id="execution"><h2>Execution envelope</h2>
         <p>Every conforming run must hold to the conditions below.</p>
         <table class="plain" data-testid="execution-table">
           <tbody>
             <tr><th style="width:220px">Network posture</th><td data-field="offline">${x.offline ? 'Offline — no network access' : 'Network permitted'}</td></tr>
             <tr><th>Interpreter floor</th><td class="mono" data-field="python">${esc(x.python)}</td></tr>
             <tr><th>Per-run time limit</th><td data-field="timeout_seconds"><span class="mono">${x.timeout_seconds}</span> seconds</td></tr>
             <tr><th>Caller’s arguments</th><td data-field="deep_input_mutation">Deep input mutation is ${esc(x.deep_input_mutation)}</td></tr>
             <tr><th>Candidate isolation</th><td data-field="candidate_isolation">${esc(x.candidate_isolation)}</td></tr>
           </tbody>
         </table>
       </div>

       <div class="section" id="sections"><h2>Published sections</h2>
         <p>Each section of the contract is published in its own right and opened from here.</p>
         <table class="plain">
           <tbody>
             ${d.sections
               .map(
                 (s) => `<tr data-testid="dev-section" data-section="${esc(s.id)}">
                   <td style="width:280px"><a href="${s.href}" data-testid="open-${esc(s.id)}">${esc(s.title)}</a></td>
                   <td class="muted">${esc(s.blurb)}</td>
                 </tr>`
               )
               .join('')}
           </tbody>
         </table>
       </div>

       <div class="note green">
         Values this library configures for itself are not reprinted here. Where the contract embeds them,
         the reference points at <a href="/settings">library administration</a>
         <span class="pointer"><span class="ptr">${esc(d.configuration_home)}</span></span>.
       </div>`,
      [
        { id: 'execution', label: 'Execution envelope' },
        { id: 'sections', label: 'Published sections' },
      ]
    )
  );
}

async function viewDeveloperReference() {
  const d = await j('/api/developer/reference');
  const rules = d.rules;
  setSurface(
    'developer_reference',
    devShell(
      'reference',
      `${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Developer center', href: '/developer' }, { label: 'Endpoint reference' }])}
       <h1>Endpoint reference</h1>
       <div style="display:flex;align-items:center;gap:12px;margin:16px 0">
         <span class="method post">POST</span>
         <code class="inline">/v1/view-models/document-library:render</code>
         <a class="btn primary" style="line-height:32px;display:inline-block" href="/developer/console" data-testid="open-console">Try it ▸</a>
       </div>

       <div class="section" id="request"><h2>Request body</h2>
         <p>The accepted top-level container is a closed set.</p>
         <p class="small muted">Required keys ${orderList(d.top_level.required, 'top-level-required')}
            Unstated keys: <b data-testid="top-level-additional">${String(d.top_level.additionalProperties)}</b> (additionalProperties)</p>
         <div class="param">
           <div class="head"><span class="pname">${esc(d.input.container.name)}</span>
             <span class="ptype">${esc(d.input.container.type)}</span><span class="preq">required</span></div>
           <div class="con"><span data-testid="records-ordering">${esc(d.input.container.ordering)}</span></div>
         </div>
         <p class="small muted">Top-level key order ${orderList(d.input.property_order, 'input-property-order')}</p>
       </div>

       <div class="section" id="record"><h2>Record fields</h2>
         ${d.input.record.fields.map((f) => fieldBlock(f, 'record-field')).join('')}
         <p class="small muted" style="margin-top:16px">Required ${orderList(d.input.record.required, 'record-required')}</p>
         <p class="small muted">Declared key order ${orderList(d.input.record.property_order, 'record-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="record-additional">${String(d.input.record.additionalProperties)}</b> (additionalProperties)</p>
       </div>

       <div class="section" id="policy"><h2>Policy argument</h2>
         <p>The call takes the configuration in force as an <code class="inline">${esc(d.policy.type)}</code>.
            Its values are not reprinted here — they are published in
            <a href="/settings">library administration</a>
            <span class="pointer"><span class="ptr" data-testid="policy-value-home">${esc(d.policy.value_home)}</span></span>.</p>
         <p class="small muted">Declared key order ${orderList(d.policy.fields, 'policy-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="policy-additional">${String(d.policy.additionalProperties)}</b> (additionalProperties)</p>
         <div class="note"><span data-testid="policy-recursive-rule">${esc(d.policy.recursive_scalar_rule)}</span></div>
       </div>

       <div class="section" id="response"><h2>Response body</h2>
         ${d.output.fields.map((f) => fieldBlock(f, 'output-field')).join('')}
         <p class="small muted" style="margin-top:16px">Required ${orderList(d.output.required, 'output-required')}</p>
         <p class="small muted">Fixed key order ${orderList(d.output.property_order, 'output-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="output-additional">${String(d.output.additionalProperties)}</b> (additionalProperties)</p>
       </div>

       <div class="section" id="row"><h2>Row shape</h2>
         ${d.output.row.fields.map((f) => fieldBlock(f, 'row-field')).join('')}
         <p class="small muted" style="margin-top:16px">Required ${orderList(d.output.row.required, 'row-required')}</p>
         <p class="small muted">Fixed key order ${orderList(d.output.row.property_order, 'row-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="row-additional">${String(d.output.row.additionalProperties)}</b> (additionalProperties)</p>
       </div>

       <div class="section" id="ordering"><h2>Ordering</h2>
         <table class="plain">
           <tbody>
             <tr><th style="width:200px">Rows</th><td data-testid="files-ordering">${esc(d.output.row.ordering)}</td></tr>
             <tr><th>Staged identifiers</th><td data-testid="selected-ids-ordering">${esc(d.output.selected_ids_ordering)}</td></tr>
           </tbody>
         </table>
       </div>

       <div class="section" id="descriptors"><h2>Embedded descriptors</h2>
         <h3>Submit-event descriptor</h3>
         ${d.output.submit_event.fields.map((f) => fieldBlock(f, 'submit-event-field')).join('')}
         <p class="small muted">Required ${orderList(d.output.submit_event.required, 'submit-event-required')}</p>
         <p class="small muted">Fixed key order ${orderList(d.output.submit_event.property_order, 'submit-event-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="submit-event-additional">${String(d.output.submit_event.additionalProperties)}</b></p>
         <h3>Layout descriptor</h3>
         ${d.output.layout.fields.map((f) => fieldBlock(f, 'layout-field')).join('')}
         <p class="small muted">Required ${orderList(d.output.layout.required, 'layout-required')}</p>
         <p class="small muted">Fixed key order ${orderList(d.output.layout.property_order, 'layout-property-order')}</p>
         <p class="small muted">Unstated keys: <b data-testid="layout-additional">${String(d.output.layout.additionalProperties)}</b></p>
       </div>

       <div class="section" id="rules"><h2>General rules</h2>
         <div class="note"><span data-rule="object_rule">${esc(rules.object_rule)}</span></div>
         <div class="note"><span data-rule="array_rule">${esc(rules.array_rule)}</span></div>
         <div class="note"><span data-rule="null_rule">${esc(rules.null_rule)}</span></div>
       </div>

       <p><a href="/developer" data-testid="close-reference">‹ Back to the developer center</a></p>`,
      [
        { id: 'request', label: 'Request body' },
        { id: 'record', label: 'Record fields' },
        { id: 'policy', label: 'Policy argument' },
        { id: 'response', label: 'Response body' },
        { id: 'row', label: 'Row shape' },
        { id: 'ordering', label: 'Ordering' },
        { id: 'descriptors', label: 'Embedded descriptors' },
        { id: 'rules', label: 'General rules' },
      ]
    )
  );
}

async function viewDeveloperBehavior() {
  const d = await j('/api/developer/behavior');
  const st = d.size_text;
  const bands = Object.keys(st).filter((k) => k !== 'rounding');
  setSurface(
    'developer_behavior',
    devShell(
      'behavior',
      `${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Developer center', href: '/developer' }, { label: 'Behaviour guide' }])}
       <h1>Behaviour guide</h1>
       <p class="muted">How a row’s derived text is computed from what the library stores. No stored document appears here.</p>

       <div class="section" id="size"><h2>Size string</h2>
         <table class="plain" data-testid="size-bands">
           <thead><tr><th style="width:280px">Stored size</th><th>Rendered text</th></tr></thead>
           <tbody>
             ${bands
               .map(
                 (b) => `<tr data-size-band="${esc(b)}"><td class="mono">${esc(b)}</td><td class="mono" data-band-value>${esc(st[b])}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>
         <div class="note"><b>Rounding.</b> <span data-size-band="rounding" data-band-value>${esc(st.rounding)}</span></div>
         <div class="note green"><b>Worked example.</b> <span data-testid="worked-example">${esc(d.worked_example)}</span></div>
       </div>

       <div class="section" id="fields"><h2>Derived row fields</h2>
         <table class="plain">
           <tbody>
             <tr><th style="width:220px">Accessible label</th><td class="mono" data-testid="aria-label-formula">${esc(d.file_fields.aria_label)}</td></tr>
             <tr><th>Keyboard selectable</th><td data-testid="keyboard-selectable">${String(d.file_fields.keyboard_selectable)} — every valid row is keyboard-selectable.</td></tr>
           </tbody>
         </table>
       </div>

       <div class="section" id="hint"><h2>Upload hint priority</h2>
         <p>The first rule that holds supplies the hint.</p>
         <table class="plain" data-testid="hint-priority">
           <thead><tr><th style="width:60px">#</th><th style="width:320px">When</th><th>Hint</th></tr></thead>
           <tbody>
             ${d.upload_hint_priority
               .map(
                 (r, i) => `<tr data-testid="hint-rule" data-index="${i}">
                   <td class="muted">${i + 1}</td><td data-hint-when>${esc(r.when)}</td>
                   <td class="mono" data-hint-value>${esc(r.value)}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>
       </div>

       <div class="note">Values these rules read from configuration are published in
         <a href="/settings">library administration</a>
         <span class="pointer"><span class="ptr">${esc(d.configuration_home)}</span></span>.</div>

       <p><a href="/developer" data-testid="close-behavior">‹ Back to the developer center</a></p>`,
      [
        { id: 'size', label: 'Size string' },
        { id: 'fields', label: 'Derived row fields' },
        { id: 'hint', label: 'Upload hint priority' },
      ]
    )
  );
}

async function viewDeveloperErrors() {
  const d = await j('/api/developer/errors');
  setSurface(
    'developer_errors',
    devShell(
      'errors',
      `${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Developer center', href: '/developer' }, { label: 'Error reference' }])}
       <h1>Error reference</h1>
       <p class="muted">What an integration must reject rather than produce a result for.</p>

       <div class="section" id="exception"><h2>Exception</h2>
         <p>A rejection raises exactly one exception type:
            <code class="inline magenta" data-testid="error-exception">${esc(d.exception)}</code>.</p>
       </div>

       <div class="section" id="conditions"><h2>Triggering conditions</h2>
         <table class="plain" data-testid="error-conditions">
           <tbody>
             ${d.conditions
               .map(
                 (c, i) => `<tr><td class="muted" style="width:40px">${i + 1}</td>
                   <td data-testid="error-condition">${esc(c)}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>
       </div>

       <p><a href="/developer" data-testid="close-errors">‹ Back to the developer center</a></p>`,
      [
        { id: 'exception', label: 'Exception' },
        { id: 'conditions', label: 'Triggering conditions' },
      ]
    )
  );
}

async function viewDeveloperComponents() {
  const d = await j('/api/developer/components');
  const vm = d.node_view_model;
  const ev = d.vue_event_contract;
  const rc = d.responsive_css;
  setSurface(
    'developer_components',
    devShell(
      'components',
      `${crumbs([{ label: 'Engineering site', href: '/' }, { label: 'Developer center', href: '/developer' }, { label: 'Component & module contract' }])}
       <h1>Component &amp; module contract</h1>
       <p class="muted">The modules an integration ships, what they export and what they emit.</p>

       <div class="section" id="deliverables"><h2>Modules to deliver</h2>
         <table class="plain" data-testid="deliverables">
           <thead><tr><th>Path</th><th style="width:100px">Required</th><th style="width:170px">Behaviourally validated</th></tr></thead>
           <tbody>
             ${d.deliverables
               .map(
                 (m) => `<tr data-testid="deliverable" data-path="${esc(m.path)}">
                   <td class="mono">${esc(m.path)}</td>
                   <td data-field="required">${String(m.required)}</td>
                   <td data-field="behaviorally_validated">${String(m.behaviorally_validated)}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>
       </div>

       <div class="section" id="viewmodel"><h2>View-model module</h2>
         <p class="mono small" data-testid="vm-module">${esc(vm.module)}</p>
         <p class="small muted">Exports</p>
         <ul class="orderlist" data-testid="vm-exports">${vm.exports.map((e) => `<li data-testid="vm-export">${esc(e)}</li>`).join('')}</ul>
         <table class="plain" style="margin-top:16px">
           <tbody>
             <tr><th style="width:220px"><code class="inline">createDocumentList</code></th>
                 <td>Takes <b data-testid="cdl-arguments">${esc(vm.createDocumentList.arguments)}</b>;
                     returns <span data-testid="cdl-result">${esc(vm.createDocumentList.result)}</span>.
                     <div class="small muted" style="margin-top:6px">Consumes records carrying the fields:</div>
                     <ul class="orderlist" data-testid="cdl-record-keys">${vm.createDocumentList.record_keys
                       .map((k) => `<li data-testid="cdl-record-key">${esc(k)}</li>`)
                       .join('')}</ul></td></tr>
             <tr><th><code class="inline">submitFromKey</code></th>
                 <td>Arguments <span class="mono" data-testid="sfk-arguments">${esc(vm.submitFromKey.arguments.join(', '))}</span>.
                     <div data-testid="sfk-result">${esc(vm.submitFromKey.result)}</div>
                     <pre class="code" data-testid="sfk-enter-result">${esc(JSON.stringify(vm.submitFromKey.enter_result, null, 2))}</pre></td></tr>
           </tbody>
         </table>
       </div>

       <div class="section" id="events"><h2>Event constructors</h2>
         <p class="mono small" data-testid="evt-module">${esc(ev.module)}</p>
         <p class="small muted">Exports</p>
         <ul class="orderlist" data-testid="evt-exports">${ev.exports.map((e) => `<li data-testid="evt-export">${esc(e)}</li>`).join('')}</ul>
         <table class="plain" style="margin-top:16px">
           <tbody>
             <tr><th style="width:240px" class="mono" data-testid="toggle-call">${esc(ev.toggle.constructor_call)}</th>
                 <td><pre class="code" data-testid="toggle-result">${esc(JSON.stringify(ev.toggle.result, null, 2))}</pre></td></tr>
             <tr><th class="mono" data-testid="submit-call">${esc(ev.submit_upload.constructor_call)}</th>
                 <td><pre class="code" data-testid="submit-result">${esc(JSON.stringify(ev.submit_upload.result, null, 2))}</pre></td></tr>
           </tbody>
         </table>
         <div class="note"><span data-testid="evt-keyboard">${esc(ev.keyboard)}</span></div>
       </div>

       <div class="section" id="components"><h2>Components</h2>
         ${d.components
           .map(
             (c) => `<div data-testid="component" data-file="${esc(c.file)}" style="margin-bottom:24px">
               <h3 class="mono">${esc(c.file)}</h3>
               <table class="plain">
                 <tbody>
                   <tr><th style="width:200px">props</th><td><ul class="orderlist" data-testid="component-props">${c.spec.props
                     .map((p) => `<li data-testid="component-prop">${esc(p)}</li>`)
                     .join('')}</ul></td></tr>
                   <tr><th>emits</th><td><ul class="orderlist" data-testid="component-emits">${c.spec.emits
                     .map((p) => `<li data-testid="component-emit">${esc(p)}</li>`)
                     .join('')}</ul></td></tr>
                   ${Object.entries(c.spec)
                     .filter(([k]) => k !== 'props' && k !== 'emits')
                     .map(
                       ([k, v]) => `<tr><th class="mono">${esc(k)}</th><td data-spec-key="${esc(k)}">${
                         Array.isArray(v)
                           ? `<ul class="orderlist">${v.map((x) => `<li data-spec-item>${esc(x)}</li>`).join('')}</ul>`
                           : esc(v)
                       }</td></tr>`
                     )
                     .join('')}
                 </tbody>
               </table>
             </div>`
           )
           .join('')}
       </div>

       <div class="section" id="responsive"><h2>Responsive rules</h2>
         <p>The stylesheet must contain these declarations:</p>
         <ul class="orderlist" data-testid="css-declarations">${rc.required_declarations
           .map((x) => `<li data-testid="css-declaration">${esc(x)}</li>`)
           .join('')}</ul>
         <p style="margin-top:12px">Horizontal scrolling at the configured preview widths:
            <b data-testid="css-horizontal-scroll">${String(rc.horizontal_scroll)}</b>.</p>
         <p class="pointer">Preview widths are published in the library listing’s preview control
            <span class="ptr" data-testid="css-widths-home">${esc(rc.viewport_widths_home)}</span>.</p>
         <p class="pointer">The narrow breakpoint is stated by the layout descriptor
            <span class="ptr" data-testid="css-breakpoint-home">${esc(rc.breakpoint_home)}</span>.</p>
       </div>

       <div class="section" id="report"><h2>Conformance report</h2>
         <p class="small muted">Required headings</p>
         ${orderList(d.verification_document.required_sections, 'report-sections')}
         <p class="small muted" style="margin-top:16px">Required statements</p>
         <ul class="orderlist" data-testid="report-statements">${d.verification_document.required_statements
           .map((s) => `<li data-testid="report-statement">${esc(s)}</li>`)
           .join('')}</ul>
       </div>

       <div class="note"><b>Implementation notes.</b>
         <span data-testid="implementation-note">${esc(d.implementation_note)}</span></div>

       <p><a href="/developer" data-testid="close-components">‹ Back to the developer center</a></p>`,
      [
        { id: 'deliverables', label: 'Modules to deliver' },
        { id: 'viewmodel', label: 'View-model module' },
        { id: 'events', label: 'Event constructors' },
        { id: 'components', label: 'Components' },
        { id: 'responsive', label: 'Responsive rules' },
        { id: 'report', label: 'Conformance report' },
      ]
    )
  );
}

async function viewDeveloperConsole() {
  const d = await j('/api/developer/console');
  setSurface(
    'developer_console',
    devShell(
      'reference',
      `${crumbs([
        { label: 'Engineering site', href: '/' },
        { label: 'Developer center', href: '/developer' },
        { label: 'Endpoint reference', href: '/developer/reference' },
        { label: 'Sample request console' },
      ])}
       <h1>Sample request console</h1>
       <p class="muted">Compose a call against the published view-model and execute it in the sandbox.</p>

       <div class="section" id="compose"><h2>Compose</h2>
         <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
           <span class="method post">POST</span><code class="inline">${esc(d.call)}</code>
         </div>
         <table class="plain">
           <tbody>
             ${d.arguments
               .map(
                 (a) => `<tr><th style="width:160px"><span class="mono" style="color:#0F6CBD">${esc(a.name)}</span></th>
                   <td><span class="ptype">${esc(a.type)}</span> ${a.required ? '<span class="preq">required</span>' : ''}
                   <div class="small muted" style="margin-top:4px">${esc(a.note)}</div></td></tr>`
               )
               .join('')}
           </tbody>
         </table>

         <div style="display:flex;gap:24px;margin-top:20px;flex-wrap:wrap">
           <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#616161">Document set
             <select data-testid="console-document-set" style="height:32px;border:1px solid #8A8886;border-radius:4px;padding:0 8px;font-size:13px;min-width:280px">
               ${d.document_sets.map((s) => `<option value="${esc(s.id)}" ${s.disabled ? 'disabled' : ''}>${esc(s.label)}</option>`).join('')}
             </select>
           </label>
           <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:#616161">Environment
             <select data-testid="console-environment" style="height:32px;border:1px solid #8A8886;border-radius:4px;padding:0 8px;font-size:13px;min-width:280px">
               ${d.environments.map((s) => `<option value="${esc(s.id)}" ${s.disabled ? 'disabled' : ''}>${esc(s.label)}</option>`).join('')}
             </select>
           </label>
         </div>

         <div style="display:flex;align-items:center;gap:12px;margin-top:20px">
           <button class="btn primary" type="button" data-testid="console-run">Send request</button>
           <button class="btn secondary" type="button">Copy as snippet</button>
           <span class="small muted">Rate limit ${d.rate_limit.used} / ${d.rate_limit.ceiling} ${esc(d.rate_limit.window)}</span>
         </div>
       </div>

       <div class="section" id="response" data-console-state="idle" data-testid="console-response">
         <h2>Response</h2>
         <div id="console-response-slot"><p class="muted small">No request has been sent yet.</p></div>
       </div>

       <div class="section" id="history"><h2>Request history</h2>
         <table class="plain">
           <thead><tr><th style="width:280px">Sent</th><th>Status</th></tr></thead>
           <tbody>${d.history.map((h) => `<tr><td class="muted">${esc(fmtDateTime(h.at))}</td><td class="mono">${h.status}</td></tr>`).join('')}</tbody>
         </table>
       </div>

       <p><a href="/developer/reference" data-testid="close-console">‹ Back to the endpoint reference</a></p>`,
      [
        { id: 'compose', label: 'Compose' },
        { id: 'response', label: 'Response' },
        { id: 'history', label: 'Request history' },
      ]
    )
  );

  $('[data-testid="console-run"]').addEventListener('click', async () => {
    const box = $('[data-testid="console-response"]');
    box.dataset.consoleState = 'running';
    $('#console-response-slot').innerHTML = `<p class="muted small">Executing in sandbox…</p>`;
    const set = $('[data-testid="console-document-set"]').value;
    const env = $('[data-testid="console-environment"]').value;
    const r = await j('/api/developer/console/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document_set: set, environment: env }),
    });
    $('#console-response-slot').innerHTML = `
      <div class="tabs" style="margin-top:0"><button aria-selected="true">${r.status}</button><button aria-selected="false">4xx</button><button aria-selected="false">default</button></div>
      <div class="small muted" style="margin-top:8px">${r.duration_ms} ms · ${esc(r.environment)}</div>
      <pre class="code" data-testid="console-response-body">${esc(JSON.stringify(r.body, null, 2))}</pre>
      <p class="pointer">Two values in this body point at the surfaces that own them rather than being reprinted here.</p>
      <p><button class="btn secondary" type="button" data-testid="close-response">Dismiss response</button></p>`;
    box.dataset.consoleState = 'complete';
    $('[data-testid="close-response"]').addEventListener('click', () => {
      $('#console-response-slot').innerHTML = `<p class="muted small">No request has been sent yet.</p>`;
      box.dataset.consoleState = 'idle';
    });
  });
}

/* ---------------- generic placeholder surfaces (chrome) ---------------- */
function viewPlaceholder(title, note) {
  setSurface(
    'placeholder',
    `<div class="content">
      ${crumbs([{ label: 'Engineering site', href: '/' }, { label: title }])}
      <h1 class="page-title">${esc(title)}</h1>
      <div class="empty-line">${esc(note)}</div>
    </div>`
  );
}

/* ---------------- router ---------------- */
async function route() {
  renderRail();
  const p = location.pathname.replace(/\/+$/, '') || '/';
  try {
    if (p === '/') return await viewHome();
    if (p === '/documents') return await viewDocuments(null);
    if (p === '/documents/transfers') return await viewTransfers();
    if (p.startsWith('/documents/properties/'))
      return await viewDocuments(decodeURIComponent(p.slice('/documents/properties/'.length)));
    if (p === '/settings') return await viewSettings();
    if (p === '/governance') return await viewGovernance();
    if (p === '/governance/preview/certification') return await viewCertification();
    if (p === '/developer') return await viewDeveloperIndex();
    if (p === '/developer/reference') return await viewDeveloperReference();
    if (p === '/developer/behavior') return await viewDeveloperBehavior();
    if (p === '/developer/errors') return await viewDeveloperErrors();
    if (p === '/developer/components') return await viewDeveloperComponents();
    if (p === '/developer/console') return await viewDeveloperConsole();
    if (p === '/approvals') return viewPlaceholder('Approvals', 'No review requests are assigned to you in this site.');
    if (p === '/recycle-bin') return viewPlaceholder('Recycle bin', '19 items · purged automatically after 93 days.');
    if (p === '/site-contents') return viewPlaceholder('Site contents', 'Lists, libraries and apps provisioned on this site.');
    if (p === '/shared') return viewPlaceholder('Shared with us', 'Nothing has been shared with this site recently.');
    return viewPlaceholder('Not found', 'That page does not exist in this workspace.');
  } catch (err) {
    setSurface('error', `<div class="content"><div class="empty-line">${esc(String(err))}</div></div>`);
  }
}

route();

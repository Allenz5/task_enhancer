/* Studio dashboard — workspace chrome only.
   Counts of entries, an authoring-velocity chart, an editorial calendar and the
   titles of recently edited entries. No per-entry field values. */
(async function () {
  const { el, api, layout, ready } = window.M;
  const d = await api('/api/studio/dashboard');
  const content = layout({
    app: 'studio', active: 'dashboard', unread: d.unread,
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' }, { label: 'Dashboard' }],
  });

  const banner = el('div', { class: 'banner', 'data-testid': 'onboarding' },
    el('div', {},
      el('div', { style: 'font-weight:600;font-size:12.5px;margin-bottom:4px' },
        `Workspace setup — ${d.checklist.filter((c) => c.done).length} of ${d.checklist.length} complete`),
      el('div', { class: 'steps' }, d.checklist.map((c) =>
        el('span', { class: `step ${c.done ? 'done' : ''}` }, `${c.done ? '✓' : '○'} ${c.label}`)))),
    el('button', { class: 'x', title: 'Dismiss', onclick: (e) => e.target.closest('.banner').remove() }, '×'));

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'Engineering status site'),
      el('div', { class: 'sub' }, 'Meridian Studio · workspace ws_4a19 · 6 editors · London')),
    el('div', { class: 'actions' },
      el('a', { class: 'btn', href: '/collection', 'data-testid': 'open-collection' }, 'Open collection'),
      el('button', { class: 'btn primary' }, '+ New entry')));

  const stats = el('div', { class: 'grid cols-4' },
    [['Entries', d.counts.total, 'Build Reports collection'],
     ['Live on site', d.counts.live, 'published to the delivery target'],
     ['Not live', d.counts.draft, 'held back from the site'],
     ['Scheduled', d.counts.scheduled, 'no future publishes queued']]
      .map(([k, v, sub]) => el('div', { class: 'card stat' },
        el('div', { class: 'k' }, k), el('div', { class: 'v' }, String(v)), el('div', { class: 'd' }, sub))));

  const max = Math.max(...d.velocity.map((v) => v.count), 1);
  const velocity = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Authoring velocity'), el('span', { class: 'right' }, 'entries edited per week')),
    el('div', { class: 'body' },
      el('div', { class: 'bars' }, d.velocity.map((v) =>
        el('div', { class: 'b' },
          el('span', { class: 'n' }, String(v.count)),
          el('span', { class: 'fill', style: `height:${Math.round((v.count / max) * 100)}%` }),
          el('span', { class: 'lbl' }, v.week))))));

  const byDate = new Map(d.calendar.map((c) => [c.date, c.count]));
  const cells = [];
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((x) => cells.push(el('div', { class: 'dow' }, x)));
  for (let i = 0; i < 2; i++) cells.push(el('div', { class: 'cell', style: 'opacity:.35' }, ''));
  for (let day = 1; day <= 31; day++) {
    const date = `2026-07-${String(day).padStart(2, '0')}`;
    const n = byDate.get(date) || 0;
    cells.push(el('div', { class: `cell ${n >= 4 ? 'l3' : n >= 2 ? 'l2' : n >= 1 ? 'l1' : ''}`, title: date }, String(day)));
  }
  const calendar = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Editorial calendar'), el('span', { class: 'right' }, 'July 2026')),
    el('div', { class: 'body' }, el('div', { class: 'cal' }, cells)));

  const recent = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Recently edited')),
    el('table', { class: 'tbl' }, el('tbody', {},
      d.recent.map((r) => el('tr', {}, el('td', { class: 't-title', 'data-testid': 'recent-title' }, r.title))))));

  const collections = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Collections')),
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Collection'), el('th', {}, 'Model'), el('th', { class: 'num' }, 'Entries'))),
      el('tbody', {}, d.collections.map((c) => el('tr', {},
        el('td', { class: 't-title' }, c.name === 'Build Reports' ? el('a', { href: '/collection' }, c.name) : c.name),
        el('td', { class: 'mono muted' }, c.model),
        el('td', { class: 'num' }, String(c.entries)))))));

  content.append(banner, head, stats,
    el('div', { class: 'grid cols-2', style: 'margin-top:14px' }, velocity, calendar),
    el('div', { class: 'grid cols-2', style: 'margin-top:14px' }, recent, collections));
  document.title = 'Dashboard · Meridian Studio';
  ready();
})();

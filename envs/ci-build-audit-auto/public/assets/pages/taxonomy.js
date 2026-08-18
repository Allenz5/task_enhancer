/* Taxonomy manager — the classification vocabulary.
   Term names and per-term entry counts. Membership lives on a term's own page. */
(async function () {
  const { el, api, layout, stamp, ready } = window.M;
  const view = new URL(location.href).searchParams.get('v') || 'terms';
  const d = await api('/api/taxonomy/terms');

  const content = layout({
    app: 'taxonomy', active: view === 'terms' ? 'terms' : view,
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Taxonomy', href: '/taxonomy' },
      { label: view === 'terms' ? 'Source lines' : view }],
  });

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, view === 'terms' ? 'Source lines' : view.charAt(0).toUpperCase() + view.slice(1)),
      el('div', { class: 'sub' }, 'Vocabulary applied to the Build Reports collection · governs classification')),
    el('div', { class: 'actions' },
      el('button', { class: 'btn' }, 'Import CSV'),
      el('button', { class: 'btn primary' }, '+ New term')));

  if (view !== 'terms') {
    content.append(head, el('div', { class: 'card' },
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, 'Nothing here yet'),
        'This vocabulary has no terms for the Build Reports collection.')));
    ready();
    return;
  }

  const rows = d.terms.map((t) => el('tr', { 'data-testid': 'term-row', 'data-term': t.slug },
    el('td', { class: 't-title' },
      el('a', { href: `/taxonomy/${t.slug}`, 'data-testid': 'term-name' }, t.name)),
    el('td', { class: 'muted mono' }, t.slug),
    el('td', { class: 'num', 'data-testid': 'term-count' }, String(t.entries)),
    el('td', { class: 'muted' }, stamp(t.updated))));

  const card = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Terms'),
      el('span', { class: 'right' }, `${d.terms.length} terms · flat vocabulary`)),
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Term'), el('th', { style: 'width:200px' }, 'Slug'),
        el('th', { class: 'num', style: 'width:110px' }, 'Entries'),
        el('th', { style: 'width:170px' }, 'Last applied'))),
      el('tbody', {}, rows)));

  const note = el('div', { class: 'note', style: 'margin-top:14px' },
    'Counts are totals across the collection. To see which entries carry a term, open the term.');

  content.append(head, card, note);
  document.body.setAttribute('data-view', 'tree');
  document.title = 'Source lines · Meridian Taxonomy';
  ready();
})();

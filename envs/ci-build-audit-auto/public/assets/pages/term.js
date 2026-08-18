/* Term detail — name, description, and the paginated membership roster.
   Members are named by reference and title. Nothing else about them is shown. */
(async function () {
  const { el, api, layout, ready } = window.M;
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
  let page = Number(new URL(location.href).searchParams.get('page') || 0);

  let first;
  try {
    first = await api(`/api/taxonomy/term/${encodeURIComponent(slug)}?page=${page}`);
  } catch (e) {
    document.body.innerHTML = '<div style="padding:60px;text-align:center"><h1>Term not found</h1>' +
      '<p class="muted"><a href="/taxonomy">Back to the vocabulary</a></p></div>';
    ready('404');
    return;
  }

  const content = layout({
    app: 'taxonomy', active: 'terms',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Taxonomy', href: '/taxonomy' },
      { label: 'Source lines', href: '/taxonomy' }, { label: first.name }],
  });

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', { 'data-testid': 'term-title' }, first.name),
      el('div', { class: 'sub' }, first.description)),
    el('div', { class: 'actions' },
      el('button', { class: 'btn' }, 'Rename term'),
      el('button', { class: 'btn' }, 'Merge into…')));

  const meta = el('div', { class: 'grid cols-3' },
    el('div', { class: 'card stat' }, el('div', { class: 'k' }, 'Entries carrying this term'),
      el('div', { class: 'v', 'data-testid': 'member-total' }, String(first.total)),
      el('div', { class: 'd' }, 'across the Build Reports collection')),
    el('div', { class: 'card stat' }, el('div', { class: 'k' }, 'Vocabulary'),
      el('div', { class: 'v', style: 'font-size:15px;margin-top:9px' }, 'Source lines'),
      el('div', { class: 'd' }, 'flat · single-select')),
    el('div', { class: 'card stat' }, el('div', { class: 'k' }, 'Slug'),
      el('div', { class: 'v mono', style: 'font-size:15px;margin-top:9px' }, first.slug),
      el('div', { class: 'd' }, 'stable identifier')));

  const tbody = el('tbody', {});
  const pageLabel = el('span', { 'data-testid': 'term-page-label' }, '');
  const prev = el('button', { class: 'btn sm', 'data-testid': 'term-prev' }, '‹ Previous');
  const next = el('button', { class: 'btn sm', 'data-testid': 'term-next' }, 'Next ›');

  const card = el('div', { class: 'card', style: 'margin-top:14px' },
    el('header', {}, el('h2', {}, 'Membership'),
      el('span', { class: 'right' }, 'entries classified under this term')),
    el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {},
        el('th', { style: 'width:110px' }, 'Reference'), el('th', {}, 'Title'))),
      tbody),
    el('div', { class: 'pager' }, pageLabel, el('span', { class: 'spacer' }), prev, next));

  content.append(head, meta, card);

  function render(d) {
    tbody.innerHTML = '';
    for (const m of d.members) {
      tbody.appendChild(el('tr', { 'data-testid': 'member-row', 'data-ref': m.reference },
        el('td', { class: 'ref' }, el('a', { href: `/entries/${m.reference}` }, m.reference)),
        el('td', { class: 't-title' }, el('a', { href: `/entries/${m.reference}` }, m.title))));
    }
    pageLabel.textContent = `Page ${d.page + 1} of ${d.pageCount} · ${d.members.length} of ${d.total} entries`;
    prev.disabled = d.page === 0;
    next.disabled = d.page >= d.pageCount - 1;
    page = d.page;
    const u = new URL(location.href);
    u.searchParams.set('page', String(page));
    history.replaceState(null, '', u);
    document.body.setAttribute('data-term-page', String(d.page));
    ready();
  }

  async function load() {
    document.body.setAttribute('data-ready', '0');
    render(await api(`/api/taxonomy/term/${encodeURIComponent(slug)}?page=${page}`));
  }

  next.addEventListener('click', () => { page += 1; load(); });
  prev.addEventListener('click', () => { page = Math.max(0, page - 1); load(); });

  render(first);
  document.title = `${first.name} · Meridian Taxonomy`;
})();

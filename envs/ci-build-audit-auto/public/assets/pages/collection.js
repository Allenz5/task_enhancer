/* Build Reports collection.
   Columns: reference, title, author, last modified, publication flag.
   Classification, workflow stage, runtime and source commit are not columns of
   this view — they are governed on other surfaces. */
(async function () {
  const { el, api, layout, stamp, ready } = window.M;

  const url = new URL(location.href);
  let page = Number(url.searchParams.get('page') || 0);
  let query = url.searchParams.get('q') || '';

  const content = layout({
    app: 'studio', active: 'collection',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' },
      { label: 'Collections', href: '/' }, { label: 'Build Reports' }],
  });

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'Build Reports'),
      el('div', { class: 'sub' }, 'Model build_report · one entry per pipeline run · edited by 6 authors')),
    el('div', { class: 'actions' },
      el('button', { class: 'btn' }, 'Import'),
      el('button', { class: 'btn primary' }, '+ New entry')));

  const input = el('input', {
    class: 'input', style: 'width:280px', placeholder: 'Search reference or title…',
    value: query, 'data-testid': 'collection-search',
  });
  const clearBtn = el('button', { class: 'btn', type: 'button', 'data-testid': 'clear-search' }, 'Clear');
  const form = el('form', { class: 'query-row', style: 'border-bottom:0;padding:9px 12px' },
    el('span', { class: 'lead' }, 'Filter'),
    input,
    el('button', { class: 'btn', type: 'submit', 'data-testid': 'search-submit' }, 'Search'),
    clearBtn,
    el('span', { class: 'muted', style: 'margin-left:auto', 'data-testid': 'match-count' }, ''));

  const tbody = el('tbody', {});
  const table = el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {},
      el('th', { style: 'width:96px' }, 'Reference'),
      el('th', {}, 'Title'),
      el('th', { style: 'width:130px' }, 'Author'),
      el('th', { style: 'width:160px' }, 'Last modified'),
      el('th', { style: 'width:110px' }, 'Publication'))),
    tbody);

  const pageLabel = el('span', { 'data-testid': 'page-label' }, '');
  const prev = el('button', { class: 'btn sm', 'data-testid': 'prev-page' }, '‹ Previous');
  const next = el('button', { class: 'btn sm', 'data-testid': 'next-page' }, 'Next ›');
  const pager = el('div', { class: 'pager' }, pageLabel, el('span', { class: 'spacer' }), prev, next);

  const card = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Entries'),
      el('span', { class: 'right' }, 'Sorted by corpus order')),
    form, table, pager);

  content.append(head, card);

  function sync() {
    const u = new URL(location.href);
    u.searchParams.set('page', String(page));
    if (query) u.searchParams.set('q', query); else u.searchParams.delete('q');
    history.replaceState(null, '', u);
  }

  async function load() {
    document.body.setAttribute('data-ready', '0');
    const d = await api(`/api/studio/collection?page=${page}&q=${encodeURIComponent(query)}`);
    page = d.page;
    tbody.innerHTML = '';
    if (!d.rows.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '5' },
        el('div', { class: 'empty' }, el('div', { class: 'big' }, 'No entries match that search'),
          'Try another reference or title, or clear the filter.'))));
    }
    for (const r of d.rows) {
      tbody.appendChild(el('tr', { 'data-ref': r.reference, 'data-testid': 'entry-row' },
        el('td', { class: 'ref' }, el('a', { href: `/entries/${r.reference}` }, r.reference)),
        el('td', { class: 't-title' },
          el('a', { href: `/entries/${r.reference}`, 'data-testid': 'entry-link' }, r.title)),
        el('td', { class: 'muted' }, r.author),
        el('td', { class: 'muted' }, stamp(r.modified)),
        el('td', {}, r.published
          ? el('span', { class: 'chip live' }, el('span', { class: 'dot' }), 'Live')
          : el('span', { class: 'chip draft' }, 'Not live'))));
    }
    form.querySelector('[data-testid="match-count"]').textContent =
      d.query ? `${d.matched} of ${d.corpus} entries match “${d.query}”` : `${d.corpus} entries`;
    pageLabel.textContent = `Page ${d.page + 1} of ${d.pageCount} · showing ${d.rows.length} of ${d.matched}`;
    prev.disabled = d.page === 0;
    next.disabled = d.page >= d.pageCount - 1;
    clearBtn.style.display = d.query ? '' : 'none';
    document.body.setAttribute('data-page', String(d.page));
    document.body.setAttribute('data-query', d.query);
    sync();
    ready();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); query = input.value.trim(); page = 0; load(); });
  clearBtn.addEventListener('click', () => { query = ''; input.value = ''; page = 0; load(); });
  next.addEventListener('click', () => { page += 1; load(); });
  prev.addEventListener('click', () => { page = Math.max(0, page - 1); load(); });

  await load();
  document.title = 'Build Reports · Meridian Studio';
})();

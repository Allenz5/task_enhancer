(async function () {
  const { el, api, layout, shortStamp, ready } = window.M;
  const d = await api('/api/trash');
  const content = layout({ app: 'studio', active: 'trash',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' }, { label: 'Trash' }] });
  content.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', {}, 'Trash'),
        el('div', { class: 'sub' }, 'Soft-deleted entries from other collections · purged automatically')),
      el('div', { class: 'actions' }, el('button', { class: 'btn' }, 'Empty trash'))),
    el('div', { class: 'card' },
      el('header', {}, el('h2', {}, 'Deleted entries')),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Id'), el('th', {}, 'Title'), el('th', {}, 'Collection'),
          el('th', {}, 'Deleted by'), el('th', {}, 'When'), el('th', { class: 'num' }, 'Purge in'))),
        el('tbody', {}, d.items.map((t) => el('tr', {},
          el('td', { class: 'ref' }, t.id),
          el('td', { class: 't-title' }, t.title),
          el('td', { class: 'muted' }, t.collection),
          el('td', { class: 'muted' }, t.deleted_by),
          el('td', { class: 'muted' }, shortStamp(t.deleted)),
          el('td', { class: 'num muted' }, `${t.purge_in_days} d`)))))));
  ready();
})();

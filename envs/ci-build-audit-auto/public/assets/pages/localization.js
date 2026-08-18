(async function () {
  const { el, api, layout, ready } = window.M;
  const d = await api('/api/localization');
  const content = layout({ app: 'studio', active: 'localization',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' }, { label: 'Localization' }] });
  content.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', {}, 'Localization'),
        el('div', { class: 'sub' }, 'Translation status per locale for the site’s other collections')),
      el('div', { class: 'actions' }, el('button', { class: 'btn' }, 'Export XLIFF'))),
    el('div', { class: 'card' },
      el('header', {}, el('h2', {}, 'Locales')),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Locale'), el('th', {}, 'Code'), el('th', {}, 'Role'),
          el('th', { style: 'width:220px' }, 'Translated'), el('th', { class: 'num' }, 'Outdated'))),
        el('tbody', {}, d.locales.map((l) => el('tr', {},
          el('td', { class: 't-title' }, l.name),
          el('td', { class: 'mono muted' }, l.code),
          el('td', {}, el('span', { class: l.role === 'source' ? 'chip accent' : 'chip' }, l.role)),
          el('td', {}, el('div', { style: 'display:flex;gap:8px;align-items:center' },
            el('div', { class: 'meter', style: 'flex:1' }, el('span', { style: `width:${l.translated}%` })),
            el('span', { class: 'muted' }, `${l.translated}%`))),
          el('td', { class: 'num muted' }, String(l.outdated))))))));
  ready();
})();

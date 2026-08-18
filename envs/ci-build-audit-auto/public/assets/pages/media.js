(async function () {
  const { el, api, layout, shortStamp, ready } = window.M;
  const d = await api('/api/media');
  const content = layout({ app: 'studio', active: 'media',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' }, { label: 'Media Library' }] });

  const pct = Math.round((d.used_mb / d.quota_mb) * 100);
  content.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', {}, 'Media Library'),
        el('div', { class: 'sub' }, `${d.assets.length} assets · screenshots and diagrams used by the status site`)),
      el('div', { class: 'actions' }, el('button', { class: 'btn' }, 'New folder'),
        el('button', { class: 'btn primary' }, '↑ Upload'))),
    el('div', { class: 'card', style: 'margin-bottom:14px' },
      el('div', { class: 'body' },
        el('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:7px' },
          el('strong', {}, 'Storage'),
          el('span', { class: 'muted' }, `${d.used_mb} MB of ${d.quota_mb} MB used`),
          el('span', { class: 'chip accent', style: 'margin-left:auto' }, `${pct}%`)),
        el('div', { class: 'meter' }, el('span', { style: `width:${pct}%` })))),
    el('div', { class: 'card' },
      el('header', {}, el('h2', {}, 'Assets')),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Asset'), el('th', {}, 'Kind'),
          el('th', {}, 'Dimensions'), el('th', { class: 'num' }, 'Size'),
          el('th', {}, 'Uploaded by'), el('th', {}, 'When'), el('th', { class: 'num' }, 'Used in'))),
        el('tbody', {}, d.assets.map((a) => el('tr', {},
          el('td', { class: 't-title' }, a.name),
          el('td', {}, el('span', { class: 'chip violet' }, a.kind)),
          el('td', { class: 'muted mono' }, `${a.width}×${a.height}`),
          el('td', { class: 'num muted' }, `${a.size_kb} KB`),
          el('td', { class: 'muted' }, a.uploaded_by),
          el('td', { class: 'muted' }, shortStamp(a.uploaded)),
          el('td', { class: 'num muted' }, String(a.used_in))))))));
  ready();
})();

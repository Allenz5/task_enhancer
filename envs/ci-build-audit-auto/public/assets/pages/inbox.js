(async function () {
  const { el, api, layout, shortStamp, ready } = window.M;
  const d = await api('/api/inbox');
  const unread = d.threads.filter((t) => t.unread).length;
  const content = layout({ app: 'studio', active: 'inbox', unread,
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' }, { label: 'Mentions' }] });
  content.append(
    el('div', { class: 'page-head' },
      el('div', {}, el('h1', {}, 'Mentions & comments'),
        el('div', { class: 'sub' }, `${unread} unread across ${d.threads.length} editorial threads`)),
      el('div', { class: 'actions' }, el('button', { class: 'btn' }, 'Mark all read'))),
    el('div', { class: 'card' },
      el('header', {}, el('h2', {}, 'Inbox')),
      el('table', { class: 'tbl' }, el('tbody', {}, d.threads.map((t) => el('tr', {},
        el('td', { style: 'width:8px' }, t.unread ? el('span', { class: 'chip accent' }, '●') : ''),
        el('td', { style: 'width:120px' }, t.author),
        el('td', { class: 'muted', style: 'width:150px' }, t.thread),
        el('td', {}, t.body),
        el('td', { class: 'muted', style: 'width:120px' }, shortStamp(t.at))))))));
  ready();
})();

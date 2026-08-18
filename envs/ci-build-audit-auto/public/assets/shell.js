/* Meridian shell — sidebar, breadcrumb bar, and small shared helpers.
   No data lives here; every page fetches its own surface from the API. */
(function () {
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
    return n;
  };

  async function api(path) {
    const r = await fetch(path, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return r.json();
  }

  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function stamp(iso) {
    const d = new Date(iso);
    return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  function shortStamp(iso) {
    const d = new Date(iso);
    return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  const STUDIO_NAV = [
    { group: 'Content' },
    { href: '/', label: 'Dashboard', ico: '◧', key: 'dashboard' },
    { href: '/collection', label: 'Build Reports', ico: '▤', key: 'collection', count: '48' },
    { href: '/media', label: 'Media Library', ico: '◈', key: 'media' },
    { href: '/trash', label: 'Trash', ico: '⌫', key: 'trash' },
    { group: 'Workspace' },
    { href: '/inbox', label: 'Mentions', ico: '✉', key: 'inbox', badge: true },
    { href: '/localization', label: 'Localization', ico: '⌘', key: 'localization' },
  ];
  const TAXONOMY_NAV = [
    { group: 'Vocabularies' },
    { href: '/taxonomy', label: 'Source lines', ico: '⌗', key: 'terms' },
    { href: '/taxonomy?v=topics', label: 'Topics', ico: '⌗', key: 'topics' },
    { href: '/taxonomy?v=audiences', label: 'Audiences', ico: '⌗', key: 'audiences' },
    { group: 'Governance' },
    { href: '/taxonomy?v=rules', label: 'Assignment rules', ico: '⚖', key: 'rules' },
  ];
  const DELIVERY_NAV = [
    { group: 'Read API' },
    { href: '/delivery', label: 'Query composer', ico: '⌁', key: 'query' },
    { href: '/delivery?tab=schema', label: 'Content model', ico: '▤', key: 'schema' },
    { group: 'Operations' },
    { href: '/delivery?tab=webhooks', label: 'Webhook log', ico: '↯', key: 'webhooks' },
    { href: '/delivery?tab=keys', label: 'API keys', ico: '🔑', key: 'keys' },
  ];

  function sidebar(app, activeKey, unread) {
    const navItems = app === 'taxonomy' ? TAXONOMY_NAV : app === 'delivery' ? DELIVERY_NAV : STUDIO_NAV;
    const surfaces = [
      { id: 'studio', label: 'Studio', href: '/', hint: 'Authoring' },
      { id: 'taxonomy', label: 'Taxonomy', href: '/taxonomy', hint: 'Classification' },
      { id: 'delivery', label: 'Delivery Console', href: '/delivery', hint: 'Read API' },
    ];
    return el('aside', { class: 'sidebar' },
      el('div', { class: 'brand' },
        el('div', { class: 'mark' }, 'M'),
        el('div', {},
          el('div', { class: 'name' }, 'Meridian'),
          el('div', { class: 'env' }, 'status-site · production'))),
      el('div', { class: 'appswitch' },
        el('div', { class: 'label' }, 'Suite'),
        surfaces.map((s) =>
          el('a', { href: s.href, class: s.id === app ? 'on' : '', 'data-testid': `app-${s.id}` },
            el('span', { class: 'dot' }), s.label))),
      el('nav', { class: 'nav' },
        navItems.map((n) =>
          n.group
            ? el('div', { class: 'group' }, n.group)
            : el('a', { href: n.href, class: n.key === activeKey ? 'on' : '', 'data-testid': `nav-${n.key}` },
                el('span', { class: 'ico' }, n.ico), n.label,
                n.badge && unread ? el('span', { class: 'badge' }, String(unread)) : null,
                n.count ? el('span', { class: 'count' }, n.count) : null))),
      app === 'studio'
        ? el('div', { class: 'promo' },
            el('h4', {}, 'Meridian Insights'),
            el('p', {}, 'Editorial analytics with per-collection funnels.'),
            el('span', { class: 'btn-mini' }, 'Browse marketplace'))
        : null);
  }

  function topbar(crumbs) {
    const parts = [];
    crumbs.forEach((c, i) => {
      if (i) parts.push(el('span', { class: 'sep' }, '/'));
      parts.push(c.href ? el('a', { href: c.href }, c.label) : el('span', { class: 'here' }, c.label));
    });
    return el('header', { class: 'topbar' },
      el('div', { class: 'crumbs' }, parts),
      el('div', { class: 'spacer' }),
      el('input', { class: 'gsearch', placeholder: 'Jump to…', 'aria-label': 'Global search' }),
      el('div', { class: 'avatar', title: 'n.varga · editor' }, 'NV'));
  }

  /** Mounts the chrome and returns the empty content element for the page. */
  function layout({ app, active, crumbs, unread }) {
    document.body.innerHTML = '';
    const content = el('div', { class: 'content' });
    const workarea = el('div', { class: 'workarea' }, topbar(crumbs || []), content);
    document.body.appendChild(el('div', { class: `app ${app}` }, sidebar(app, active, unread), workarea));
    return content;
  }

  const ready = (v) => document.body.setAttribute('data-ready', v || '1');

  window.M = { el, api, layout, stamp, shortStamp, ready, pad };
})();

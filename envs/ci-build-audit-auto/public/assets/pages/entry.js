/* Entry editor.
   Authoring fields only. The body ships with its template tokens unresolved —
   the runtime sentence is a token here, not a number. The source chip is the
   abbreviated commit. Classification and workflow stage are governed elsewhere
   and are stated as such rather than shown. */
(async function () {
  const { el, api, layout, stamp, ready } = window.M;

  const ref = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
  let d;
  try {
    d = await api(`/api/studio/entry/${encodeURIComponent(ref)}`);
  } catch (err) {
    document.body.innerHTML = '<div style="padding:60px;text-align:center"><h1>Entry not found</h1>' +
      '<p class="muted"><a href="/collection">Back to Build Reports</a></p></div>';
    ready('404');
    return;
  }

  const content = layout({
    app: 'studio', active: 'collection',
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Studio', href: '/' },
      { label: 'Build Reports', href: '/collection' }, { label: d.reference }],
  });

  /* ---------------- header + actions ---------------- */
  const menu = el('div', { class: 'menu', 'data-testid': 'entry-menu', style: 'display:none' },
    el('button', { 'data-testid': 'menu-export' }, '⤓  Export publish bundle…'),
    el('button', {}, '⧉  Duplicate entry'),
    el('button', {}, '⧉  Copy reference'),
    el('div', { class: 'div' }),
    el('button', { class: 'danger' }, '⌫  Move to trash'));

  const menuTrigger = el('button', { class: 'btn', 'data-testid': 'entry-menu-trigger', 'aria-expanded': 'false' }, 'Actions ▾');
  menuTrigger.addEventListener('click', () => {
    const open = menu.style.display === 'none';
    menu.style.display = open ? '' : 'none';
    menuTrigger.setAttribute('aria-expanded', String(open));
    document.body.setAttribute('data-menu-open', open ? '1' : '0');
  });

  const previewBtn = el('button', { class: 'btn', 'data-testid': 'btn-preview' }, '◱  Preview on site');

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', { 'data-testid': 'entry-title' }, d.title),
      el('div', { class: 'sub' },
        `${d.collection} · ${d.reference} · revision ${d.revision} · ${d.locale}`)),
    el('div', { class: 'actions' },
      previewBtn,
      el('div', { class: 'menu-wrap' }, menuTrigger, menu),
      el('button', { class: 'btn primary' }, 'Save entry')));

  /* ---------------- left column: fields + body ---------------- */
  const fields = el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Fields')),
    el('div', { class: 'body' },
      el('div', { class: 'grid cols-2' },
        el('div', { class: 'field' }, el('label', {}, 'Title'),
          el('input', { class: 'input', style: 'width:100%', value: d.title })),
        el('div', { class: 'field' }, el('label', {}, 'Slug'),
          el('input', { class: 'input mono', style: 'width:100%', value: d.slug, 'data-testid': 'entry-slug' }))),
      el('div', { class: 'grid cols-4' },
        el('div', { class: 'field' }, el('label', {}, 'Reference'),
          el('div', { class: 'val mono', 'data-testid': 'entry-reference' }, d.reference)),
        el('div', { class: 'field' }, el('label', {}, 'Author'),
          el('div', { class: 'val', 'data-testid': 'entry-author' }, d.author)),
        el('div', { class: 'field' }, el('label', {}, 'Created'),
          el('div', { class: 'val muted' }, stamp(d.created))),
        el('div', { class: 'field' }, el('label', {}, 'Last modified'),
          el('div', { class: 'val muted', 'data-testid': 'entry-modified' }, stamp(d.modified)))),
      el('div', { class: 'field' }, el('label', {}, 'Publication'),
        el('div', {}, d.published
          ? el('span', { class: 'chip live' }, el('span', { class: 'dot' }), 'Live on site')
          : el('span', { class: 'chip draft' }, 'Not live')))));

  const body = el('div', { class: 'card', style: 'margin-top:14px' },
    el('header', {}, el('h2', {}, 'Body'),
      el('span', { class: 'right' }, 'Markdown + template tokens · tokens resolve at render')),
    el('div', { class: 'body' },
      el('textarea', { class: 'body', spellcheck: 'false', 'data-testid': 'entry-body' }, d.body),
      el('div', { class: 'note', style: 'margin-top:10px' },
        'Tokens are stored unresolved in the authoring layer. ',
        el('strong', {}, 'Preview on site'),
        ' renders the entry and expands them.')));

  const tokens = el('details', { class: 'collapse', style: 'margin-top:14px' },
    el('summary', {}, `Template tokens in this body (${d.tokens.length})`),
    el('div', { class: 'inner' },
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Token'), el('th', {}, 'Resolves to'))),
        el('tbody', {}, d.tokens.map((t) => el('tr', {},
          el('td', {}, el('span', { class: 'token-tag' }, t.token)),
          el('td', { class: 'muted' }, t.resolves)))))));

  /* ---------------- right column: sidebar panels ---------------- */
  const source = el('div', { class: 'card' },
    el('header', {}, el('h3', {}, 'Source')),
    el('div', { class: 'body' },
      el('div', { class: 'field' }, el('label', {}, 'Commit'),
        el('div', {},
          el('span', { class: 'chip accent mono', 'data-testid': 'source-chip' }, d.source.short),
          el('span', { class: 'muted', style: 'margin-left:8px;font-size:12px' }, 'abbreviated'))),
      el('div', { class: 'field' }, el('label', {}, 'Subject'),
        el('div', { class: 'val muted' }, d.source.message)),
      el('div', { class: 'grid cols-2' },
        el('div', { class: 'field' }, el('label', {}, 'Runner'), el('div', { class: 'val mono' }, d.runner)),
        el('div', { class: 'field' }, el('label', {}, 'Suite'), el('div', { class: 'val mono' }, d.suite))),
      el('div', { class: 'note' },
        'On-screen surfaces abbreviate the commit. The full identifier travels in the publish bundle.')));

  const governance = el('div', { class: 'card', style: 'margin-top:14px' },
    el('header', {}, el('h3', {}, 'Governed elsewhere')),
    el('div', { class: 'body' },
      el('dl', { class: 'kv' },
        el('dt', {}, 'Classification'),
        el('dd', {}, d.governance.classification, ' · ', el('a', { href: '/taxonomy' }, 'open Taxonomy')),
        el('dt', {}, 'Workflow stage'),
        el('dd', {}, d.governance.workflow_stage, ' · ', el('a', { href: '/delivery' }, 'open Console'))),
      el('div', { class: 'note', style: 'margin-top:10px' },
        'These values are not authoring fields and are not editable here.')));

  const seo = el('details', { class: 'collapse', style: 'margin-top:14px' },
    el('summary', {}, `SEO readiness — ${d.seo.score}/100`),
    el('div', { class: 'inner' },
      el('div', { class: 'meter', style: 'margin-bottom:10px' }, el('span', { style: `width:${d.seo.score}%` })),
      d.seo.suggestions.map((s) => el('div', { style: 'margin-bottom:8px' },
        el('div', { style: 'font-weight:500' }, s.title),
        el('div', { class: 'muted' }, s.detail)))));

  const activity = el('div', { class: 'card', style: 'margin-top:14px' },
    el('header', {}, el('h3', {}, 'Activity')),
    el('div', { class: 'body muted', style: 'font-size:12px' },
      el('div', {}, `${stamp(d.modified)} — ${d.author} edited the body`),
      el('div', {}, `${stamp(d.created)} — publisher created the entry`)));

  content.append(head,
    el('div', { class: 'split' },
      el('div', {}, fields, body, tokens),
      el('div', {}, source, governance, seo, activity)));

  /* ---------------- export bundle (menu → modal → download) ---------------- */
  let scrim = null;
  function closeModal() {
    if (scrim) { scrim.remove(); scrim = null; }
    document.body.setAttribute('data-export', 'closed');
  }

  menu.querySelector('[data-testid="menu-export"]').addEventListener('click', () => {
    menu.style.display = 'none';
    menuTrigger.setAttribute('aria-expanded', 'false');
    document.body.setAttribute('data-menu-open', '0');

    const bundleHref = `/api/studio/entry/${encodeURIComponent(d.reference)}/bundle`;
    const confirmLink = el('a', {
      class: 'btn primary', href: bundleHref, download: '', 'data-testid': 'export-confirm',
    }, 'Export bundle');

    const modalBody = el('div', { class: 'body' },
      el('p', { style: 'margin-top:0' },
        'The publish bundle is this entry’s authoring source: frontmatter plus the body ',
        'markdown with its tokens unresolved. Derived metrics and relational data are not included.'),
      el('div', { class: 'radio-row on' },
        el('input', { type: 'radio', name: 'fmt', checked: true }),
        el('div', {}, el('div', { class: 't' }, 'Markdown bundle (.md)'),
          el('div', { class: 'd' }, 'Frontmatter + body, one file for this entry'))),
      el('div', { class: 'radio-row' },
        el('input', { type: 'radio', name: 'fmt', disabled: true }),
        el('div', {}, el('div', { class: 't' }, 'Collection archive (.zip)'),
          el('div', { class: 'd' }, 'Bulk export is disabled for this workspace'))));

    const footer = el('footer', {},
      el('button', { class: 'btn', 'data-testid': 'export-cancel', onclick: closeModal }, 'Cancel'),
      confirmLink);

    const modal = el('div', { class: 'modal', 'data-testid': 'export-modal' },
      el('header', {}, el('h3', {}, `Export publish bundle — ${d.reference}`)),
      modalBody, footer);

    scrim = el('div', { class: 'scrim' }, modal);
    document.body.appendChild(scrim);
    document.body.setAttribute('data-export', 'open');

    confirmLink.addEventListener('click', () => {
      // The browser takes the download; the modal moves to its confirmation.
      modalBody.innerHTML = '';
      modalBody.append(
        el('div', { class: 'note', 'data-testid': 'export-done' },
          '✓ Bundle downloaded — ', el('span', { class: 'mono' }, `${d.slug}.bundle.md`)),
        el('p', { class: 'muted', style: 'margin-bottom:0' },
          'The file contains the full-length source commit identifier for this entry.'));
      footer.innerHTML = '';
      footer.appendChild(el('button', { class: 'btn primary', 'data-testid': 'export-dismiss', onclick: closeModal }, 'Done'));
      document.body.setAttribute('data-export', 'downloaded');
    });
  });

  /* ---------------- preview (renders tokens) ---------------- */
  previewBtn.addEventListener('click', async () => {
    const doc = el('div', { class: 'preview-doc', 'data-testid': 'preview-body' });
    const pane = el('div', { class: 'preview-pane' },
      el('div', { class: 'preview-bar' },
        el('span', { class: 'chip accent' }, 'Preview'),
        el('div', { class: 'url' }, `https://status.example.com/build-reports/${d.slug}`),
        el('button', { class: 'btn sm', 'data-testid': 'btn-close-preview' }, 'Close preview')),
      el('div', { class: 'rendering', 'data-testid': 'preview-rendering' }, 'Rendering entry and resolving tokens…'));
    const shell = el('div', { class: 'preview-shell', 'data-testid': 'preview-panel' }, pane);
    document.body.appendChild(shell);
    document.body.setAttribute('data-preview', 'rendering');
    pane.querySelector('[data-testid="btn-close-preview"]').addEventListener('click', () => {
      shell.remove();
      document.body.setAttribute('data-preview', 'closed');
    });

    const p = await api(`/api/studio/entry/${encodeURIComponent(d.reference)}/render`);
    await new Promise((r) => setTimeout(r, 120)); // fixed render budget
    pane.querySelector('[data-testid="preview-rendering"]').remove();
    doc.append(
      el('div', { class: 'eyebrow' }, 'Build report'),
      el('h1', {}, p.headline),
      el('div', { class: 'byline' }, `By ${p.byline} · ${stamp(p.published_at)} · ${p.locale}`),
      ...p.sections.flatMap((s) => [el('h2', {}, s.heading), ...s.paragraphs.map((t) => el('p', {}, t))]),
      el('h2', {}, 'Timing'),
      el('p', { 'data-testid': 'preview-runtime' },
        `${p.runtime_sentence.lead} `,
        el('strong', {}, String(p.runtime_sentence.value)),
        ` ${p.runtime_sentence.unit}.`),
      el('p', {}, p.queue_sentence),
      el('h2', {}, 'Source'),
      el('p', { 'data-testid': 'preview-credit' }, p.credit),
      el('div', { class: 'credit' }, 'Published by the Meridian status-site publisher · en-GB'));
    pane.appendChild(doc);
    document.body.setAttribute('data-preview', 'ready');
  });

  document.body.setAttribute('data-entry', d.reference);
  document.title = `${d.reference} · Meridian Studio`;
  ready();
})();

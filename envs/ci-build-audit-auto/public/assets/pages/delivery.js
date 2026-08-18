/* Delivery Console — the read API for the status site.
   Responses are projected to public fields. Fields flagged private in the model
   are omitted from every response, whatever filter was composed. */
(async function () {
  const { el, api, layout, stamp, shortStamp, ready } = window.M;
  const tab = new URL(location.href).searchParams.get('tab') || 'query';
  const schema = await api('/api/delivery/schema');

  const content = layout({
    app: 'delivery', active: tab === 'query' ? 'query' : tab,
    crumbs: [{ label: 'status-site', href: '/' }, { label: 'Delivery Console', href: '/delivery' },
      { label: { query: 'Query composer', schema: 'Content model', webhooks: 'Webhook log', keys: 'API keys' }[tab] || tab }],
  });

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('h1', {}, 'Delivery Console'),
      el('div', { class: 'sub' }, 'Read API · environment production · model build_report v' + schema.version)),
    el('div', { class: 'actions' },
      el('span', { class: 'chip live' }, el('span', { class: 'dot' }), 'API healthy'),
      el('button', { class: 'btn' }, 'Docs')));

  const tabs = el('div', { class: 'tabs' },
    [['query', 'Query composer'], ['schema', 'Content model'], ['webhooks', 'Webhook log'], ['keys', 'API keys']]
      .map(([id, label]) => el('button', {
        class: id === tab ? 'on' : '', onclick: () => { location.href = `/delivery?tab=${id}`; },
      }, label)));

  content.append(head, tabs);

  const schemaCard = () => el('div', { class: 'card' },
    el('header', {}, el('h2', {}, 'Content model — build_report'),
      el('span', { class: 'right' }, `${schema.fields.length} fields`)),
    el('table', { class: 'tbl schema-tbl' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Field'), el('th', { style: 'width:110px' }, 'Type'),
        el('th', { style: 'width:100px' }, 'Visibility'), el('th', { style: 'width:100px' }, 'Queryable'),
        el('th', {}, 'Note'))),
      el('tbody', {}, schema.fields.map((f) => el('tr', {},
        el('td', { class: 'mono' }, f.field),
        el('td', { class: 'muted' }, f.type),
        el('td', { class: f.visibility === 'private' ? 'vis-private' : '' }, f.visibility),
        el('td', { class: 'muted' }, f.queryable ? 'yes' : 'no'),
        el('td', { class: 'muted' }, f.note))))));

  if (tab === 'schema') {
    content.append(schemaCard());
    ready(); return;
  }

  if (tab === 'webhooks' || tab === 'keys') {
    const w = await api('/api/delivery/webhooks');
    if (tab === 'webhooks') {
      const rows = w.deliveries.map((x) => el('tr', {},
        el('td', { class: 'ref' }, x.id),
        el('td', { class: 'mono' }, x.target),
        el('td', { class: 'muted' }, x.event),
        el('td', {}, el('span', { class: `chip ${x.code === 200 ? 'live' : 'stop'}` }, String(x.code))),
        el('td', { class: 'num' }, `${x.ms} ms`),
        el('td', { class: 'muted' }, shortStamp(x.at))));
      const thead = el('thead', {}, el('tr', {},
        el('th', {}, 'Delivery'), el('th', {}, 'Target'), el('th', {}, 'Event'),
        el('th', {}, 'Status'), el('th', { class: 'num' }, 'Time'), el('th', {}, 'When')));
      content.append(el('div', { class: 'card' },
        el('header', {}, el('h2', {}, 'Recent webhook deliveries'),
          el('span', { class: 'right' }, 'last 24 hours')),
        el('table', { class: 'tbl' }, thead, el('tbody', {}, rows))));
    } else {
      const rows = w.keys.map((k) => el('tr', {},
        el('td', { class: 't-title' }, k.name),
        el('td', { class: 'mono' }, `${k.prefix}…`),
        el('td', {}, el('span', { class: 'chip' }, k.scope)),
        el('td', { class: 'muted' }, k.created),
        el('td', { class: 'muted' }, k.last_used)));
      const thead = el('thead', {}, el('tr', {},
        el('th', {}, 'Name'), el('th', {}, 'Prefix'), el('th', {}, 'Scope'),
        el('th', {}, 'Created'), el('th', {}, 'Last used')));
      content.append(el('div', { class: 'card' },
        el('header', {}, el('h2', {}, 'API keys'),
          el('span', { class: 'right' }, 'read scope only')),
        el('table', { class: 'tbl' }, thead, el('tbody', {}, rows))));
    }
    ready();
    return;
  }

  /* ------------------------- query composer ------------------------- */
  const stageDim = schema.dimensions.find((x) => x.id === 'workflow_stage');

  const stageSelect = el('select', { class: 'select', 'data-testid': 'stage-select' },
    el('option', { value: '' }, '— choose a workflow stage —'),
    stageDim.values.map((v) => el('option', { value: v.id }, v.label)));

  const sinceInput = el('input', { class: 'input', type: 'date', 'data-testid': 'since-input' });

  const runBtn = el('button', { class: 'btn primary', 'data-testid': 'run-query', disabled: true }, 'Run query');

  const reqPre = el('pre', { class: 'req', 'data-testid': 'request-preview' }, '');
  function renderReq() {
    const stage = stageSelect.value;
    const since = sinceInput.value;
    reqPre.textContent =
      `GET /v1/content/build-reports\n` +
      `  ?filter[workflow_stage]=${stage || '‹unset›'}\n` +
      (since ? `  &filter[modified][gte]=${since}\n` : '') +
      `  &fields=reference,slug,title\n` +
      `Authorization: Bearer mrd_live_9f2c…`;
    runBtn.disabled = !stage;
  }
  stageSelect.addEventListener('change', () => {
    renderReq();
    document.body.setAttribute('data-stage', stageSelect.value);
  });
  sinceInput.addEventListener('change', renderReq);
  renderReq();

  const composer = el('div', { class: 'query-box' },
    el('div', { class: 'query-row' },
      el('span', { class: 'lead' }, 'Collection'),
      el('span', { class: 'chip accent' }, 'build-reports'),
      el('span', { class: 'muted' }, 'the only collection exposed to this key')),
    el('div', { class: 'query-row' },
      el('span', { class: 'lead' }, 'Workflow stage'),
      stageSelect,
      el('span', { class: 'muted' }, 'required filter dimension')),
    el('div', { class: 'query-row' },
      el('span', { class: 'lead' }, 'Modified since'),
      sinceInput,
      el('span', { class: 'muted' }, 'optional')),
    el('div', { class: 'query-row' },
      el('span', { class: 'lead' }, 'Classification'),
      el('span', { class: 'chip' }, 'not queryable'),
      el('span', { class: 'muted' }, 'resolved at publish time — see the content model')),
    el('div', { class: 'query-row' },
      el('span', { class: 'lead' }, ''), runBtn,
      el('button', { class: 'btn', 'data-testid': 'reset-query', onclick: () => { stageSelect.value = ''; sinceInput.value = ''; renderReq(); resultArea.innerHTML = ''; resultArea.appendChild(emptyResult()); document.body.setAttribute('data-query-page', 'none'); } }, 'Reset')));

  const emptyResult = () => el('div', { class: 'empty', 'data-testid': 'result-empty' },
    el('div', { class: 'big' }, 'No query has been run'),
    'Compose a filter above and run it to receive a result set.');

  const resultArea = el('div', { 'data-testid': 'result-area' }, emptyResult());

  const resultCard = el('div', { class: 'card', style: 'margin-top:14px' },
    el('header', {}, el('h2', {}, 'Response'),
      el('span', { class: 'right', 'data-testid': 'result-total' }, '—')),
    resultArea);

  let page = 0;

  async function run() {
    const stage = stageSelect.value;
    if (!stage) return;
    document.body.setAttribute('data-ready', '0');
    resultArea.innerHTML = '';
    resultArea.appendChild(el('div', { class: 'empty', 'data-testid': 'result-running' }, 'Executing query against the read API…'));
    const since = sinceInput.value ? `&since=${sinceInput.value}T00:00:00Z` : '';
    const d = await api(`/api/delivery/query?stage=${encodeURIComponent(stage)}&page=${page}${since}`);
    await new Promise((r) => setTimeout(r, 150)); // fixed API budget

    page = d.page;
    const rows = d.results.map((r) => el('tr', { 'data-testid': 'result-row', 'data-ref': r.reference },
      el('td', { class: 'ref' }, r.reference),
      el('td', { class: 'mono muted' }, r.slug),
      el('td', { class: 't-title' }, r.title)));

    const prev = el('button', { class: 'btn sm', 'data-testid': 'result-prev', disabled: d.page === 0 }, '‹ Previous');
    const next = el('button', { class: 'btn sm', 'data-testid': 'result-next', disabled: d.page >= d.pageCount - 1 }, 'Next ›');
    prev.addEventListener('click', () => { page = Math.max(0, page - 1); run(); });
    next.addEventListener('click', () => { page += 1; run(); });

    resultArea.innerHTML = '';
    resultArea.append(
      el('div', { class: 'query-row', style: 'background:var(--surface-2)' },
        el('span', { class: 'chip live' }, '200 OK'),
        el('span', { class: 'muted mono' }, `filter[workflow_stage]=${d.query.workflow_stage}`),
        el('span', { class: 'muted' }, `projection: ${d.projection.join(', ')}`)),
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {},
          el('th', { style: 'width:110px' }, 'reference'),
          el('th', { style: 'width:340px' }, 'slug'),
          el('th', {}, 'title'))),
        el('tbody', {}, rows)),
      el('div', { class: 'pager' },
        el('span', { 'data-testid': 'result-page-label' },
          `Page ${d.page + 1} of ${d.pageCount} · ${d.results.length} of ${d.total} matches`),
        el('span', { class: 'spacer' }), prev, next));

    resultCard.querySelector('[data-testid="result-total"]').textContent = `${d.total} matches`;
    document.body.setAttribute('data-query-page', String(d.page));
    ready();
  }

  runBtn.addEventListener('click', () => { page = 0; run(); });

  content.append(composer, resultCard, el('div', { style: 'margin-top:14px' }, schemaCard()),
    el('div', { class: 'note', style: 'margin-top:14px' },
      'Private fields (runtime_seconds, source_commit, classification) are never projected into a response. ',
      'They exist only in the authoring layer.'));

  document.body.setAttribute('data-query-page', 'none');
  document.title = 'Query composer · Delivery Console';
  ready();
})();

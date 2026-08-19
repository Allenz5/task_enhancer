'use strict';

/*
 * Foliant Content Library — workspace server.
 *
 * Every value this server publishes is read out of ./input at request time.
 * Nothing from input/ is transcribed into this file; only invented workspace
 * chrome (owners, folder paths, timestamps, activity copy) is authored here.
 *
 * Each surface has its own endpoint, and each endpoint carries only the fields
 * that surface is permitted to reveal, so no view's payload leaks a field that
 * belongs to a later view.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = Number(process.env.PORT) || 5175;
const INPUT_DIR = path.join(__dirname, 'input');

const readInput = (file) =>
  JSON.parse(fs.readFileSync(path.join(INPUT_DIR, file), 'utf8'));

const getRecords = () => readInput('records.json').records;
const getRules = () => readInput('rules.json');
const getContract = () => readInput('output_contract.json');
const getEdgeCases = () => readInput('public_edge_cases.json');

/* ------------------------------------------------------------------ *
 * Cross-surface pointers.
 *
 * Where a contract clause would otherwise reprint a value another surface
 * owns, we publish a pointer instead so each value keeps exactly one home.
 * ------------------------------------------------------------------ */
const ptr = (where) => `«see ${where}»`;
const PTR = {
  keyboard: ptr('Workspace ▸ Keyboard shortcuts'),
  widths: ptr('Documents ▸ Responsive preview presets'),
  contentTypes: ptr('Library Administration ▸ Content types'),
  administration: ptr('Library Administration'),
  hints: ptr('Developer Center ▸ Behaviour guide'),
  events: ptr('Developer Center ▸ Component & module contract'),
  breakpoint: ptr('the layout descriptor returned by the sample request console'),
  referenceResponse: ptr('Developer Center ▸ Endpoint reference ▸ Sample request console'),
};

/* ------------------------------------------------------------------ *
 * Invented workspace chrome. Positional, so it is stable for any input.
 * ------------------------------------------------------------------ */
const OWNERS = ['Priya Raman', 'Devon Alvarez', 'Lena Hoffmann', 'Marcus Bell'];
const LOCATIONS = [
  '/Engineering/Specs',
  '/Compliance/Briefs',
  '/Engineering/Notes',
  '/Product/Releases',
];
const MODIFIED = [
  '2026-05-28T11:05:00Z',
  '2026-03-07T14:52:00Z',
  '2026-04-19T08:33:00Z',
  '2026-06-02T16:40:00Z',
];
const VERSIONS = ['3.0', '7.2', '2.1', '11.0'];
const PERMISSIONS = ['Contribute', 'Read', 'Contribute', 'Full control'];
const CHECKED_OUT = ['', 'Devon Alvarez', '', ''];
const QUEUED_AT = [
  '2026-06-03T08:14:22Z',
  '2026-06-03T08:16:41Z',
  '2026-06-03T08:19:07Z',
  '2026-06-03T08:21:55Z',
];
const RETRIES = [0, 1, 4, 0];
const PROFILES = ['lan-direct', 'wan-accelerated', 'wan-accelerated', 'lan-direct'];
const NODES = ['node-eu-w1', 'node-eu-w1', 'node-eu-w3', 'node-us-e2'];

const pick = (arr, i) => arr[i % arr.length];

const chromeFor = (rec, i) => ({
  modified_at: pick(MODIFIED, i),
  modified_by: pick(OWNERS, i),
  location: pick(LOCATIONS, i),
  version: pick(VERSIONS, i),
  permission: pick(PERMISSIONS, i),
  checked_out_to: pick(CHECKED_OUT, i),
});

const GRID_SORTS = {
  modified: {
    id: 'modified',
    label: 'Modified',
    direction: 'Newest first',
    compare: (a, b) => b.modified_at.localeCompare(a.modified_at),
  },
  owner: {
    id: 'owner',
    label: 'Modified By',
    direction: 'A to Z',
    compare: (a, b) => a.modified_by.localeCompare(b.modified_by),
  },
  location: {
    id: 'location',
    label: 'Location',
    direction: 'A to Z',
    compare: (a, b) => a.location.localeCompare(b.location),
  },
};
const SORT_CYCLE = ['modified', 'owner', 'location'];

/* ------------------------------------------------------------------ *
 * Workspace chrome endpoints
 * ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// library_home — chrome only. Bare aggregate integers, no item ever named.
app.get('/api/home', (_req, res) => {
  const records = getRecords();
  const outstanding = records.filter((r) => r.upload_state !== 'ready').length;
  res.json({
    quota: { used_gb: 812.4, plan_gb: 2048, trend: 'up', trend_pct: 3.1 },
    index: { rebuilt: '2026-06-03T04:00:00Z', queued: 47 },
    approvals_unread: 6,
    retention_banner:
      'Retention schedule RS-14 is up for review on 30 June 2026. Library owners will be asked to reconfirm disposition rules.',
    counters: [
      { label: 'Documents in this library', value: records.length },
      { label: 'Transfers outstanding', value: outstanding },
      { label: 'Recycle bin items', value: 19 },
    ],
    activity: [
      { actor: 'Devon Alvarez', verb: 'checked out an item', when: '12 minutes ago' },
      { actor: 'Priya Raman', verb: 'restored an item from the recycle bin', when: '1 hour ago' },
      { actor: 'Automation service', verb: 'rebuilt the full-text index', when: '4 hours ago' },
      { actor: 'Lena Hoffmann', verb: 'shared a folder with Compliance', when: 'Yesterday' },
      { actor: 'Marcus Bell', verb: 'approved a retention exception', when: 'Yesterday' },
      { actor: 'Automation service', verb: 'completed a scheduled integrity scan', when: '2 days ago' },
    ],
    apps: [
      { name: 'Scanner connector', detail: 'Batch capture from networked MFDs', state: 'Connected' },
      { name: 'E-signature', detail: 'Route documents for signature', state: 'Connected' },
      { name: 'CAD viewer add-on', detail: 'Inline DWG and STEP preview', state: 'Available' },
    ],
    seats: { active: 143, provisioned: 175 },
  });
});

/* ------------------------------------------------------------------ *
 * document_grid — identity only: document_id, name, label.
 * No byte size, media type, transfer state or staging flag, and the
 * configured rows-per-page is never stated as a value.
 * ------------------------------------------------------------------ */
app.get('/api/documents', (req, res) => {
  const records = getRecords();
  const { page_size } = getRules();
  const sortId = GRID_SORTS[req.query.sort] ? req.query.sort : SORT_CYCLE[0];
  const sort = GRID_SORTS[sortId];

  const decorated = records.map((rec, i) => ({
    document_id: rec.document_id,
    name: rec.name,
    label: rec.label,
    ...chromeFor(rec, i),
  }));
  decorated.sort(sort.compare);

  const total = decorated.length;
  const pageCount = Math.max(1, Math.ceil(total / page_size));
  const pageNum = Math.min(Math.max(1, Number(req.query.page) || 1), pageCount);
  const start = (pageNum - 1) * page_size;
  const rows = decorated.slice(start, start + page_size);

  res.json({
    sort: { id: sort.id, column: sort.label, direction: sort.direction },
    sort_cycle: SORT_CYCLE,
    next_sort: SORT_CYCLE[(SORT_CYCLE.indexOf(sortId) + 1) % SORT_CYCLE.length],
    page: pageNum,
    page_count: pageCount,
    total,
    range: { from: total === 0 ? 0 : start + 1, to: start + rows.length },
    rows,
    saved_searches: ['Awaiting my approval', 'Modified this week', 'Shared with Compliance', 'Large media'],
    recycle_bin: { items: 19, purge_in_days: 23 },
  });
});

/* ------------------------------------------------------------------ *
 * document_properties — one element, byte count and media type only.
 * ------------------------------------------------------------------ */
app.get('/api/documents/:id/properties', (req, res) => {
  const records = getRecords();
  const i = records.findIndex((r) => r.document_id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  const rec = records[i];
  const chrome = chromeFor(rec, i);
  res.json({
    document_id: rec.document_id,
    name: rec.name,
    label: rec.label,
    // Exact stored byte count, verbatim: an integer, or JSON null when the
    // size was never reported. The two never collapse into one another.
    bytes: rec.bytes,
    bytes_reported: rec.bytes !== null,
    mime: rec.mime,
    sharing: {
      groups: ['Engineering (Contribute)', 'Compliance (Read)', 'Site owners (Full control)'],
      link: { kind: 'People in Foliant with the link', expires: '2026-07-01' },
    },
    versions: [
      { rev: chrome.version, author: chrome.modified_by, comment: 'Minor edit', at: chrome.modified_at },
      { rev: '2.0', author: pick(OWNERS, i + 1), comment: 'Reviewed', at: '2026-02-11T10:00:00Z' },
      { rev: '1.0', author: pick(OWNERS, i + 2), comment: 'Initial upload', at: '2026-01-06T09:30:00Z' },
    ],
    location: chrome.location,
    checked_out_to: chrome.checked_out_to,
  });
});

/* ------------------------------------------------------------------ *
 * transfer_monitor — ingestion state for the whole population, nothing else.
 * ------------------------------------------------------------------ */
app.get('/api/transfers', (_req, res) => {
  const records = getRecords();
  res.json({
    rows: records.map((rec, i) => ({
      document_id: rec.document_id,
      name: rec.name,
      upload_state: rec.upload_state,
      queued_at: pick(QUEUED_AT, i),
      retries: pick(RETRIES, i),
      profile: pick(PROFILES, i),
      node: pick(NODES, i),
    })),
  });
});

/* ------------------------------------------------------------------ *
 * upload_tray — the staged set only, in the order items were added.
 * "Order added" is deliberately neither the library's nor the contract's.
 * ------------------------------------------------------------------ */
app.get('/api/upload-tray', (_req, res) => {
  const records = getRecords();
  const staged = records
    .map((rec, i) => ({ rec, i }))
    .filter(({ rec }) => rec.selected === true)
    .reverse() // last staged is listed first: the console's own add order
    .map(({ rec, i }, n) => ({
      document_id: rec.document_id,
      name: rec.name,
      added: `Added ${n === 0 ? '2 minutes' : '18 minutes'} ago`,
      source: pick(PROFILES, i) === 'lan-direct' ? 'This device' : 'Scanner connector',
    }));
  res.json({ count: staged.length, items: staged });
});

/* ------------------------------------------------------------------ *
 * viewport_presets — the preview widths, in configured order, and nothing else.
 * ------------------------------------------------------------------ */
const DEVICE_WORDS = ['Phone', 'Tablet', 'Small laptop', 'Desktop'];
app.get('/api/viewport-presets', (_req, res) => {
  const { viewport_widths } = getRules();
  res.json({
    presets: viewport_widths.map((w, i) => ({ width: w, device: pick(DEVICE_WORDS, i) })),
  });
});

/* ------------------------------------------------------------------ *
 * shortcuts_overlay — the upload submit binding among invented chrome bindings.
 * ------------------------------------------------------------------ */
app.get('/api/shortcuts', (_req, res) => {
  const { keyboard_submit_key } = getRules();
  res.json({
    groups: [
      {
        title: 'Navigation',
        bindings: [
          { action: 'Go to workspace home', keys: ['G', 'H'] },
          { action: 'Go to the document library', keys: ['G', 'D'] },
          { action: 'Focus search', keys: ['/'] },
          { action: 'Move between rows', keys: ['↑', '↓'] },
        ],
      },
      {
        title: 'Items',
        bindings: [
          { action: 'Rename the focused item', keys: ['F2'] },
          { action: 'Open properties', keys: ['Alt', 'P'] },
          { action: 'Open the previewer', keys: ['Space'] },
        ],
      },
      {
        title: 'Upload',
        bindings: [
          // The one binding drawn from library configuration.
          { action: 'Submit the upload', keys: [keyboard_submit_key], id: 'upload-submit' },
          { action: 'Open the upload console', keys: ['U'] },
        ],
      },
      {
        title: 'Dialogs',
        bindings: [
          { action: 'Close the active dialog', keys: ['Esc'] },
          { action: 'Show this overlay', keys: ['?'] },
        ],
      },
    ],
  });
});

/* ------------------------------------------------------------------ *
 * library administration
 * ------------------------------------------------------------------ */
app.get('/api/settings/general', (_req, res) => {
  const r = getRules();
  res.json({
    settings: [
      { key: 'mode', label: 'Behaviour profile', value: r.mode, mono: true,
        help: 'The published behaviour profile this library conforms to.' },
      { key: 'key', label: 'Item key field', value: r.key, mono: true,
        help: 'The record field treated as an item’s key across the library.' },
      { key: 'bytes_per_unit', label: 'Size unit base', value: r.bytes_per_unit, mono: false,
        help: 'Divisor used when a stored size is scaled for display.' },
      { key: 'max_name_chars', label: 'Maximum file-name length', value: r.max_name_chars, mono: false,
        help: 'Characters permitted in a stored file name.' },
      { key: 'page_size', label: 'Rows per page', value: r.page_size, mono: false,
        help: 'Rows the library listing renders before it pages.' },
    ],
    chrome: {
      owner: 'Priya Raman',
      created: '2024-11-04',
      quota_class: 'Enterprise — Tier 3',
      versioning: 'Major versions, 500 retained',
      template: 'Document Library (system)',
    },
    change_log: [
      { at: '2026-05-22', by: 'Priya Raman', note: 'Reviewed general settings' },
      { at: '2026-03-15', by: 'Marcus Bell', note: 'Applied library template update' },
      { at: '2025-12-02', by: 'Priya Raman', note: 'Confirmed configuration at annual audit' },
      { at: '2025-08-18', by: 'Lena Hoffmann', note: 'Reviewed general settings' },
    ],
  });
});

app.get('/api/settings/content-types', (_req, res) => {
  const r = getRules();
  res.json({
    allowed_mimes: r.allowed_mimes,
    upload_states: r.upload_states,
    chrome: {
      enforcement: 'Reject on ingest',
      scanning: 'Content type sniffed and compared against the declared type',
    },
  });
});

/* ------------------------------------------------------------------ *
 * developer center
 * ------------------------------------------------------------------ */

const DEV_SECTIONS = [
  { id: 'reference', title: 'Endpoint reference', href: '/developer/reference',
    blurb: 'What the view-model accepts and what it returns, field by field.' },
  { id: 'behavior', title: 'Behaviour guide', href: '/developer/behavior',
    blurb: 'How a row’s derived text is computed from what the library stores.' },
  { id: 'errors', title: 'Error reference', href: '/developer/errors',
    blurb: 'What an integration must reject rather than produce a result for.' },
  { id: 'components', title: 'Component & module contract', href: '/developer/components',
    blurb: 'The modules an integration ships, what they export and what they emit.' },
];

app.get('/api/developer/index', (_req, res) => {
  const c = getContract();
  res.json({
    schema_version: c.schema_version,
    encoding: c.encoding,
    execution: c.execution,
    sections: DEV_SECTIONS,
    configuration_home: PTR.administration,
  });
});

// Turn a JSON-Schema-ish node into displayable constraint rows, replacing any
// enumeration whose home is elsewhere in the workspace with a pointer.
function constraintsOf(node, enumHome) {
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || k === 'properties') continue;
    if (k === 'oneOf') {
      // Flatten the union's branches so the bounds and the
      // boolean-is-never-an-integer rule stay legible.
      for (const branch of v) {
        for (const [bk, bv] of Object.entries(branch)) {
          if (bk === 'type') continue;
          out.push({ name: bk, value: bv });
        }
      }
      continue;
    }
    if (k === 'items') {
      if (v.type === 'object') {
        // The row's own fields are published in their own section.
        out.push({ name: 'items', value: 'object — see Row shape' });
        continue;
      }
      const extras = Object.entries(v)
        .filter(([ik]) => ik !== 'type')
        .map(([ik, iv]) => `${ik}=${iv}`);
      out.push({ name: 'items', value: [v.type, ...extras].join(' ') });
      continue;
    }
    if (k === 'enum' || k === 'const') {
      out.push({ name: k, value: enumHome || v });
      continue;
    }
    out.push({ name: k, value: v });
  }
  return out;
}

function typeOf(node) {
  if (node.type) return node.type;
  if (node.oneOf) return node.oneOf.map((b) => b.type).join(' | ');
  return 'object';
}

app.get('/api/developer/reference', (_req, res) => {
  const c = getContract();
  const ic = c.input_contract;
  const recordSchema = ic.properties.records.items;
  const oc = c.output_contract;
  const row = oc.properties.files.items;

  // Field homes: media type and transfer state enumerations belong to library
  // administration; the hint strings belong to the behaviour guide; the event
  // name, payload field list, keyboard trigger and preview widths belong to
  // the component contract, the shortcuts overlay and the preview control.
  const enumHome = {
    mime: PTR.contentTypes,
    upload_state: PTR.contentTypes,
    upload_hint: PTR.hints,
  };
  const constHome = {
    name: PTR.events,
    keyboard: PTR.keyboard,
    payload_fields: PTR.events,
    viewport_widths: PTR.widths,
    narrow_breakpoint: PTR.breakpoint,
  };

  const fieldRows = (props, homes) =>
    Object.entries(props).map(([name, node]) => ({
      name,
      type: typeOf(node),
      constraints: constraintsOf(node, homes && homes[name]),
      nullable: Boolean(node.oneOf && node.oneOf.some((b) => b.type === 'null')),
    }));

  res.json({
    top_level: {
      required: c.input_top_level.required,
      additionalProperties: c.input_top_level.additionalProperties,
    },
    input: {
      required: ic.required,
      additionalProperties: ic.additionalProperties,
      property_order: ic.property_order,
      container: {
        name: 'records',
        type: ic.properties.records.type,
        ordering: ic.properties.records.ordering,
      },
      record: {
        type: recordSchema.type,
        fields: fieldRows(recordSchema.properties, enumHome),
        required: recordSchema.required,
        additionalProperties: recordSchema.additionalProperties,
        property_order: recordSchema.property_order,
      },
    },
    policy: {
      type: c.policy_contract.type,
      // The configuration itself is administration's; only its shape is here.
      fields: c.policy_contract.property_order,
      additionalProperties: c.policy_contract.additionalProperties,
      recursive_scalar_rule: c.policy_contract.recursive_scalar_rule,
      value_home: PTR.administration,
    },
    output: {
      required: oc.required,
      additionalProperties: oc.additionalProperties,
      property_order: oc.property_order,
      // The two embedded descriptors get their own sections below, so the
      // summary row for each carries only its type.
      fields: fieldRows(oc.properties, enumHome).map((f) =>
        f.type === 'object'
          ? { ...f, constraints: [{ name: 'shape', value: 'see Embedded descriptors' }] }
          : f
      ),
      row: {
        fields: fieldRows(row.properties, null),
        required: row.required,
        additionalProperties: row.additionalProperties,
        property_order: row.property_order,
        ordering: oc.properties.files.ordering,
      },
      selected_ids_ordering: oc.properties.selected_ids.ordering,
      submit_event: {
        fields: fieldRows(oc.properties.submit_event.properties, null).map((f) => ({
          ...f,
          constraints: f.constraints.map((con) =>
            con.name === 'const' ? { name: 'const', value: constHome[f.name] } : con
          ),
        })),
        required: oc.properties.submit_event.required,
        additionalProperties: oc.properties.submit_event.additionalProperties,
        property_order: oc.properties.submit_event.property_order,
      },
      layout: {
        fields: fieldRows(oc.properties.layout.properties, null).map((f) => ({
          ...f,
          constraints: f.constraints.map((con) =>
            con.name === 'const' && constHome[f.name]
              ? { name: 'const', value: constHome[f.name] }
              : con
          ),
        })),
        required: oc.properties.layout.required,
        additionalProperties: oc.properties.layout.additionalProperties,
        property_order: oc.properties.layout.property_order,
      },
    },
    rules: {
      object_rule: c.object_rule,
      array_rule: c.array_rule,
      null_rule: c.null_rule,
    },
  });
});

app.get('/api/developer/behavior', (_req, res) => {
  const nb = getContract().normative_behavior;
  res.json({
    size_text: nb.size_text,
    file_fields: nb.file_fields,
    upload_hint_priority: nb.upload_hint_priority,
    // The worked boundary example the contract fixes.
    worked_example: nb.verification_document.required_statements[0],
    configuration_home: PTR.administration,
  });
});

app.get('/api/developer/errors', (_req, res) => {
  const e = getContract().errors;
  res.json({ exception: e.exception, conditions: e.conditions });
});

app.get('/api/developer/components', (_req, res) => {
  const c = getContract();
  const nb = c.normative_behavior;
  const css = nb.vue_components.responsive_css;
  // Implementation notes: the trailing clause of the published algorithm
  // summary, which concerns the deliverable modules rather than any rule the
  // other sections own.
  const sentences = c.business_algorithm_and_ordering.split('. ');
  res.json({
    deliverables: c.domain_deliverables,
    node_view_model: nb.node_view_model,
    vue_event_contract: nb.vue_event_contract,
    components: [
      { file: 'document_list.vue', spec: nb.vue_components['document_list.vue'] },
      { file: 'upload_modal.vue', spec: nb.vue_components['upload_modal.vue'] },
    ],
    responsive_css: {
      required_declarations: css.required_declarations,
      horizontal_scroll: css.horizontal_scroll,
      viewport_widths_home: PTR.widths,
      breakpoint_home: PTR.breakpoint,
    },
    verification_document: nb.verification_document,
    implementation_note: sentences[sentences.length - 1],
  });
});

// developer_console — the request builder. Carries no part of a response.
app.get('/api/developer/console', (_req, res) => {
  const c = getContract();
  res.json({
    call: '/v1/view-models/document-library:render',
    arguments: [
      { name: 'records', type: c.input_contract.properties.records.type, required: true,
        note: 'The document set the view-model is rendered over.' },
      { name: 'policy', type: c.policy_contract.type, required: true,
        note: `The configuration in force. ${PTR.administration}` },
    ],
    document_sets: [
      { id: 'empty', label: 'Empty document set (no records)' },
      { id: 'library', label: 'This library (disabled in sandbox)', disabled: true },
    ],
    environments: [
      { id: 'sandbox', label: 'Sandbox tenant — foliant-sbx-04' },
      { id: 'production', label: 'Production tenant (requires elevation)', disabled: true },
    ],
    history: [
      { at: '2026-06-03T09:41:12Z', status: 200 },
      { at: '2026-06-03T09:37:48Z', status: 200 },
      { at: '2026-06-02T17:02:30Z', status: 422 },
    ],
    rate_limit: { used: 38, ceiling: 500, window: 'per hour' },
  });
});

app.post('/api/developer/console/run', (req, res) => {
  const c = getContract();
  const set = (req.body && req.body.document_set) || 'empty';
  if (set !== 'empty') return res.status(400).json({ error: 'unsupported_document_set' });

  // The fixed outcome, with the two values other surfaces own rendered as
  // pointers rather than reprinted here.
  const body = JSON.parse(JSON.stringify(c.empty_input_result));
  body.submit_event.keyboard = PTR.keyboard;
  body.layout.viewport_widths = PTR.widths;

  res.json({
    status: 200,
    duration_ms: 128,
    environment: 'sandbox',
    body,
  });
});

/* ------------------------------------------------------------------ *
 * governance collection + previewer
 * ------------------------------------------------------------------ */
const GOVERNANCE_CHROME = [
  { id: 'retention', title: 'Records retention schedule', owner: 'Marcus Bell',
    effective: '2026-01-01', revision: '9.4' },
  { id: 'dpa', title: 'Data processing agreement', owner: 'Lena Hoffmann',
    effective: '2025-09-15', revision: '3.1' },
  { id: 'accessibility', title: 'Accessibility conformance statement', owner: 'Priya Raman',
    effective: '2026-02-20', revision: '2.0' },
  { id: 'dr', title: 'Disaster recovery plan', owner: 'Devon Alvarez',
    effective: '2025-11-30', revision: '6.7' },
];

const CERT_PAGE_SIZE = 4;

app.get('/api/governance', (_req, res) => {
  const edge = getEdgeCases();
  const rows = [
    ...GOVERNANCE_CHROME.slice(0, 2),
    {
      id: 'certification',
      title: 'Integration certification checklist',
      owner: 'Priya Raman',
      effective: '2026-04-08',
      revision: edge.schema_version,
      href: '/governance/preview/certification',
    },
    ...GOVERNANCE_CHROME.slice(2),
  ];
  res.json({ rows });
});

app.get('/api/governance/certification', (req, res) => {
  const edge = getEdgeCases();
  const cases = edge.cases;
  const pageCount = Math.max(1, Math.ceil(cases.length / CERT_PAGE_SIZE));
  const pageNum = Math.min(Math.max(1, Number(req.query.page) || 1), pageCount);
  const start = (pageNum - 1) * CERT_PAGE_SIZE;

  const blocks = cases.slice(start, start + CERT_PAGE_SIZE).map((kase, n) => {
    const ordinal = start + n + 1;
    if (Object.prototype.hasOwnProperty.call(kase, 'expected')) {
      // The empty-library case keeps its outcome's single home behind the
      // developer center's request console; it is pointed at, not restated.
      return { ordinal, id: kase.id, kind: 'pointer', pointer: PTR.referenceResponse };
    }
    if (Object.prototype.hasOwnProperty.call(kase, 'expected_error')) {
      return { ordinal, id: kase.id, kind: 'rejection', error: kase.expected_error };
    }
    return { ordinal, id: kase.id, kind: 'outcome', rule: kase.rule };
  });

  res.json({
    title: 'Integration certification checklist',
    revision: edge.schema_version,
    page: pageNum,
    page_count: pageCount,
    first_page: pageNum === 1,
    last_page: pageNum === pageCount,
    blocks,
  });
});

/* ------------------------------------------------------------------ *
 * static shell — every app route serves the same data-free shell.
 * ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Foliant Content Library listening on http://localhost:${PORT}`);
});

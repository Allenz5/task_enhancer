'use strict';
/*
 * Kestrel Capture Console — application server.
 *
 * Every operator-facing value that originates in the staged capture set is read
 * from ./input at request time. Not one of those values is transcribed into
 * this source. Everything else on screen — sensors, interfaces, VLANs, wall
 * clocks, byte totals, segment names, profile provenance, release notes — is
 * invented capture-console chrome derived deterministically from an identifier,
 * so a fresh start reproduces an identical console.
 *
 * Each surface has its own endpoint and each endpoint serves only what that
 * surface is allowed to show. The frame ledger endpoint genuinely does not
 * carry payload bytes; the profile library endpoint genuinely does not carry
 * profile parameters; each reference page endpoint carries only its own page.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 5174;
const INPUT_DIR = path.join(__dirname, 'input');

const readInput = (name) =>
  JSON.parse(fs.readFileSync(path.join(INPUT_DIR, name), 'utf8'));

/* ------------------------------------------------------------------ *
 * Deterministic derivation helpers (invented chrome only)
 * ------------------------------------------------------------------ */

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const pad = (n, w) => String(n).padStart(w, '0');

/* The console's own clock. Fixed, so every derived stamp is reproducible. */
const CONSOLE_DAY = '2026-08-14';
const CONSOLE_STAMP = '2026-08-14 09:41:07';

const SENSORS = ['kst-sen-01', 'kst-sen-02', 'kst-sen-04', 'kst-sen-07'];
const IFACES = ['enp5s0f0', 'enp5s0f1', 'ens2f0', 'ens2f1'];
const CHECKSUMS = ['ok', 'ok', 'ok', 'unverified'];
const DIRECTIONS = ['c→s', 's→c'];

function clockFrom(seed, dayOffsetSpan) {
  // A wall clock inside the retained capture window, derived, never stored.
  const day = 8 + (seed % dayOffsetSpan);
  const hh = (seed >>> 5) % 24;
  const mm = (seed >>> 11) % 60;
  const ss = (seed >>> 17) % 60;
  return `2026-08-${pad(day, 2)} ${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}`;
}

function addSeconds(stamp, secs) {
  const [d, t] = stamp.split(' ');
  const [hh, mm, ss] = t.split(':').map(Number);
  let total = hh * 3600 + mm * 60 + ss + secs;
  const dayRoll = Math.floor(total / 86400);
  total = ((total % 86400) + 86400) % 86400;
  const day = Number(d.slice(8)) + dayRoll;
  return `${d.slice(0, 8)}${pad(day, 2)} ${pad(Math.floor(total / 3600), 2)}:${pad(
    Math.floor(total / 60) % 60, 2)}:${pad(total % 60, 2)}`;
}

/* ------------------------------------------------------------------ *
 * Capture segments and the capture window
 * ------------------------------------------------------------------ */

/**
 * The stored capture set is held as rotated segment files. The console opens
 * scoped to the most recently rotated segment, which by construction holds only
 * the newest slice of the retained sessions — the rest sit in older segments
 * and are reached only by widening the window to the whole set.
 */
function segments(sessionCount) {
  // The store keeps a fixed rotation depth, so the number of segments on the
  // workspace says nothing about how many sessions the set holds.
  const total = Math.max(8, sessionCount + 3);
  const out = [];
  for (let i = 0; i < total; i++) {
    const s = fnv1a(`segment:${i}`);
    out.push({
      index: i,
      name: `kst-cap-2026-08-${pad(8 + i, 2)}-${pad(i + 1, 4)}.pcap`,
      rotated_at: clockFrom(s, 7),
      size_mb: 1740 + (s % 380),
      sensor: SENSORS[s % SENSORS.length],
      latest: i === total - 1,
    });
  }
  return out;
}

/** Invented capture context for one session, derived from its identifier. */
function captureContext(sessionId) {
  const s = fnv1a(`session:${sessionId}`);
  const firstSeen = clockFrom(s, 7);
  return {
    first_seen: firstSeen,
    last_seen: addSeconds(firstSeen, 3 + (s % 900)),
    bytes_client: 1024 + (s % 480000),
    bytes_server: 512 + ((s >>> 7) % 620000),
    sensor: SENSORS[(s >>> 3) % SENSORS.length],
    iface: IFACES[(s >>> 9) % IFACES.length],
    vlan: 100 + ((s >>> 13) % 380),
  };
}

/**
 * The retained population: one row per staged session, carrying its identifier
 * and protocol plus invented capture columns, and nothing whatever about its
 * frames. Rows are placed into segments by first-seen order, so the newest
 * session lands in the segment the console opens on.
 */
function population() {
  const records = readInput('records.json').records;
  const segs = segments(records.length);
  const rows = records.map((r) => ({
    session_id: r.session_id,
    protocol: r.protocol,
    ...captureContext(r.session_id),
  }));
  rows.sort((a, b) => (a.first_seen < b.first_seen ? -1 :
    a.first_seen > b.first_seen ? 1 : (a.session_id < b.session_id ? -1 : 1)));
  const offset = segs.length - rows.length;
  rows.forEach((row, i) => {
    const seg = segs[offset + i];
    row.segment = seg.name;
    row.segment_index = seg.index;
  });
  // The index is presented newest-first by a capture column, never by identifier.
  rows.reverse();
  return { rows, segs };
}

/* ------------------------------------------------------------------ *
 * Display filter
 * ------------------------------------------------------------------ */

const FILTER_FIELDS = [
  { name: 'session.id', type: 'string', note: 'Session key as indexed by the sensor' },
  { name: 'session.protocol', type: 'string', note: 'Transport token, lowercase' },
  { name: 'capture.segment', type: 'string', note: 'Rotated segment file the session was written to' },
  { name: 'capture.sensor', type: 'string', note: 'Capturing sensor node' },
  { name: 'capture.interface', type: 'string', note: 'Capture interface on that node' },
  { name: 'capture.vlan', type: 'integer', note: '802.1Q tag observed on the session' },
];

const SAVED_FILTERS = [
  { label: 'All indexed sessions', expression: 'session.id' },
  { label: 'Sessions on sensor 01', expression: 'capture.sensor == "kst-sen-01"' },
  { label: 'Tagged VLAN only', expression: 'capture.vlan' },
];

const QUERY_HISTORY = [
  { expression: 'capture.sensor == "kst-sen-04"', ran_at: '2026-08-14 08:12:44' },
  { expression: 'session.id', ran_at: '2026-08-13 17:55:02' },
  { expression: 'capture.interface == "ens2f0"', ran_at: '2026-08-13 09:31:20' },
];

const FIELD_NAMES = FILTER_FIELDS.map((f) => f.name);

/** Wireshark-style display filter: bare field = presence test, == / != compare. */
function parseFilter(expr) {
  const text = String(expr || '').trim();
  if (!text) return { ok: false, error: 'Empty display filter expression.' };
  const parts = text.split(/\s+(and|or)\s+/i);
  const terms = [];
  const joins = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { joins.push(parts[i].toLowerCase()); continue; }
    const m = parts[i].trim().match(/^([a-z_.]+)(?:\s*(==|!=)\s*(?:"([^"]*)"|([^\s"]+)))?$/i);
    if (!m) return { ok: false, error: `Cannot parse "${parts[i].trim()}".` };
    if (!FIELD_NAMES.includes(m[1])) {
      return { ok: false, error: `"${m[1]}" is not a field this capture set indexes.` };
    }
    terms.push({ field: m[1], op: m[2] || null, value: m[3] !== undefined ? m[3] : m[4] });
  }
  return { ok: true, terms, joins };
}

function rowField(row, field) {
  switch (field) {
    case 'session.id': return row.session_id;
    case 'session.protocol': return row.protocol;
    case 'capture.segment': return row.segment;
    case 'capture.sensor': return row.sensor;
    case 'capture.interface': return row.iface;
    case 'capture.vlan': return String(row.vlan);
    default: return undefined;
  }
}

function evalFilter(ast, row) {
  const test = (t) => {
    const v = rowField(row, t.field);
    if (t.op === null) return v !== undefined && v !== '';
    if (t.op === '==') return v === t.value;
    return v !== t.value;
  };
  let acc = test(ast.terms[0]);
  for (let i = 0; i < ast.joins.length; i++) {
    const next = test(ast.terms[i + 1]);
    acc = ast.joins[i] === 'and' ? (acc && next) : (acc || next);
  }
  return acc;
}

/* ------------------------------------------------------------------ *
 * Replay profile library (provenance invented; parameters are rules.json)
 * ------------------------------------------------------------------ */

const IN_FORCE_SLUG = 'trace-replay-production';

const PROFILES = [
  {
    slug: IN_FORCE_SLUG,
    name: 'Trace Replay — Production',
    team: 'Capture Engineering',
    created: '2025-06-18',
    modified: '2025-11-04',
    status: 'in_force',
    author: 'r.okonjo',
    approvals: ['r.okonjo', 'l.varga', 'change board 2025-11'],
    note: 'Frozen for the 6.x replay engine. Parameter changes require a change-board record.',
  },
  {
    slug: 'reassembly-lab-bench',
    name: 'Reassembly — Lab Bench',
    team: 'Capture Engineering',
    created: '2026-02-02', modified: '2026-07-29', status: 'superseded',
    author: 'l.varga', superseded_on: '2026-07-29',
    note: 'Bench profile retired when the lab sensors moved onto the production ring buffer.',
  },
  {
    slug: 'object-extraction-http',
    name: 'Object Extraction — HTTP',
    team: 'Threat Analytics',
    created: '2025-09-11', modified: '2026-07-12', status: 'superseded',
    author: 'd.aliyev', superseded_on: '2026-07-12',
    note: 'Superseded by the shared extraction profile held on the analytics cluster.',
  },
  {
    slug: 'flow-timeout-tuning-v3',
    name: 'Flow Timeout Tuning (v3)',
    team: 'Network Operations',
    created: '2026-01-27', modified: '2026-06-30', status: 'superseded',
    author: 'm.strand', superseded_on: '2026-06-30',
    note: 'Timeout sweep folded into the sensor defaults after the June maintenance window.',
  },
  {
    slug: 'tls-decode-presets',
    name: 'TLS Decode Presets',
    team: 'Threat Analytics',
    created: '2025-12-05', modified: '2026-06-14', status: 'superseded',
    author: 'd.aliyev', superseded_on: '2026-06-14',
    note: 'Key-log handling moved to the decode service; this record kept for audit only.',
  },
  {
    slug: 'segment-rotation-defaults',
    name: 'Segment Rotation Defaults',
    team: 'Capture Engineering',
    created: '2025-08-22', modified: '2026-06-02', status: 'superseded',
    author: 'r.okonjo', superseded_on: '2026-06-02',
    note: 'Rotation sizing replaced by the retention planner calculation.',
  },
  {
    slug: 'frame-slicing-edge',
    name: 'Frame Slicing — Edge Sensors',
    team: 'Network Operations',
    created: '2025-10-30', modified: '2026-05-19', status: 'superseded',
    author: 'm.strand', superseded_on: '2026-05-19',
    note: 'Edge slicing standardised in the sensor image; profile no longer applied.',
  },
];

/* Cutoff for the library's default "recently modified" ordering. The in-force
 * profile has not been touched since it was frozen, so it falls outside. */
const RECENT_CUTOFF = '2026-05-16';

/* ------------------------------------------------------------------ *
 * Replay format reference — five sequential pages over output_contract.json
 * ------------------------------------------------------------------ */

const REFERENCE_PAGES = [
  { id: 'front', n: 1, title: 'Front Matter' },
  { id: 'input', n: 2, title: 'Accepted Input' },
  { id: 'output', n: 3, title: 'Produced Result' },
  { id: 'rejection', n: 4, title: 'Rejection and Run Envelope' },
  { id: 'baseline', n: 5, title: 'Empty-Capture Baseline' },
];

const REFERENCE_CHANGELOG = [
  { revised: '2026-05-28', editor: 'r.okonjo', note: 'Editorial pass on the run-envelope wording.' },
  { revised: '2026-03-09', editor: 'l.varga', note: 'Page order settled; no clause text changed.' },
  { revised: '2025-11-04', editor: 'r.okonjo', note: 'Adopted alongside the frozen production profile.' },
];

/**
 * The contract's prose carries one sentence that simply restates the saved
 * policy. The console keeps the policy in exactly one home — the in-force
 * profile's parameter record — so any sentence naming a policy property is
 * withheld here and replaced by a pointer. The names are read from the
 * contract's own policy schema rather than listed by hand.
 */
function splitRules(contract) {
  const policyProps = Object.keys(contract.policy.properties);
  return String(contract.policy.parameterization)
    .split('。')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !policyProps.some((p) => s.includes(p)))
    .map((s) => s + '。');
}

function referencePage(id) {
  const c = readInput('output_contract.json');
  const meta = REFERENCE_PAGES.find((p) => p.id === id);
  if (!meta) return null;
  const base = {
    page: meta.id,
    number: meta.n,
    title: meta.title,
    total: REFERENCE_PAGES.length,
    prev: meta.n > 1 ? REFERENCE_PAGES[meta.n - 2].id : null,
    next: meta.n < REFERENCE_PAGES.length ? REFERENCE_PAGES[meta.n].id : null,
    prev_title: meta.n > 1 ? REFERENCE_PAGES[meta.n - 2].title : null,
    next_title: meta.n < REFERENCE_PAGES.length ? REFERENCE_PAGES[meta.n].title : null,
  };

  if (id === 'front') {
    return {
      ...base,
      schema_version: c.schema_version,
      encoding: c.encoding,
      following_pages: REFERENCE_PAGES.slice(1).map((p) => ({ number: p.n, title: p.title })),
      adoption: 'Adopted for the 6.x replay engine. Read in sequence; the reference carries no jump index.',
      changelog: REFERENCE_CHANGELOG,
    };
  }

  if (id === 'input') {
    return {
      ...base,
      top_level_required: c.input_top_level.required,
      top_level_closed: c.input_top_level.additionalProperties === false,
      record_fields: c.input_record_contract.record_fields,
      frame_fields: c.input_record_contract.frame_fields,
    };
  }

  if (id === 'output') {
    const out = c.output.schema.properties;
    const sessionItem = out.sessions.items;
    const delivered = sessionItem.properties.delivered_messages;
    const dropped = sessionItem.properties.dropped_messages;
    const matrix = out.protocol_matrix;
    return {
      ...base,
      result_key_order: c.output.exact_property_order,
      session_key_order: sessionItem.property_order,
      sessions_ordering: out.sessions.ordering,
      delivered_key_order: delivered.items.property_order,
      delivered_ordering: delivered.ordering,
      dropped_key_order: dropped.items.property_order,
      dropped_ordering: dropped.ordering,
      missing_fragments_ordering:
        dropped.items.properties.missing_fragments.ordering,
      replay_order_item_type: out.replay_order.items.type,
      replay_order_ordering: out.replay_order.ordering,
      matrix_key_order: matrix.property_order,
      matrix_classes: matrix.property_order.map((k) => ({
        name: k,
        counter_key_order: matrix.properties[k].property_order,
      })),
      rules: splitRules(c),
      scheduling_summary: c.ordering,
      policy_pointer:
        'Which protocol class drains first, whether fragment drop is strict, and which field ' +
        'groups sessions are properties of the replay profile in force. This page names that ' +
        'record as their source and does not restate it: read them on Replay Profiles › the ' +
        'in-force profile › Parameters.',
    };
  }

  if (id === 'rejection') {
    return {
      ...base,
      exception: c.errors.exception,
      conditions: c.errors.conditions,
      argument_handling:
        'Arguments are handled read-only. A conforming run returns without altering, in place, ' +
        'any part of the capture object or the profile object it was handed — at any depth.',
      execution: c.execution,
      artifacts: c.artifacts,
    };
  }

  // Named for the page, not for the contract's own key: the reference publishes
  // the baseline as a value, and nothing here should echo a regression case id.
  return { ...base, baseline_result: c.empty_input_result };
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

/* A fixed, bounded scheduler cost so the console behaves like one that really
 * drains a capture. Deterministic: the same wait every run. */
const QUERY_LATENCY_MS = 180;
const DECODE_LATENCY_MS = 90;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

app.use(express.json());

/* -- Capture workspace: operational chrome only -------------------- */
app.get('/api/home', (req, res) => {
  const records = readInput('records.json').records;
  const segs = segments(records.length);
  const frameTotal = records.reduce((n, r) => n + r.frames.length, 0);
  res.json({
    generated_at: CONSOLE_STAMP,
    banner: 'Scheduled sensor maintenance 2026-08-19 02:00–04:00 UTC. Capture continues on the standby ring.',
    release_note: 'Kestrel 6.2 — replay scheduler now reports per-protocol regression counters.',
    interfaces: SENSORS.map((node, i) => {
      const s = fnv1a(`health:${node}`);
      return {
        node,
        iface: IFACES[i % IFACES.length],
        uptime_days: 41 + (s % 190),
        kernel_drops: s % 9000,
        ring_utilisation_pct: 18 + (s % 61),
        ntp: (s % 7) === 3 ? 'drifting' : 'locked',
        link: (s % 11) === 5 ? '10GbE (degraded)' : '10GbE',
      };
    }),
    throughput: {
      hour: Array.from({ length: 24 }, (_, i) => 2100 + (fnv1a(`bps:h:${i}`) % 5200)),
      day: Array.from({ length: 24 }, (_, i) => 1800 + (fnv1a(`bps:d:${i}`) % 6100)),
      unit: 'Mb/s',
    },
    retention: {
      disk_headroom_pct: 37,
      retained_days: 11,
      oldest_segment_overwritten: '2026-08-25',
      volume: '/srv/kestrel/capture',
    },
    link_layer: [
      { label: 'Ethernet II', share_pct: 96 },
      { label: '802.1Q', share_pct: 3 },
      { label: 'Linux SLL', share_pct: 1 },
    ],
    mtu: [
      { label: '1500', share_pct: 88 },
      { label: '9000', share_pct: 9 },
      { label: '576', share_pct: 3 },
    ],
    ids_unread: 14,
    bpf: {
      standing: 'not (host 10.31.0.9 and port 9100) and not vlan 4094',
      snaplen: 262144,
      slicing: 'full frame retained',
    },
    // Bare structural integers about the stored set. No session-level tallies.
    capture_set: {
      segments: segs.length,
      frames_indexed: frameTotal,
      volume: '/srv/kestrel/capture',
      index_engine: 'kestrel-idx 6.2.1',
    },
    segment_log: segs.slice().reverse(),
  });
});

/* -- Capture search form: no results of any kind ------------------- */
app.get('/api/search-form', (req, res) => {
  res.json({
    fields: FILTER_FIELDS,
    saved: SAVED_FILTERS,
    history: QUERY_HISTORY,
    windows: [
      { id: 'latest_segment', label: 'Most recently rotated segment' },
      { id: 'whole_capture_set', label: 'Whole stored capture set' },
    ],
    default_window: 'latest_segment',
  });
});

app.post('/api/query/validate', (req, res) => {
  const ast = parseFilter(req.body && req.body.expression);
  res.json({ ok: ast.ok, error: ast.error || null });
});

/* -- Session index: session-level facts only ----------------------- */
app.post('/api/query', async (req, res) => {
  const expression = (req.body && req.body.expression) || '';
  const windowId = (req.body && req.body.window) === 'whole_capture_set'
    ? 'whole_capture_set' : 'latest_segment';
  const ast = parseFilter(expression);
  if (!ast.ok) return res.status(400).json({ error: ast.error });

  const { rows, segs } = population();
  const latest = segs[segs.length - 1];
  const inWindow = windowId === 'whole_capture_set'
    ? rows
    : rows.filter((r) => r.segment === latest.name);
  const matched = inWindow.filter((r) => evalFilter(ast, r));

  await delay(QUERY_LATENCY_MS);
  res.json({
    expression,
    window: windowId,
    window_label: windowId === 'whole_capture_set'
      ? 'Whole stored capture set'
      : `Most recently rotated segment (${latest.name})`,
    segments_searched: windowId === 'whole_capture_set' ? segs.length : 1,
    matched: matched.length,
    ran_at: CONSOLE_STAMP,
    elapsed_ms: QUERY_LATENCY_MS,
    rows: matched.map((r) => ({
      session_id: r.session_id,
      protocol: r.protocol,
      first_seen: r.first_seen,
      last_seen: r.last_seen,
      bytes_client: r.bytes_client,
      bytes_server: r.bytes_server,
      sensor: r.sensor,
      iface: r.iface,
      vlan: r.vlan,
      segment: r.segment,
    })),
  });
});

/* -- Frame ledger: frame fields, never payload bytes --------------- */
app.get('/api/session/:id/ledger', (req, res) => {
  const record = readInput('records.json').records
    .find((r) => r.session_id === req.params.id);
  if (!record) return res.status(404).json({ error: 'No such session in the capture set.' });
  const ctx = captureContext(record.session_id);
  res.json({
    session_id: record.session_id,
    protocol: record.protocol,
    sensor: ctx.sensor,
    iface: ctx.iface,
    vlan: ctx.vlan,
    first_seen: ctx.first_seen,
    // One row per stored frame, in stored arrival order. payload_hex is not
    // read into this response at all.
    frames: record.frames.map((f, i) => {
      const s = fnv1a(`frame:${record.session_id}:${i}`);
      return {
        arrival: i,
        message_id: f.message_id,
        tick: f.tick,
        fragment_index: f.fragment_index,
        fragment_count: f.fragment_count,
        wire_length: 60 + (s % 1420),
        checksum: CHECKSUMS[s % CHECKSUMS.length],
        direction: DIRECTIONS[(s >>> 5) % DIRECTIONS.length],
        sensor: SENSORS[(s >>> 9) % SENSORS.length],
      };
    }),
  });
});

/* -- Byte inspector: exactly one frame's bytes --------------------- */
app.get('/api/session/:id/frame/:arrival/bytes', async (req, res) => {
  const record = readInput('records.json').records
    .find((r) => r.session_id === req.params.id);
  if (!record) return res.status(404).json({ error: 'No such session in the capture set.' });
  const arrival = Number(req.params.arrival);
  const frame = record.frames[arrival];
  if (!frame) return res.status(404).json({ error: 'No such frame in this session.' });

  const hex = frame.payload_hex;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(hex.slice(i, i + 2));
  const rows = [];
  for (let off = 0; off < bytes.length; off += 16) {
    rows.push({ offset: pad(off.toString(16), 8), bytes: bytes.slice(off, off + 16) });
  }

  await delay(DECODE_LATENCY_MS);
  res.json({
    session_id: record.session_id,
    arrival,
    message_id: frame.message_id,
    tick: frame.tick,
    fragment_index: frame.fragment_index,
    fragment_count: frame.fragment_count,
    byte_count: bytes.length,
    rows,
  });
});

/* -- Replay profile library: never a parameter --------------------- */
app.get('/api/profiles', (req, res) => {
  const order = ['last_modified', 'status', 'name_search'].includes(req.query.order)
    ? req.query.order : 'last_modified';
  const q = String(req.query.q || '').trim().toLowerCase();

  let rows = PROFILES.map((p) => ({
    slug: p.slug, name: p.name, team: p.team,
    created: p.created, modified: p.modified, status: p.status,
  }));

  let note;
  if (order === 'name_search') {
    rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    rows.sort((a, b) => (a.name < b.name ? -1 : 1));
    note = q
      ? `${rows.length} of ${PROFILES.length} profiles match “${q}”.`
      : `${rows.length} of ${PROFILES.length} profiles.`;
  } else if (order === 'status') {
    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'in_force' ? -1 : 1;
      return a.modified < b.modified ? 1 : -1;
    });
    note = `Grouped by status · ${rows.length} of ${PROFILES.length} profiles.`;
  } else {
    rows = rows.filter((p) => p.modified >= RECENT_CUTOFF);
    rows.sort((a, b) => (a.modified < b.modified ? 1 : -1));
    note = `Showing ${rows.length} of ${PROFILES.length} profiles · modified since ${RECENT_CUTOFF}.`;
  }

  res.json({ order, q: req.query.q || '', note, total: PROFILES.length, rows });
});

app.get('/api/profile/:slug', (req, res) => {
  const p = PROFILES.find((x) => x.slug === req.params.slug);
  if (!p) return res.status(404).json({ error: 'No such profile.' });

  if (p.status !== 'in_force') {
    return res.json({
      slug: p.slug, name: p.name, team: p.team, status: p.status,
      created: p.created, modified: p.modified,
      author: p.author, superseded_on: p.superseded_on, change_note: p.note,
      parameters: null,
      withheld: 'Parameters are not published for a superseded profile. Only the record’s ' +
        'provenance is retained; the replay engine reads its parameters from the profile in force.',
    });
  }

  const rules = readInput('rules.json');
  res.json({
    slug: p.slug, name: p.name, team: p.team, status: p.status,
    created: p.created, modified: p.modified,
    author: p.author, approvals: p.approvals, change_note: p.note,
    parameters: {
      mode: rules.mode,
      key: rules.key,
      // Positions are labelled so the dispatch order is read, not guessed.
      dispatch: rules.protocol_order.map((proto, i) => ({ position: i + 1, protocol: proto })),
      strict_fragment_drop: rules.strict_fragment_drop,
    },
  });
});

/* -- Replay format reference: one page per request ----------------- */
app.get('/api/reference/:page', (req, res) => {
  const page = referencePage(req.params.page);
  if (!page) return res.status(404).json({ error: 'No such reference page.' });
  res.json(page);
});

/* -- Replay regression suite --------------------------------------- */
const humanise = (id) => String(id).replace(/_/g, ' ');

app.get('/api/regression', (req, res) => {
  const suite = readInput('public_edge_cases.json');
  res.json({
    schema_version: suite.schema_version,
    case_count: suite.cases.length,
    last_run: '2026-08-14 06:20:11',
    last_run_result: 'green',
    owner: { team: 'Capture Engineering', contact: 'replay-oncall', pipeline: 'kestrel-replay/main' },
    ci_badge: 'build 6.2.117',
    kinds: [
      { id: 'rejections', label: 'Refusal cases' },
      { id: 'invariants', label: 'Invariant cases' },
    ],
  });
});

app.get('/api/regression/rejections', (req, res) => {
  const suite = readInput('public_edge_cases.json');
  res.json({
    kind: 'rejections',
    cases: suite.cases.filter((c) => c.expected_error !== undefined).map((c) => ({
      id: c.id,
      fixture: `${humanise(c.id)} fixture`,
      expected_error: c.expected_error,
    })),
  });
});

app.get('/api/regression/invariants', (req, res) => {
  const suite = readInput('public_edge_cases.json');
  res.json({
    kind: 'invariants',
    cases: suite.cases.filter((c) => c.expected_error === undefined).map((c) => {
      // The case pinned to the empty capture is checked against the reference's
      // baseline page; its values are not reprinted here.
      if (c.rule === undefined) {
        return {
          id: c.id,
          fixture: `${humanise(c.id)} fixture`,
          assertion: null,
          reference: 'Replay Format Reference › Empty-Capture Baseline',
        };
      }
      return { id: c.id, fixture: `${humanise(c.id)} fixture`, assertion: c.rule, reference: null };
    }),
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No such endpoint.' });
  // The staged input is never served as a file; it is reachable only through the
  // surfaces above. Anything that reads as a file request is a plain 404 rather
  // than the console shell.
  if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).send('Not found.');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kestrel Capture Console listening on http://localhost:${PORT}`);
});

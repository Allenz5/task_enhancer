'use strict';
/*
 * Helios Grid Console — application server.
 *
 * Every operator-facing value that originates in the staged audit input is read
 * from ./input at request time. Nothing from those files is transcribed into
 * this source. Everything else on screen (districts, feeders, nameplate ratings,
 * crew boards, advisories) is invented control-room chrome derived
 * deterministically from the asset identifier, so a fresh start reproduces an
 * identical console.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 5173;
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

const DISTRICTS = [
  'Harrow Vale', 'Kestrel Flats', 'Marley Bend', 'Ashcombe',
  'Pinnacle Reach', 'Doverton', 'Wexford Cross', 'Lindmoor',
];
const VOLTAGE_CLASSES = [500, 345, 230, 161, 138, 115, 69];
const TELEMETRY_HEALTH = ['Nominal', 'Nominal', 'Degraded', 'Stale'];
const FEEDER_SUFFIX = 'ABCDEFGH';
const MAINTENANCE_NOTES = [
  'Tap-changer oil sampled at the last outage; results within limits.',
  'Bushing thermography scheduled with the district crew next quarter.',
  'Relay firmware baselined after the spring commissioning window.',
  'Cooling fan bank 2 replaced; vibration trend flat since.',
  'Awaiting spare CT from the regional store before the next inspection.',
  'No outstanding defects recorded against this asset.',
  'Breaker operating counter reset following mechanism overhaul.',
  'SCADA point list reconciled with the district RTU database.',
];
const OWNERS = [
  'Northern Transmission District', 'Central Transmission District',
  'Southern Transmission District', 'Coastal Transmission District',
];

const REGION_META = {
  north: { key: 'north', label: 'North Interconnect', code: 'NIC' },
  central: { key: 'central', label: 'Central Interconnect', code: 'CIC' },
  south: { key: 'south', label: 'South Interconnect', code: 'SIC' },
};
const REGION_ORDER = ['north', 'central', 'south'];

// Assets are partitioned across interconnects by an operational attribute that
// has nothing to do with the audit. The cycle keeps every region populated and
// keeps the largest region wider than one page.
const REGION_CYCLE = ['north', 'central', 'south', 'north', 'central', 'north'];
const PAGE_SIZE = 2;

function pad2(n) { return String(n).padStart(2, '0'); }

function dateFrom(seed, baseYear, span) {
  const y = baseYear + (seed % span);
  const m = 1 + ((seed >>> 4) % 12);
  const d = 1 + ((seed >>> 9) % 28);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Invented operational context for one asset, derived from its identifier. */
function operationalContext(id) {
  const s = fnv1a(`asset:${id}`);
  return {
    id,
    voltage_class_kv: VOLTAGE_CLASSES[(s >>> 3) % VOLTAGE_CLASSES.length],
    district: DISTRICTS[(s >>> 6) % DISTRICTS.length],
    commissioning_window: dateFrom(s, 2015, 9),
    telemetry_health: TELEMETRY_HEALTH[(s >>> 11) % TELEMETRY_HEALTH.length],
    nameplate_mva: 40 + (s % 361),
    feeder: `F-${10 + ((s >>> 13) % 80)}${FEEDER_SUFFIX[(s >>> 17) % 8]}`,
    last_inspection: dateFrom(fnv1a(`insp:${id}`), 2023, 3),
    owner: OWNERS[(s >>> 21) % OWNERS.length],
    maintenance_note: MAINTENANCE_NOTES[(s >>> 23) % MAINTENANCE_NOTES.length],
  };
}

/**
 * The registry population: one entry per staged record, carrying only its
 * identifier and invented operational columns. Never carries layer data.
 * Default ordering is by commissioning window — an operational column — so the
 * identifier ordering an audit needs is not handed over pre-sorted.
 */
function population() {
  const records = readInput('records.json').records;
  const rows = records.map((r) => operationalContext(r.id));
  rows.sort((a, b) => {
    if (a.commissioning_window !== b.commissioning_window) {
      return a.commissioning_window < b.commissioning_window ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
  rows.forEach((row, i) => { row.region = REGION_CYCLE[i % REGION_CYCLE.length]; });
  return rows;
}

/**
 * The console's layer catalogue: every layer name that appears anywhere in the
 * staged records, in alphabetical catalogue order. This is deliberately NOT the
 * governance authority order — rank lives only behind the authority panel — and
 * the identity colour index below follows the catalogue, not the rank, so no
 * ledger row can betray a layer's authority position.
 */
function layerCatalogue(records) {
  const seen = new Set();
  records.forEach((r) => Object.keys(r.layers || {}).forEach((k) => seen.add(k)));
  return Array.from(seen).sort();
}

/**
 * Identity index for a layer's colour token. Derived from the alphabetical
 * union of every layer name known to the console, so a layer keeps one colour
 * on every surface WITHOUT that colour encoding its authority rank — colouring
 * by rank would have leaked the ordering onto every ledger row.
 */
function identityIndex() {
  const records = readInput('records.json').records;
  const rules = readInput('rules.json');
  const seen = new Set(rules.precedence);
  records.forEach((r) => Object.keys(r.layers || {}).forEach((k) => seen.add(k)));
  const sorted = Array.from(seen).sort();
  return (name) => sorted.indexOf(name);
}

/* ------------------------------------------------------------------ *
 * Overview — operational chrome only
 * ------------------------------------------------------------------ */

app.get('/api/overview', (_req, res) => {
  const records = readInput('records.json').records;
  const cases = readInput('public_edge_cases.json').cases;
  res.json({
    frequency_deviation_mhz: -18,
    frequency_band_mhz: 50,
    area_load_mw: 14820,
    forecast_load_mw: 14615,
    generation_mix: [
      { source: 'Hydro', share: 31 },
      { source: 'Thermal', share: 26 },
      { source: 'Wind', share: 22 },
      { source: 'Solar', share: 13 },
      { source: 'Imports', share: 8 },
    ],
    advisory: {
      severity: 'Moderate',
      text: 'Convective storm advisory in effect for the Doverton and Ashcombe districts until 21:00. Field crews staged.',
      desk: 'Regional Weather Desk',
    },
    alarms_unread: 7,
    // Bare aggregate counters, permitted on this surface.
    assets_under_configuration_management: records.length,
    conformance_checks_outstanding: cases.length,
    crew_board: [
      { crew: 'Line 12', shift: 'Day', truck: 'T-441', eta: '13:40' },
      { crew: 'Sub 4', shift: 'Day', truck: 'T-207', eta: '14:15' },
      { crew: 'Relay 3', shift: 'Swing', truck: 'T-518', eta: '17:05' },
    ],
    sla: [
      { index: 'SAIDI', value: '68.4', target: '75.0', unit: 'min' },
      { index: 'SAIFI', value: '0.81', target: '0.95', unit: 'int' },
      { index: 'CAIDI', value: '84.4', target: '79.0', unit: 'min' },
    ],
  });
});

/* ------------------------------------------------------------------ *
 * Setpoint registry — identifiers + invented operational columns
 * ------------------------------------------------------------------ */

// Region metadata only — the sidebar scope switcher needs the list of
// interconnects on every surface, and this payload carries no asset data.
app.get('/api/regions', (_req, res) => {
  res.json({ regions: REGION_ORDER.map((k) => REGION_META[k]) });
});

app.get('/api/registry', (req, res) => {
  const region = REGION_META[req.query.region] ? req.query.region : 'north';
  const all = population().filter((r) => r.region === region);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  let page = parseInt(req.query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > pageCount) page = pageCount;
  const start = (page - 1) * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  res.json({
    region: REGION_META[region],
    regions: REGION_ORDER.map((k) => REGION_META[k]),
    page,
    page_size: PAGE_SIZE,
    page_count: pageCount,
    total_in_region: all.length,
    range_from: all.length ? start + 1 : 0,
    range_to: start + slice.length,
    sort: { column: 'commissioning_window', direction: 'asc' },
    rows: slice.map((r) => ({
      id: r.id,
      voltage_class_kv: r.voltage_class_kv,
      district: r.district,
      commissioning_window: r.commissioning_window,
      telemetry_health: r.telemetry_health,
    })),
    feeder_loading: DISTRICTS.slice(0, 6).map((d) => ({
      district: d,
      loading_pct: 40 + (fnv1a(`${region}:${d}`) % 55),
    })),
  });
});

/* ------------------------------------------------------------------ *
 * Asset configuration page — no layer data in this payload
 * ------------------------------------------------------------------ */

app.get('/api/assets/:id', (req, res) => {
  const row = population().find((r) => r.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: row.id,
    region: REGION_META[row.region],
    voltage_class_kv: row.voltage_class_kv,
    nameplate_mva: row.nameplate_mva,
    feeder: row.feeder,
    district: row.district,
    owner: row.owner,
    commissioning_window: row.commissioning_window,
    last_inspection: row.last_inspection,
    telemetry_health: row.telemetry_health,
    maintenance_note: row.maintenance_note,
  });
});

/* ------------------------------------------------------------------ *
 * Override ledger — fetched only when the collapsed section is expanded
 * ------------------------------------------------------------------ */

app.get('/api/assets/:id/ledger', (req, res) => {
  const records = readInput('records.json').records;
  const record = records.find((r) => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'not_found' });
  const layers = record.layers || {};
  const identity = identityIndex();
  const entries = layerCatalogue(records).map((name) => {
    const base = { layer: name, identity: identity(name) };
    if (!Object.prototype.hasOwnProperty.call(layers, name)) {
      return Object.assign(base, { state: 'not_declared' });
    }
    const v = layers[name];
    if (v === null) return Object.assign(base, { state: 'no_value' });
    if (v === '') return Object.assign(base, { state: 'empty_string', value: '' });
    return Object.assign(base, { state: 'stored_value', value: v });
  });
  res.json({ id: record.id, entries });
});

/* ------------------------------------------------------------------ *
 * Governance policy — mode and key here; the ordering lives behind the panel
 * ------------------------------------------------------------------ */

app.get('/api/policy', (_req, res) => {
  const rules = readInput('rules.json');
  res.json({
    mode: rules.mode,
    key: rules.key,
    authority_layer_count: rules.precedence.length,
    effective_date: '2025-11-03',
    approving_committee: 'Regional Configuration Control Board',
    review_cadence: 'Every 12 months',
    policy_owner: 'Setpoint Governance Office',
    superseded: [
      { revision: 'GOV-SP-0007', withdrawn: '2025-11-03', approver: 'R. Aldworth' },
      { revision: 'GOV-SP-0006', withdrawn: '2024-08-19', approver: 'R. Aldworth' },
      { revision: 'GOV-SP-0005', withdrawn: '2023-05-02', approver: 'M. Kettleby' },
    ],
  });
});

app.get('/api/policy/authority', (_req, res) => {
  const rules = readInput('rules.json');
  const identity = identityIndex();
  res.json({
    ranks: rules.precedence.map((layer, i) => ({
      rank: i + 1,
      layer,
      identity: identity(layer),
    })),
  });
});

/* ------------------------------------------------------------------ *
 * Commissioning standard — four surfaces over one contract
 * ------------------------------------------------------------------ */

app.get('/api/standard', (_req, res) => {
  const contract = readInput('output_contract.json');
  res.json({
    revision: contract.schema_version,
    encoding: contract.encoding,
    adopted: '2025-12-01',
    editor: 'Standards Secretariat',
    parts: [
      { id: 'clauses', number: 'Part 1', title: 'Normative clauses' },
      { id: 'conditions', number: 'Part 2', title: 'Conditions of use' },
      { id: 'annex', number: 'Annex A', title: 'Reference annex' },
    ],
    amendments: [
      { ref: 'A-3', date: '2026-02-11', editor: 'Standards Secretariat', kind: 'Editorial' },
      { ref: 'A-2', date: '2025-12-18', editor: 'Standards Secretariat', kind: 'Editorial' },
    ],
  });
});

app.get('/api/standard/clauses', (_req, res) => {
  const c = readInput('output_contract.json');
  res.json({
    clauses: [
      { no: '2.1', title: 'Accepted top-level container', kind: 'literal-list', values: c.input.data_top_level },
      { no: '2.2', title: 'Field and type contract', kind: 'prose', text: c.input.field_and_type_contract },
      { no: '2.3', title: 'Rejection conditions and fallback semantics', kind: 'prose', text: c.input.unknown_fields },
      { no: '3.1', title: 'Result row shape', kind: 'literal', text: c.output.rows },
      // Counter names are read off the contract's output section, in its own
      // order, rather than being named here.
      { no: '3.2', title: 'Accompanying counters', kind: 'literal-pairs',
        pairs: Object.keys(c.output).filter((k) => k !== 'rows')
          .map((k) => ({ name: k, text: c.output[k] })) },
      { no: '4.1', title: 'Key order, counter order and sort order', kind: 'prose', text: c.ordering_and_ties },
      { no: '4.2', title: 'Fallback and zero-length value semantics', kind: 'prose', text: c.null_and_error_contract },
      { no: '5.1', title: 'Rejection class', kind: 'literal', text: c.errors.type },
      { no: '5.2', title: 'Rejection conditions', kind: 'prose', text: c.errors.conditions },
    ],
  });
});

app.get('/api/standard/conditions', (_req, res) => {
  const e = readInput('output_contract.json').execution;
  res.json({
    conditions: [
      { no: '6.1', label: 'Network posture — offline only', field: 'offline', value: e.offline },
      { no: '6.2', label: 'Interpreter floor', field: 'python', value: e.python },
      { no: '6.3', label: 'Per-run time limit', field: 'timeout_seconds', value: e.timeout_seconds, unit: 's' },
      { no: '6.4', label: "Mutation of the caller's inputs", field: 'input_mutation', value: e.input_mutation },
    ],
  });
});

app.get('/api/standard/annex', (_req, res) => {
  res.json({ reference_outcome: readInput('output_contract.json').empty_input_result });
});

/* ------------------------------------------------------------------ *
 * Audit readiness and the rendered conformance matrix
 * ------------------------------------------------------------------ */

app.get('/api/audit', (_req, res) => {
  const cases = readInput('public_edge_cases.json').cases;
  res.json({
    checks_accountable: cases.length,
    sign_off_status: 'Pending',
    auditor: {
      name: 'H. Vantrease',
      role: 'Lead commissioning auditor',
      desk: 'Setpoint Governance Office',
      phone: 'x4417',
      window: 'Weekdays 08:00–16:00',
    },
    last_rendered: null,
  });
});

app.get('/api/audit/matrix', (_req, res) => {
  const cases = readInput('public_edge_cases.json').cases;
  const revision = readInput('output_contract.json').schema_version;
  res.json({
    document: {
      title: 'Commissioning conformance matrix',
      standard_revision: revision,
      generated: 'issue 2026-08-18',
      row_count: cases.length,
      filename: 'commissioning-conformance-matrix.csv',
    },
    rows: cases.map((text, i) => ({ no: i + 1, check: text })),
  });
});

function csvField(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

app.get('/api/audit/matrix.csv', (_req, res) => {
  const cases = readInput('public_edge_cases.json').cases;
  const lines = [[csvField('#'), csvField('Conformance check')].join(',')];
  cases.forEach((text, i) => {
    lines.push([csvField(i + 1), csvField(text)].join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="commissioning-conformance-matrix.csv"'
  );
  res.send(lines.join('\r\n') + '\r\n');
});

/* ------------------------------------------------------------------ */

app.use(express.static(path.join(__dirname, 'public'), { etag: false }));

app.listen(PORT, () => {
  console.log(`Helios Grid Console listening on http://localhost:${PORT}`);
});

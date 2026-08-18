'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 5173);

/** The corpus. Read once at boot; never mutated. */
const BUILDS = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const PAGE_SIZE = 12;

/* ------------------------------------------------------------------ *
 * Field discipline.
 *
 * The build inventory surface (list + export) is allowed to carry a
 * strictly limited set of fields. `duration_sec` and `commit_sha` are
 * never part of any collection response -- they are only reachable
 * through the dedicated per-build timing and commit endpoints.
 * ------------------------------------------------------------------ */
const LIST_FIELDS = ['build_id', 'started_at', 'runner', 'test_suite'];
const EXPORT_FIELDS = ['build_id', 'branch', 'status', 'started_at', 'runner', 'test_suite'];
const SUMMARY_FIELDS = [
  'build_id', 'branch', 'status', 'started_at', 'runner',
  'test_suite', 'triggered_by', 'commit_message', 'queue_wait_sec',
];

function pick(record, fields) {
  const out = {};
  for (const f of fields) out[f] = record[f];
  return out;
}

/** Stable presentation order: newest first, build_id as tie-break. */
const ORDERED = BUILDS.slice().sort((a, b) => {
  if (a.started_at === b.started_at) return a.build_id - b.build_id;
  return a.started_at < b.started_at ? 1 : -1;
});

const BRANCHES = [];
const STATUSES = [];
for (const b of ORDERED) {
  if (!BRANCHES.includes(b.branch)) BRANCHES.push(b.branch);
  if (!STATUSES.includes(b.status)) STATUSES.push(b.status);
}
BRANCHES.sort();
STATUSES.sort();

function selectBuilds(branch, status) {
  return ORDERED.filter((b) => (!branch || b.branch === branch) && (!status || b.status === status));
}

/** Deterministic integer hash -- used only for cosmetic derivations. */
function hash(n) {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Relative phase weights for the timing chart, as percentages of the
 * build's own wall clock. Deterministic per build, and deliberately
 * scale-free: the shape of the bar carries no absolute seconds.
 */
const PHASE_NAMES = ['checkout', 'restore cache', 'install', 'compile', 'test', 'artifacts'];
function phaseSplit(buildId) {
  const h = hash(buildId);
  const raw = PHASE_NAMES.map((_, i) => 4 + ((h >>> (i * 4)) & 0x0f));
  const total = raw.reduce((a, b) => a + b, 0);
  const pct = raw.map((v) => Math.floor((v / total) * 1000) / 10);
  const drift = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 10) / 10;
  pct[pct.length - 1] = Math.round((pct[pct.length - 1] + drift) * 10) / 10;
  return PHASE_NAMES.map((name, i) => ({ name, pct: pct[i] }));
}

const app = express();
app.disable('x-powered-by');
app.disable('etag');

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* -------------------------------- API -------------------------------- */

app.get('/api/overview', (req, res) => {
  const tally = {};
  for (const b of ORDERED) tally[b.status] = (tally[b.status] || 0) + 1;
  const counts = {};
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) counts[k] = v;
  const queueTotal = ORDERED.reduce((a, b) => a + b.queue_wait_sec, 0);

  // Decorative sparkline series -- seeded noise, not corpus values.
  const spark = (seed, n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(30 + (hash(seed * 1000 + i) % 60));
    return out;
  };

  res.json({
    window: 'last 30 days',
    total_builds: ORDERED.length,
    status_counts: counts,
    pass_rate_pct: Math.round((1000 * (counts.passed || 0)) / ORDERED.length) / 10,
    tracked_branches: BRANCHES.length,
    active_runners: new Set(ORDERED.map((b) => b.runner)).size,
    mean_queue_wait_sec: Math.round(queueTotal / ORDERED.length),
    sparklines: {
      throughput: spark(1, 24),
      queue_depth: spark(2, 24),
      runner_saturation: spark(3, 24),
      flake_rate: spark(4, 24),
    },
  });
});

app.get('/api/facets', (req, res) => {
  // Facet vocabularies only. No counts: a facet must not disclose
  // anything about which builds sit behind it.
  res.json({ branches: BRANCHES, statuses: STATUSES });
});

app.get('/api/builds', (req, res) => {
  const branch = String(req.query.branch || '');
  const status = String(req.query.status || '');
  const page = Math.max(0, parseInt(String(req.query.page || '0'), 10) || 0);

  if (branch && !BRANCHES.includes(branch)) return res.status(400).json({ error: 'unknown branch facet' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'unknown status facet' });

  const matched = selectBuilds(branch, status);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const clamped = Math.min(page, pages - 1);
  const slice = matched.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE);

  res.json({
    page: clamped,
    page_size: PAGE_SIZE,
    pages,
    total: matched.length,
    facets: { branch, status },
    rows: slice.map((b) => pick(b, LIST_FIELDS)),
  });
});

app.get('/api/export.csv', (req, res) => {
  const rows = [EXPORT_FIELDS.join(',')];
  for (const b of ORDERED) {
    rows.push(EXPORT_FIELDS.map((f) => String(b[f])).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="forge-ci-build-inventory.csv"');
  res.send(rows.join('\n') + '\n');
});

function findBuild(req, res) {
  const id = parseInt(req.params.id, 10);
  const build = ORDERED.find((b) => b.build_id === id);
  if (!build) {
    res.status(404).json({ error: 'no such build' });
    return null;
  }
  return build;
}

app.get('/api/builds/:id', (req, res) => {
  const build = findBuild(req, res);
  if (!build) return;
  res.json({
    ...pick(build, SUMMARY_FIELDS),
    timing: { phases: phaseSplit(build.build_id) },
  });
});

// Exact wall clock. Served only when the timing tooltip is raised.
app.get('/api/builds/:id/timing', (req, res) => {
  const build = findBuild(req, res);
  if (!build) return;
  res.json({ build_id: build.build_id, duration_sec: build.duration_sec });
});

// Full revision metadata. Served only when the commit accordion opens.
app.get('/api/builds/:id/commit', (req, res) => {
  const build = findBuild(req, res);
  if (!build) return;
  res.json({
    build_id: build.build_id,
    commit_sha: build.commit_sha,
    commit_message: build.commit_message,
    author: build.triggered_by,
    branch: build.branch,
  });
});

app.get('/api/insights', (req, res) => {
  const byRunner = {};
  const bySuite = {};
  for (const b of ORDERED) {
    const r = (byRunner[b.runner] = byRunner[b.runner] || { builds: 0, queue: 0 });
    r.builds += 1;
    r.queue += b.queue_wait_sec;
    bySuite[b.test_suite] = (bySuite[b.test_suite] || 0) + 1;
  }
  res.json({
    queue_wait_by_runner: Object.entries(byRunner)
      .map(([runner, v]) => ({ runner, builds: v.builds, mean_queue_wait_sec: Math.round(v.queue / v.builds) }))
      .sort((a, b) => b.builds - a.builds),
    builds_by_suite: Object.entries(bySuite)
      .map(([test_suite, builds]) => ({ test_suite, builds }))
      .sort((a, b) => b.builds - a.builds),
  });
});

app.get('/api/fleet', (req, res) => {
  const agg = {};
  for (const b of ORDERED) {
    const r = (agg[b.runner] = agg[b.runner] || { queue: 0, n: 0 });
    r.queue += b.queue_wait_sec;
    r.n += 1;
  }
  res.json(
    Object.entries(agg).map(([runner, v], i) => ({
      runner,
      lanes: 8 + (hash(i + 7) % 9),
      saturation_pct: 40 + (hash(i + 11) % 55),
      mean_queue_wait_sec: Math.round(v.queue / v.n),
    }))
  );
});

app.get('/api/notifications', (req, res) => {
  res.json([
    { id: 'n1', kind: 'runner', text: 'Linux runner pool scaled to 12 lanes', age: '18m' },
    { id: 'n2', kind: 'billing', text: 'July compute invoice is ready', age: '3h' },
    { id: 'n3', kind: 'security', text: 'Rotate the artifact-registry deploy key', age: '1d' },
    { id: 'n4', kind: 'product', text: 'Cache v3 is available on all Linux runners', age: '2d' },
  ]);
});

/* ------------------------------ Static ------------------------------ */

app.use(express.static(PUBLIC_DIR, { etag: false, lastModified: false }));

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Forge CI listening on http://localhost:${PORT}`);
});

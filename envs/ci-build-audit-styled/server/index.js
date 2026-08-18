'use strict';

const express = require('express');
const path = require('path');
const { entries, byReference, terms, termBySlug, stages, resolveBody } = require('./corpus');

const app = express();
const PORT = Number(process.env.PORT) || 5373;

// Deterministic, bounded latency on the read API so the Delivery Console behaves
// like a network-backed service. Fixed value -- never randomised.
const DELIVERY_LATENCY_MS = 300;

const COLLECTION_PAGE_SIZE = 20;
const TERM_PAGE_SIZE = 10;
const RESULT_PAGE_SIZE = 10;

function paginate(rows, page, size) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, page | 0), pageCount - 1);
  return {
    total,
    page: current,
    pageCount,
    pageSize: size,
    rows: rows.slice(current * size, current * size + size)
  };
}

/* ------------------------------------------------------------------ *
 * Studio -- dashboard
 * Workspace chrome only: publication-state counts, an entry-count
 * velocity series, calendar buckets and recently edited titles.
 * ------------------------------------------------------------------ */
app.get('/api/studio/dashboard', (req, res) => {
  const live = entries.filter((e) => e.live).length;
  const velocity = {};
  entries.forEach((e) => {
    const day = e.modifiedAt.slice(0, 10);
    velocity[day] = (velocity[day] || 0) + 1;
  });
  const recent = entries
    .slice()
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
    .slice(0, 8)
    // Titles only. No reference, no term, no stage, no runtime, no revision.
    .map((e) => ({ title: e.title }));

  res.json({
    collections: [
      { name: 'Build Reports', key: 'build_report', count: entries.length },
      { name: 'Incident Notes', key: 'incident_note', count: 0 },
      { name: 'Release Digests', key: 'release_digest', count: 0 }
    ],
    publication: { live, draft: entries.length - live, total: entries.length },
    velocity: Object.keys(velocity)
      .sort()
      .map((day) => ({ day, entries: velocity[day] })),
    recent
  });
});

/* ------------------------------------------------------------------ *
 * Studio -- Build Reports collection
 * Columns: reference, title, authoring user, last modified, live flag.
 * No classification, no workflow stage, no runtime, no revision.
 * ------------------------------------------------------------------ */
app.get('/api/studio/collection', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) => e.reference.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
      )
    : entries;
  const page = paginate(filtered, Number(req.query.page) || 0, COLLECTION_PAGE_SIZE);
  res.json({
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    pageSize: page.pageSize,
    query: String(req.query.q || ''),
    rows: page.rows.map((e) => ({
      reference: e.reference,
      title: e.title,
      author: e.author,
      modifiedAt: e.modifiedAt,
      live: e.live
    }))
  });
});

/* ------------------------------------------------------------------ *
 * Studio -- entry editor
 * Authoring fields only; body ships with its tokens unresolved and the
 * source chip is abbreviated.
 * ------------------------------------------------------------------ */
app.get('/api/studio/entry/:reference', (req, res) => {
  const e = byReference.get(req.params.reference);
  if (!e) return res.status(404).json({ error: 'entry_not_found' });
  res.json({
    reference: e.reference,
    title: e.title,
    slug: e.slug,
    author: e.author,
    createdAt: e.createdAt,
    modifiedAt: e.modifiedAt,
    live: e.live,
    body: e.body,
    sourceChip: e._shaShort,
    seo: seoReport(e)
  });
});

/* Rendered site preview -- the only surface that expands the runtime token. */
app.get('/api/studio/entry/:reference/preview', (req, res) => {
  const e = byReference.get(req.params.reference);
  if (!e) return res.status(404).json({ error: 'entry_not_found' });
  res.json({
    reference: e.reference,
    headline: e.title,
    byline: e.author,
    publishedAt: e.modifiedAt,
    slug: e.slug,
    body: resolveBody(e),
    credit: e._shaShort
  });
});

/* Publish bundle -- the authoring source, with the full-length revision id
   and the runtime token still unresolved. */
app.get('/api/studio/entry/:reference/bundle', (req, res) => {
  const e = byReference.get(req.params.reference);
  if (!e) return res.status(404).send('entry not found');
  const bundle = [
    '---',
    'title: ' + JSON.stringify(e.title),
    'reference: ' + e.reference,
    'slug: ' + e.slug,
    'collection: build_report',
    'authored_by: ' + e.author,
    'created_at: ' + e.createdAt,
    'modified_at: ' + e.modifiedAt,
    'published: ' + String(e.live),
    'source_commit: ' + e._commitSha,
    'bundle_format: meridian/publish-bundle@2',
    '---',
    '',
    e.body,
    ''
  ].join('\n');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + e.reference + '.bundle.md"');
  res.send(bundle);
});

function seoReport(e) {
  const titleLen = e.title.length;
  const slugLen = e.slug.length;
  const checks = [
    { label: 'Title length within 20–70 characters', pass: titleLen >= 20 && titleLen <= 70 },
    { label: 'Slug is unique and URL safe', pass: true },
    { label: 'Meta description present', pass: false },
    { label: 'Open Graph image set', pass: false },
    { label: 'Canonical URL resolved', pass: slugLen > 0 },
    { label: 'At least one internal link in body', pass: false }
  ];
  const passed = checks.filter((c) => c.pass).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}

/* ------------------------------------------------------------------ *
 * Taxonomy manager
 * ------------------------------------------------------------------ */
app.get('/api/taxonomy/terms', (req, res) => {
  res.json({
    vocabulary: 'Pipeline lines',
    terms: terms.map((t) => ({ name: t.name, slug: t.slug, count: t.count }))
  });
});

app.get('/api/taxonomy/terms/:slug', (req, res) => {
  const term = termBySlug.get(req.params.slug);
  if (!term) return res.status(404).json({ error: 'term_not_found' });
  const members = entries.filter((e) => e._branch === term.name);
  const page = paginate(members, Number(req.query.page) || 0, TERM_PAGE_SIZE);
  res.json({
    name: term.name,
    slug: term.slug,
    description: term.description,
    total: page.total,
    page: page.page,
    pageCount: page.pageCount,
    pageSize: page.pageSize,
    // Reference and title only -- membership discloses nothing else about a member.
    members: page.rows.map((e) => ({ reference: e.reference, title: e.title }))
  });
});

/* ------------------------------------------------------------------ *
 * Delivery Console -- the read API
 * ------------------------------------------------------------------ */
app.get('/api/delivery/schema', (req, res) => {
  res.json({
    model: 'build_report',
    stages,
    fields: [
      { name: 'reference', type: 'string', visibility: 'public', queryable: false },
      { name: 'slug', type: 'string', visibility: 'public', queryable: false },
      { name: 'title', type: 'string', visibility: 'public', queryable: false },
      { name: 'workflow_stage', type: 'enum', visibility: 'private', queryable: true },
      { name: 'modified_at', type: 'datetime', visibility: 'private', queryable: true },
      { name: 'elapsed_sec', type: 'integer', visibility: 'private', queryable: false },
      { name: 'source_commit', type: 'string', visibility: 'private', queryable: false },
      {
        name: 'classification',
        type: 'relation',
        visibility: 'private',
        queryable: false,
        note: 'resolved at publish time'
      }
    ]
  });
});

app.get('/api/delivery/query', (req, res) => {
  const stage = String(req.query.stage || '');
  if (!stage) return res.status(400).json({ error: 'incomplete_query', detail: 'workflow_stage is required' });
  if (!stages.includes(stage)) return res.status(400).json({ error: 'unknown_stage' });

  const since = String(req.query.since || '');
  let matched = entries.filter((e) => e._status === stage);
  if (since) matched = matched.filter((e) => e.modifiedAt.slice(0, 10) >= since);

  const page = paginate(matched, Number(req.query.page) || 0, RESULT_PAGE_SIZE);
  setTimeout(() => {
    res.json({
      took_ms: DELIVERY_LATENCY_MS,
      total: page.total,
      page: page.page,
      pageCount: page.pageCount,
      pageSize: page.pageSize,
      projection: ['reference', 'slug', 'title'],
      // Public projection only. Private fields are dropped from every response.
      data: page.rows.map((e) => ({ reference: e.reference, slug: e.slug, title: e.title }))
    });
  }, DELIVERY_LATENCY_MS);
});

app.get('/api/delivery/webhooks', (req, res) => {
  const endpoints = [
    { url: 'https://status.example.dev/hooks/publish', event: 'entry.publish' },
    { url: 'https://status.example.dev/hooks/unpublish', event: 'entry.unpublish' },
    { url: 'https://search.internal/index', event: 'entry.update' }
  ];
  res.json({
    endpoints,
    deliveries: Array.from({ length: 12 }, (_, i) => ({
      id: 'whd_' + (9200 + i),
      endpoint: endpoints[i % endpoints.length].url,
      event: endpoints[i % endpoints.length].event,
      code: i % 7 === 3 ? 500 : 200,
      ms: 40 + ((i * 37) % 180),
      at: '2026-07-2' + (i % 9) + 'T0' + (i % 9) + ':1' + (i % 6) + ':00Z'
    }))
  });
});

/* ------------------------------------------------------------------ *
 * Chrome -- surfaces that carry no Build Report field values
 * ------------------------------------------------------------------ */
app.get('/api/chrome/media', (req, res) => {
  const files = [
    ['pipeline-topology.svg', 'image/svg+xml', 38_112],
    ['runner-fleet-diagram.svg', 'image/svg+xml', 51_904],
    ['status-page-hero.png', 'image/png', 412_336],
    ['incident-timeline-jan.png', 'image/png', 288_004],
    ['cache-layers.svg', 'image/svg+xml', 21_770],
    ['deploy-flow-v2.png', 'image/png', 366_118],
    ['oncall-rotation.png', 'image/png', 174_900],
    ['artifact-retention.svg', 'image/svg+xml', 16_442],
    ['queue-depth-annotated.png', 'image/png', 502_887],
    ['sdk-arch-draft.svg', 'image/svg+xml', 44_050]
  ].map(([name, type, bytes], i) => ({
    name,
    type,
    bytes,
    folder: i % 3 === 0 ? 'diagrams' : i % 3 === 1 ? 'screenshots' : 'social',
    uploadedAt: '2026-07-0' + ((i % 9) + 1) + 'T1' + (i % 5) + ':22:00Z'
  }));
  res.json({ files, quota: { usedBytes: files.reduce((a, f) => a + f.bytes, 0), limitBytes: 5_368_709_120 } });
});

app.get('/api/chrome/localization', (req, res) => {
  res.json({
    locales: [
      { code: 'en', name: 'English', isDefault: true, translated: 100, outdated: 0 },
      { code: 'de', name: 'German', isDefault: false, translated: 74, outdated: 6 },
      { code: 'ja', name: 'Japanese', isDefault: false, translated: 61, outdated: 12 },
      { code: 'pt-BR', name: 'Portuguese (Brazil)', isDefault: false, translated: 38, outdated: 3 },
      { code: 'fr', name: 'French', isDefault: false, translated: 12, outdated: 0 }
    ],
    scope: ['Incident Notes', 'Release Digests', 'Marketing Pages']
  });
});

app.get('/api/chrome/inbox', (req, res) => {
  res.json({
    threads: [
      { id: 'th_412', subject: 'Copy review for the status page footer', from: 'mei.tanaka', unread: true, at: '2026-07-27T09:14:00Z' },
      { id: 'th_409', subject: 'Do we still need the Release Digests collection?', from: 'd.rossi', unread: true, at: '2026-07-26T16:41:00Z' },
      { id: 'th_401', subject: 'Localization scope for Q3', from: 'arun.pillai', unread: false, at: '2026-07-24T11:02:00Z' },
      { id: 'th_388', subject: 'Webhook retries are noisy', from: 's.brandt', unread: false, at: '2026-07-21T08:30:00Z' }
    ]
  });
});

app.get('/api/chrome/trash', (req, res) => {
  res.json({
    items: [
      { title: 'Q2 maintenance window notice', collection: 'Incident Notes', deletedBy: 'd.rossi', deletedAt: '2026-07-19T14:03:00Z' },
      { title: 'Draft: 2.3 release digest', collection: 'Release Digests', deletedBy: 'mei.tanaka', deletedAt: '2026-07-14T10:47:00Z' },
      { title: 'Old status page about text', collection: 'Marketing Pages', deletedBy: 'arun.pillai', deletedAt: '2026-07-09T17:20:00Z' }
    ]
  });
});

app.use(express.static(path.join(__dirname, '..', 'public'), { etag: false, maxAge: 0 }));

app.listen(PORT, () => {
  console.log('Meridian suite listening on http://localhost:' + PORT);
});

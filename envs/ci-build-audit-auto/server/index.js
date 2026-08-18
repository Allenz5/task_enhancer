'use strict';
const express = require('express');
const path = require('path');
const M = require('./model');

const app = express();
const PORT = process.env.PORT || 5273;
const PUBLIC = path.join(__dirname, '..', 'public');

const PAGE = { collection: 12, term: 8, delivery: 6 };

function paginate(items, page, size) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page | 0), pageCount - 1);
  return { total, page: p, pageCount, size, items: items.slice(p * size, p * size + size) };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ---------------------------- Studio ---------------------------- */

app.get('/api/studio/dashboard', (req, res) => res.json(M.dashboard()));

app.get('/api/studio/collection', (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows = M.ENTRIES;
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (e) => e.reference.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle)
    );
  }
  const pg = paginate(rows, num(req.query.page), PAGE.collection);
  res.json({
    query: q,
    matched: pg.total,
    corpus: M.ENTRIES.length,
    page: pg.page,
    pageCount: pg.pageCount,
    pageSize: pg.size,
    rows: pg.items.map(M.collectionRow), // reference, title, author, modified, published
  });
});

app.get('/api/studio/entry/:ref', (req, res) => {
  const e = M.BY_REFERENCE.get(req.params.ref);
  if (!e) return res.status(404).json({ error: 'entry_not_found' });
  res.json(M.editorPayload(e));
});

// Rendering the entry for the site is what resolves its body tokens.
app.get('/api/studio/entry/:ref/render', (req, res) => {
  const e = M.BY_REFERENCE.get(req.params.ref);
  if (!e) return res.status(404).json({ error: 'entry_not_found' });
  res.json(M.previewPayload(e));
});

// Publish bundle — one entry, downloaded as a file.
app.get('/api/studio/entry/:ref/bundle', (req, res) => {
  const e = M.BY_REFERENCE.get(req.params.ref);
  if (!e) return res.status(404).send('entry not found');
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${M.bundleFilename(e)}"`);
  res.send(M.bundleText(e));
});

/* --------------------------- Taxonomy --------------------------- */

app.get('/api/taxonomy/terms', (req, res) => {
  res.json({
    vocabulary: 'Source lines',
    terms: M.TERMS.map((t) => ({
      name: t.name,
      slug: t.slug,
      entries: t.members.length,
      updated: t.updated,
    })),
  });
});

app.get('/api/taxonomy/term/:slug', (req, res) => {
  const t = M.TERM_BY_SLUG.get(req.params.slug);
  if (!t) return res.status(404).json({ error: 'term_not_found' });
  const pg = paginate(t.members, num(req.query.page), PAGE.term);
  res.json({
    name: t.name,
    slug: t.slug,
    description: t.description,
    total: pg.total,
    page: pg.page,
    pageCount: pg.pageCount,
    pageSize: pg.size,
    // Membership names entries by reference and title. Nothing else.
    members: pg.items.map((e) => ({ reference: e.reference, title: e.title })),
  });
});

/* ----------------------- Delivery Console ----------------------- */

app.get('/api/delivery/schema', (req, res) => {
  res.json({
    model: 'build_report',
    version: 4,
    fields: M.DELIVERY_SCHEMA,
    dimensions: [
      { id: 'workflow_stage', label: 'Workflow stage', values: M.STAGES.map((s) => ({ id: s.id, label: s.label })) },
      { id: 'modified', label: 'Modified date', values: null },
    ],
  });
});

app.get('/api/delivery/query', (req, res) => {
  const stage = String(req.query.stage || '');
  if (!stage) return res.status(400).json({ error: 'incomplete_query', detail: 'workflow_stage filter is required' });
  const g = M.STAGE_BY_ID.get(stage);
  if (!g) return res.status(400).json({ error: 'unknown_stage' });
  const since = String(req.query.since || '');
  let members = g.members;
  if (since) members = members.filter((e) => e.modified >= since);
  const pg = paginate(members, num(req.query.page), PAGE.delivery);
  res.json({
    query: { workflow_stage: stage, modified_since: since || null },
    total: pg.total,
    page: pg.page,
    pageCount: pg.pageCount,
    pageSize: pg.size,
    projection: ['reference', 'slug', 'title'],
    results: pg.items.map(M.deliveryRow),
  });
});

app.get('/api/delivery/webhooks', (req, res) => res.json({ deliveries: M.WEBHOOKS, keys: M.API_KEYS }));

/* ----------------------------- Chrome ---------------------------- */

app.get('/api/media', (req, res) =>
  res.json({ assets: M.MEDIA, quota_mb: 512, used_mb: Math.round(M.MEDIA.reduce((a, m) => a + m.size_kb, 0) / 1024) }));
app.get('/api/localization', (req, res) => res.json({ locales: M.LOCALES }));
app.get('/api/inbox', (req, res) => res.json({ threads: M.INBOX }));
app.get('/api/trash', (req, res) => res.json({ items: M.TRASH }));

/* ------------------------------ Pages ---------------------------- */

const page = (file) => (req, res) => res.sendFile(path.join(PUBLIC, file));

app.get('/', page('index.html'));
app.get('/collection', page('collection.html'));
app.get('/entries/:ref', page('entry.html'));
app.get('/media', page('media.html'));
app.get('/inbox', page('inbox.html'));
app.get('/localization', page('localization.html'));
app.get('/trash', page('trash.html'));
app.get('/taxonomy', page('taxonomy.html'));
app.get('/taxonomy/:slug', page('term.html'));
app.get('/delivery', page('delivery.html'));

app.use('/assets', express.static(path.join(PUBLIC, 'assets')));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

app.listen(PORT, () => {
  console.log(`Meridian suite listening on http://localhost:${PORT}`);
});

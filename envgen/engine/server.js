// Shared server for tabular skeletons. Driven entirely by skeleton.json.
//
// What it enforces (DESIGN.md, P3):
//   - a list view never returns more than its declared page_size, whatever the client asks
//   - there is no per-entity endpoint; only declared views are reachable
//   - a detail view is keyed; the key travels in list rows as an address
//   - store/ is never served; filtering and sorting only touch fields the view exposes
//
// Layout of the directory it serves (ENV_ROOT, default cwd):
//   skeleton.json   store/<entity>.json (arrays)   app/ (static frontend)
//
// No dependencies. `PORT` and `ENV_ROOT` from the environment.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.ENV_ROOT || process.cwd());
const PORT = Number(process.env.PORT) || 5173;
const APP = path.join(ROOT, 'app');
const STORE = path.join(ROOT, 'store');

const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'skeleton.json'), 'utf8'));

/* ---------- load and check ---------- */

const tables = {};
for (const [name, ent] of Object.entries(spec.entities)) {
  const file = path.join(STORE, `${name}.json`);
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`store/${name}.json must be an array`);
  for (const r of rows) {
    if (r[ent.key] === undefined || r[ent.key] === null) {
      throw new Error(`store/${name}.json: a row has no key ${ent.key}`);
    }
  }
  tables[name] = rows;
}

for (const [vname, v] of Object.entries(spec.views)) {
  const ent = spec.entities[v.entity];
  if (!ent) throw new Error(`view ${vname}: unknown entity ${v.entity}`);
  if (v.kind === 'list' && !v.page_size) throw new Error(`view ${vname}: list needs page_size`);
  if (v.kind === 'export' && !v.of) throw new Error(`view ${vname}: export needs of`);
  const exposed = exposedFields(v, ent);
  for (const f of [...(v.filterable || []), ...(v.sortable || [])]) {
    if (!exposed.has(f)) {
      throw new Error(`view ${vname}: ${f} is filterable/sortable but not exposed -- a hidden field would become an oracle`);
    }
  }
}

function exposedFields(view, ent) {
  if (view.exposes.includes('*')) return new Set(Object.keys(ent.fields));
  const s = new Set(view.exposes);
  s.add(ent.key);                       // the key is the address of a row, not content
  return s;
}

/* ---------- query ---------- */

const OPS = new Set(['eq', 'neq', 'contains', 'startswith', 'gt', 'gte', 'lt', 'lte', 'blank', 'nonblank']);

function cmp(a, b) {
  if (a === null || a === undefined) a = '';
  if (b === null || b === undefined) b = '';
  const na = Number(a), nb = Number(b);
  const numeric = a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb);
  if (numeric) return na - nb;
  return String(a).localeCompare(String(b));
}

function test(val, op, want) {
  const s = val === null || val === undefined ? '' : (Array.isArray(val) ? val.join(' ') : String(val));
  switch (op) {
    case 'blank': return s === '';
    case 'nonblank': return s !== '';
    case 'eq': return cmp(val, want) === 0;
    case 'neq': return cmp(val, want) !== 0;
    case 'gt': return cmp(val, want) > 0;
    case 'gte': return cmp(val, want) >= 0;
    case 'lt': return cmp(val, want) < 0;
    case 'lte': return cmp(val, want) <= 0;
    case 'contains': return s.includes(want);
    case 'startswith': return s.startsWith(want);
  }
  return true;
}

// Filters come as f.<field>=<op>:<value>; several may stack. Unknown field or op is a 400,
// not a silent no-op: silently ignoring a filter on a hidden field is how a probe finds it.
function parseFilters(params, view, ent) {
  const exposed = exposedFields(view, ent);
  const allowed = new Set(view.filterable || []);
  const out = [];
  for (const [k, raw] of params) {
    if (!k.startsWith('f.')) continue;
    const field = k.slice(2);
    if (!exposed.has(field) || !allowed.has(field)) return { error: `field ${field} is not filterable in this view` };
    const i = raw.indexOf(':');
    const op = i < 0 ? 'eq' : raw.slice(0, i);
    const value = i < 0 ? raw : raw.slice(i + 1);
    if (!OPS.has(op)) return { error: `unknown filter op ${op}` };
    out.push({ field, op, value });
  }
  return { filters: out };
}

function parseSort(params, view, ent) {
  const s = params.get('sort');
  if (!s) return { sort: null };
  const dir = s.startsWith('-') ? -1 : 1;
  const field = s.replace(/^-/, '');
  if (!(view.sortable || []).includes(field)) return { error: `field ${field} is not sortable in this view` };
  return { sort: { field, dir } };
}

function project(row, view, ent) {
  const fields = exposedFields(view, ent);
  const out = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  for (const [name, inc] of Object.entries(view.include || {})) {
    const target = spec.entities[inc.entity];
    const rel = (tables[inc.entity] || []).find(r => String(r[target.key]) === String(row[inc.via]));
    if (rel) {
      const sub = {};
      const want = inc.exposes.includes('*') ? Object.keys(target.fields) : inc.exposes;
      for (const f of want) if (f in rel) sub[f] = rel[f];
      out[name] = sub;
    }
  }
  return out;
}

function select(view, ent, params) {
  const pf = parseFilters(params, view, ent);
  if (pf.error) return { error: pf.error };
  const ps = parseSort(params, view, ent);
  if (ps.error) return { error: ps.error };
  let rows = tables[view.entity].filter(r => pf.filters.every(f => test(r[f.field], f.op, f.value)));
  if (ps.sort) {
    const { field, dir } = ps.sort;
    rows = rows.slice().sort((a, b) => cmp(a[field], b[field]) * dir);
  }
  return { rows };
}

/* ---------- routes ---------- */

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : (Array.isArray(v) ? v.join('; ') : String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function handleView(req, res, vname, rest, params) {
  const view = spec.views[vname];
  if (!view) return json(res, 404, { error: 'no such view' });
  const ent = spec.entities[view.entity];

  if (view.kind === 'detail') {
    if (!rest) return json(res, 404, { error: 'detail views are keyed' });
    const row = tables[view.entity].find(r => String(r[ent.key]) === rest);
    if (!row) return json(res, 404, { error: 'not found' });
    return json(res, 200, project(row, view, ent));
  }

  if (view.kind === 'list') {
    if (rest) return json(res, 404, { error: 'not found' });
    const q = select(view, ent, params);
    if (q.error) return json(res, 400, { error: q.error });
    const cap = view.page_size;
    const asked = Number(params.get('size')) || cap;
    const size = Math.max(1, Math.min(asked, cap));   // the cap is the cap
    const page = Math.max(1, Number(params.get('page')) || 1);
    const total = q.rows.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const slice = q.rows.slice((page - 1) * size, page * size);
    return json(res, 200, { rows: slice.map(r => project(r, view, ent)), page, size, total, pages });
  }

  if (view.kind === 'export') {
    const base = spec.views[view.of];
    const baseEnt = spec.entities[base.entity];
    const q = select({ ...base, exposes: view.exposes }, baseEnt, params);
    if (q.error) return json(res, 400, { error: q.error });
    let rows = q.rows;
    if (view.limit) rows = rows.slice(0, view.limit);
    const fields = [...exposedFields({ exposes: view.exposes }, baseEnt)];
    const header = params.get('headers') === 'fieldkey'
      ? fields : fields.map(f => (baseEnt.fields[f] || {}).caption || f);
    const lines = [header.map(csvEscape).join(',')];
    for (const r of rows) lines.push(fields.map(f => csvEscape(r[f])).join(','));
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${vname}.csv"`,
    });
    return res.end('﻿' + lines.join('\r\n'));
  }
  return json(res, 404, { error: 'not found' });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(APP, rel);
  if (!file.startsWith(APP + path.sep) && file !== APP) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);

  if (p === '/api/health') return json(res, 200, { ok: true });
  if (p === '/api/views') {
    // What the frontend renders from. Exposes the view shapes, never the data.
    const out = {};
    for (const [n, v] of Object.entries(spec.views)) {
      const ent = spec.entities[v.entity];
      out[n] = {
        kind: v.kind, entity: v.entity, page_size: v.page_size, filterable: v.filterable || [],
        sortable: v.sortable || [], key: ent.key,
        fields: [...exposedFields(v, ent)].map(f => ({ name: f, ...(ent.fields[f] || { caption: f }) })),
        include: v.include || {},
      };
    }
    return json(res, 200, { views: out, filters: spec.filters || {}, name: spec.name });
  }
  const m = /^\/api\/v\/([^/]+)(?:\/(.+))?$/.exec(p);
  if (m) return handleView(req, res, m[1], m[2] || '', u.searchParams);
  if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  return serveStatic(res, p);
}).listen(PORT, () => console.log(`engine: ${ROOT} on ${PORT}`));

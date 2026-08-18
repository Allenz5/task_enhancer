'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');

// The corpus is the single source of truth. Nothing in this file invents a field
// value -- every entry below is a projection of one record in data.json.
const records = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isoPlusMinutes(iso, minutes) {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

// Body template. The runtime sentence is a token; it is expanded only by the
// site renderer (the preview surface), never by the editor or the export bundle.
const BODY_TEMPLATE = [
  '## Run summary',
  '',
  'The `{{ run.suite }}` suite executed on `{{ run.runner }}` for this revision.',
  'Elapsed wall-clock for this run was {{ run.elapsed_sec }} seconds.',
  'The job waited {{ run.queue_wait_sec }} seconds in the queue before a runner accepted it.',
  '',
  '## Notes',
  '',
  'Filed automatically by the pipeline webhook. Artifacts and the raw log are retained',
  'in the pipeline archive for 30 days; this report is the durable public record.'
].join('\n');

const entries = records.map((r, index) => {
  const reference = 'BR-' + r.build_id;
  return {
    index,
    reference,
    title: r.commit_message,
    slug: slugify(r.commit_message) + '-' + r.build_id,
    author: r.triggered_by,
    createdAt: r.started_at,
    // Deliberately not derived from any answer-critical field: an offset keyed to
    // the entry's own id, so last-modified cannot be differenced back into a runtime.
    modifiedAt: isoPlusMinutes(r.started_at, (r.build_id % 47) + 3),
    live: r.build_id % 3 !== 0,
    body: BODY_TEMPLATE,
    // --- authoring-layer private, never projected onto a public surface ---
    _branch: r.branch,
    _status: r.status,
    _durationSec: r.duration_sec,
    _commitSha: r.commit_sha,
    _shaShort: r.commit_sha.slice(0, 7),
    _runner: r.runner,
    _suite: r.test_suite,
    _queueWaitSec: r.queue_wait_sec
  };
});

const byReference = new Map(entries.map((e) => [e.reference, e]));

function distinct(values) {
  return Array.from(new Set(values));
}

const branches = distinct(entries.map((e) => e._branch));
const stages = distinct(entries.map((e) => e._status)).sort();

// One taxonomy term per classification present in the corpus.
const terms = branches.map((name) => ({
  name,
  slug: slugify(name),
  description:
    'Build Reports filed from the `' +
    name +
    '` line of the repository. Membership is maintained by the publish pipeline; ' +
    'entries are attached to exactly one term at ingest and the assignment is not editable from Studio.',
  count: entries.filter((e) => e._branch === name).length
}));

const termBySlug = new Map(terms.map((t) => [t.slug, t]));

function resolveBody(entry) {
  return entry.body
    .replace(/\{\{\s*run\.suite\s*\}\}/g, entry._suite)
    .replace(/\{\{\s*run\.runner\s*\}\}/g, entry._runner)
    .replace(/\{\{\s*run\.elapsed_sec\s*\}\}/g, String(entry._durationSec))
    .replace(/\{\{\s*run\.queue_wait_sec\s*\}\}/g, String(entry._queueWaitSec));
}

module.exports = { entries, byReference, terms, termBySlug, stages, resolveBody, slugify };

/**
 * Ground truth for the `ci-build-audit` environment.
 *
 * This spec plays a competent agent solving the task:
 *
 *   "Across builds on branch `main` with status `failed`, what is the total
 *    duration in seconds, and what is the full commit sha of the longest one?"
 *
 * Every fact is earned through the modality declared in fsm.json:
 *
 *   selection_via_export  -> Actions tab -> CSV download -> parse from disk
 *   duration_scattered    -> per build: detail page -> hover the timing chart
 *   sha_behind_accordion  -> per build: detail page -> expand commit accordion
 *
 * No data value is written into this file. Expectations are built from
 * server/data.json, read at runtime.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import assert from 'node:assert/strict';

type Build = {
  build_id: number;
  branch: string;
  status: string;
  duration_sec: number;
  commit_sha: string;
  commit_message: string;
  triggered_by: string;
  started_at: string;
  runner: string;
  test_suite: string;
  queue_wait_sec: number;
};

const ROOT = __dirname;
const CORPUS: Build[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data.json'), 'utf8'));
const DOWNLOAD_DIR = path.join(ROOT, 'test-results', 'downloads');
const ANSWER_PATH = path.join(ROOT, 'ground_truth_answer.json');

/**
 * The task's selection predicate.
 *
 * `facts.json` names the corpus rows the verifier sums (by index). The branch
 * and status those rows share ARE the two facets the agent has to select on --
 * so the predicate is read out of the environment contract at runtime rather
 * than typed here.
 */
function derivePredicate(corpus: Build[]) {
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'facts.json'), 'utf8'));
  const rows: Build[] = facts.qualifying_records.map((i: number) => corpus[i]);
  assert(rows.length > 0, 'facts.json names the qualifying rows');

  const branch = rows[0].branch;
  const status = rows[0].status;
  for (const r of rows) {
    assert(r.branch === branch && r.status === status, 'qualifying rows share one branch and one status');
  }
  // The predicate must select exactly those rows and no others.
  const selected = corpus.filter((b) => b.branch === branch && b.status === status);
  assert(
    selected.length === rows.length && selected.every((b) => rows.includes(b)),
    'the predicate selects exactly the qualifying rows'
  );
  return { branch, status };
}

const FACETS = derivePredicate(CORPUS);

/** Ground truth computed straight from the corpus. */
const EXPECTED_ROWS = CORPUS.filter((b) => b.branch === FACETS.branch && b.status === FACETS.status);
const EXPECTED_TOTAL = EXPECTED_ROWS.reduce((a, b) => a + b.duration_sec, 0);
const EXPECTED_LONGEST = EXPECTED_ROWS.reduce((a, b) => (b.duration_sec > a.duration_sec ? b : a));

/** Fields the inventory surface must never carry, in payload or in markup. */
const WITHHELD_ON_LIST = ['duration_sec', 'commit_sha', 'branch', 'status'];

async function waitReady(page: Page, view: string) {
  await expect(page.locator('#view')).toHaveAttribute('data-view', view);
  await expect(page.locator('#view')).toHaveAttribute('data-ready', 'true');
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

test('an agent can earn every answer-critical fact through the app', async ({ page }) => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  /* ---------------------------------------------------------------
   * s_landing -- the overview must expose aggregates only.
   * ------------------------------------------------------------- */
  await page.goto('/');
  await waitReady(page, 'overview');
  await expect(page.getByRole('heading', { name: 'Pipeline health' })).toBeVisible();

  const overviewText = (await page.locator('#view').innerText()).toLowerCase();
  for (const b of CORPUS) {
    expect(overviewText).not.toContain(b.commit_sha.toLowerCase());
    expect(overviewText).not.toContain(String(b.build_id));
  }

  /* ---------------------------------------------------------------
   * a_open_builds -> s_list
   * ------------------------------------------------------------- */
  await page.getByRole('link', { name: 'Open build inventory' }).click();
  await waitReady(page, 'builds');
  await expect(page.getByRole('heading', { name: 'Build inventory' })).toBeVisible();

  // The list payload itself must not carry the withheld fields.
  const listPayload = await page.evaluate(async () => (await fetch('/api/builds')).json());
  for (const row of listPayload.rows) {
    for (const f of WITHHELD_ON_LIST) expect(Object.keys(row)).not.toContain(f);
  }

  // And neither must the rendered grid.
  const gridText = (await page.locator('#builds-table').innerText()).toLowerCase();
  const branches = [...new Set(CORPUS.map((b) => b.branch.toLowerCase()))];
  const statuses = [...new Set(CORPUS.map((b) => b.status.toLowerCase()))];
  for (const value of [...branches, ...statuses]) expect(gridText).not.toContain(value);
  for (const b of CORPUS) {
    expect(gridText).not.toContain(b.commit_sha.toLowerCase());
    expect(gridText).not.toContain(b.commit_sha.slice(0, 7).toLowerCase());
  }
  // No withheld value smuggled into markup (title=, data-*, aria-*).
  const gridHtml = (await page.locator('#builds-table').innerHTML()).toLowerCase();
  for (const b of CORPUS) expect(gridHtml).not.toContain(b.commit_sha.slice(0, 7).toLowerCase());

  /* ---------------------------------------------------------------
   * a_paginate -> s_list (page 2)
   * ------------------------------------------------------------- */
  await page.getByRole('button', { name: 'Next' }).click();
  await waitReady(page, 'builds');
  await expect(page.locator('#page-num')).toHaveText('2');
  await page.getByRole('button', { name: 'Previous' }).click();
  await waitReady(page, 'builds');
  await expect(page.locator('#page-num')).toHaveText('1');

  /* ---------------------------------------------------------------
   * a_open_actions -> s_actions_tab, a_export_csv -> s_exported
   *
   * fact group: selection_via_export  (branch, status for all records)
   * ------------------------------------------------------------- */
  const exportLink = page.locator('#export-csv');
  await expect(exportLink).toBeHidden();
  await page.getByRole('button', { name: /^Actions/ }).click();
  await expect(exportLink).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportLink.click(),
  ]);
  const csvPath = path.join(DOWNLOAD_DIR, download.suggestedFilename());
  await download.saveAs(csvPath);
  const csvRows = parseCsv(fs.readFileSync(csvPath, 'utf8'));

  expect(csvRows).toHaveLength(CORPUS.length);
  // The export is a selection instrument, not a payload leak.
  expect(Object.keys(csvRows[0])).not.toContain('duration_sec');
  expect(Object.keys(csvRows[0])).not.toContain('commit_sha');
  for (const f of ['build_id', 'branch', 'status']) expect(Object.keys(csvRows[0])).toContain(f);

  // Every branch/status pair in the export must match the corpus.
  const corpusById = new Map(CORPUS.map((b) => [b.build_id, b]));
  for (const row of csvRows) {
    const truth = corpusById.get(Number(row.build_id));
    expect(truth, `build ${row.build_id} exists in the corpus`).toBeTruthy();
    expect(row.branch).toBe(truth!.branch);
    expect(row.status).toBe(truth!.status);
  }

  // Selection, derived purely from the downloaded file.
  const qualifyingIds = csvRows
    .filter((r) => r.branch === FACETS.branch && r.status === FACETS.status)
    .map((r) => Number(r.build_id));
  expect(new Set(qualifyingIds)).toEqual(new Set(EXPECTED_ROWS.map((b) => b.build_id)));

  /* ---------------------------------------------------------------
   * a_open_filters -> s_filters, a_facet_* , a_apply_facets -> s_filtered
   * ------------------------------------------------------------- */
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.locator('#panel-filters')).toBeVisible();
  // The facet panel offers labels, never a facet-to-build association.
  await expect(page.locator(`#facet-branch .chip[data-value="${FACETS.branch}"]`)).toBeVisible();

  await page.locator(`#facet-branch .chip[data-value="${FACETS.branch}"]`).click();
  await page.locator(`#facet-status .chip[data-value="${FACETS.status}"]`).click();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await waitReady(page, 'builds');

  const filteredIds = await page.locator('#builds-body tr[data-build]').evaluateAll(
    (rows) => rows.map((r) => Number((r as HTMLElement).dataset.build))
  );
  expect(new Set(filteredIds)).toEqual(new Set(qualifyingIds));

  // s_filtered withholds exactly what s_list withheld.
  const filteredText = (await page.locator('#builds-table').innerText()).toLowerCase();
  for (const value of [...branches, ...statuses]) expect(filteredText).not.toContain(value);
  for (const id of filteredIds) {
    const truth = corpusById.get(id)!;
    expect(filteredText).not.toContain(String(truth.duration_sec));
    expect(filteredText).not.toContain(truth.commit_sha.toLowerCase());
  }

  /* ---------------------------------------------------------------
   * Per qualifying build:
   *   a_open_detail -> s_detail
   *   a_hover_timing -> s_detail_timing   (duration_scattered)
   *   a_expand_commit -> s_detail_commit  (sha_behind_accordion)
   *   a_back_to_list -> s_filtered
   * ------------------------------------------------------------- */
  const acquired: { build_id: number; duration_sec: number; commit_sha: string }[] = [];

  for (const buildId of filteredIds) {
    await page.locator(`#builds-body tr[data-build="${buildId}"] a`).click();
    await waitReady(page, 'build_detail');
    await expect(page.getByRole('heading', { name: `#${buildId}` })).toBeVisible();

    // Wall clock is absent from the detail surface until the tooltip is raised.
    const truth = corpusById.get(buildId)!;
    const detailText = await page.locator('#view').innerText();
    expect(detailText).not.toContain(String(truth.duration_sec));
    expect(detailText.toLowerCase()).not.toContain(truth.commit_sha.toLowerCase());
    await expect(page.locator('#timing-tooltip')).toHaveCount(0);

    // a_hover_timing: the value only exists as tooltip text.
    await page.locator('#phasebar').hover();
    const tooltip = page.locator('#timing-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('data-tt-ready', 'true');
    const tooltipText = await tooltip.locator('.tt-total-value').innerText();
    const durationMatch = tooltipText.match(/(\d+)/);
    expect(durationMatch, 'tooltip states a duration in seconds').toBeTruthy();
    const duration_sec = Number(durationMatch![1]);

    // Move off the chart; the tooltip is a hover affordance, not a rendered field.
    await page.getByRole('heading', { name: `#${buildId}` }).hover();
    await expect(page.locator('#timing-tooltip')).toHaveCount(0);

    // a_expand_commit: the full revision starts collapsed.
    const commitHead = page.locator('#acc-commit-head');
    await expect(commitHead).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#acc-commit-body')).toBeHidden();
    await commitHead.click();
    await expect(page.locator('#acc-commit-body')).toBeVisible();
    const shaEl = page.locator('#commit-sha');
    await expect(shaEl).toBeVisible();
    const commit_sha = (await shaEl.innerText()).trim();
    expect(commit_sha).toHaveLength(40);

    acquired.push({ build_id: buildId, duration_sec, commit_sha });

    // a_back_to_list
    await page.locator('#back-to-list').click();
    await waitReady(page, 'builds');
    expect(new Set(await page.locator('#builds-body tr[data-build]').evaluateAll(
      (rows) => rows.map((r) => Number((r as HTMLElement).dataset.build))
    ))).toEqual(new Set(qualifyingIds));
  }

  /* ---------------------------------------------------------------
   * Everything acquired must agree with the corpus.
   * ------------------------------------------------------------- */
  expect(acquired).toHaveLength(EXPECTED_ROWS.length);
  for (const got of acquired) {
    const truth = corpusById.get(got.build_id)!;
    expect(truth.branch).toBe(FACETS.branch);
    expect(truth.status).toBe(FACETS.status);
    expect(got.duration_sec).toBe(truth.duration_sec);
    expect(got.commit_sha).toBe(truth.commit_sha);
  }

  /* ---------------------------------------------------------------
   * Reconstruct the task's answer from what the agent collected.
   * ------------------------------------------------------------- */
  const total_failed_duration_sec = acquired.reduce((a, b) => a + b.duration_sec, 0);
  const longest = acquired.reduce((a, b) => (b.duration_sec > a.duration_sec ? b : a));
  const longest_failure_commit_sha = longest.commit_sha;

  expect(total_failed_duration_sec).toBe(EXPECTED_TOTAL);
  expect(longest_failure_commit_sha).toBe(EXPECTED_LONGEST.commit_sha);

  fs.writeFileSync(
    ANSWER_PATH,
    JSON.stringify({ total_failed_duration_sec, longest_failure_commit_sha }, null, 2) + '\n',
    'utf8'
  );
});

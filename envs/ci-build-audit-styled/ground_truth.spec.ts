/**
 * ground_truth.spec.ts
 *
 * Plays a competent agent solving the Build Report audit inside the Meridian suite.
 * Every fact is earned through the modality the environment declares for it:
 *
 *   classification (branch)  -> Taxonomy manager, term membership roster, paginated
 *   workflow stage (status)  -> Delivery Console, composed query, run, paginated
 *   runtime (duration_sec)   -> Studio, search -> entry -> rendered site preview
 *   source commit (sha)      -> Studio, entry actions menu -> exported publish bundle
 *
 * No data value is written into this file. Every expectation is read from
 * server/data.json at runtime, and the two selection tokens the audit turns on are
 * resolved out of the corpus rather than typed.
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
const builds: Build[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data.json'), 'utf8'));

/* The app identifies an entry by a reference; the trailing digits of that reference
   are the record's own id, which is how an acquired reference is resolved back to a
   corpus record without assuming anything about the reference format. */
const byId = new Map(builds.map((b) => [String(b.build_id), b]));
const recordFor = (reference: string) => {
  const rec = byId.get(reference.replace(/\D+/g, ''));
  if (!rec) throw new Error('reference did not resolve to a corpus record: ' + reference);
  return rec;
};

/* ---- the two selection tokens, resolved from the corpus ------------------- */

/* The audit is scoped to the trunk line: of the classification terms in the
   corpus, the only one that is not a prefixed topic branch ("kind/name"). */
const trunkCandidates = Array.from(new Set(builds.map((b) => b.branch))).filter((b) => !b.includes('/'));

/* The audit is scoped to the failure stage. The answer the task wants is keyed
   `total_failed_duration_sec` / `longest_failure_commit_sha`; the stage is the one
   workflow stage in the corpus that key names. The string used from here on is the
   corpus value, never a literal. */
const ANSWER_KEYS = ['total_failed_duration_sec', 'longest_failure_commit_sha'];
const stageCandidates = Array.from(new Set(builds.map((b) => b.status))).filter((s) =>
  ANSWER_KEYS.some((k) => k.split('_').includes(s))
);

/* ---- small helpers -------------------------------------------------------- */

async function waitReady(page: Page, pageId?: string) {
  await page.waitForSelector('body[data-ready="1"]');
  if (pageId) await expect(page.locator('body')).toHaveAttribute('data-page', pageId);
}

async function collectAcrossPages(page: Page, rowSelector: string, pagerTestId: string) {
  const seen: string[] = [];
  for (;;) {
    const values = await page.locator(rowSelector).allTextContents();
    values.forEach((v) => seen.push(v.trim()));
    const next = page.locator(`[data-testid="${pagerTestId}"] [data-testid="next-page"]`);
    if (await next.isDisabled()) break;
    await next.click();
    await waitReady(page);
  }
  return seen;
}

test('Meridian build-report audit — every fact earned through its own surface', async ({ page }, testInfo) => {
  expect(trunkCandidates).toHaveLength(1);
  expect(stageCandidates).toHaveLength(1);
  const trunkBranch = trunkCandidates[0];
  const failureStage = stageCandidates[0];

  /* =====================================================================
   * 1. Studio dashboard — the entry point. Titles only; nothing to harvest.
   * ===================================================================== */
  await page.goto('/#/studio');
  await waitReady(page, 'studio_dashboard');
  await expect(page.locator('[data-testid="recent-title"]').first()).toBeVisible();

  /* =====================================================================
   * 2. Classification membership — Taxonomy manager, paginated roster.
   * ===================================================================== */
  await page.click('[data-testid="rail-taxonomy"]');
  await waitReady(page, 'taxonomy_tree');

  const termNames = (await page.locator('[data-testid="term-name"]').allTextContents()).map((t) => t.trim());
  expect(termNames).toContain(trunkBranch);

  await page.locator('tr', { has: page.locator(`[data-testid="term-name"]:text-is("${trunkBranch}")`) }).click();
  await waitReady(page, 'term_detail');
  await expect(page.locator('[data-testid="page-title"]')).toHaveText(trunkBranch);

  // The roster does not exceed one screen by accident: it must be paged through.
  const firstRosterPage = await page.locator('[data-testid="member-reference"]').allTextContents();
  const classifiedRefs = await collectAcrossPages(page, '[data-testid="member-reference"]', 'member-pager');
  expect(classifiedRefs.length).toBeGreaterThan(firstRosterPage.length);

  const classified = new Set(classifiedRefs);
  expect(classified.size).toBe(builds.filter((b) => b.branch === trunkBranch).length);
  classifiedRefs.forEach((ref) => expect(recordFor(ref).branch).toBe(trunkBranch));

  /* =====================================================================
   * 3. Workflow stage — Delivery Console, form-gated query, paginated result.
   * ===================================================================== */
  await page.click('[data-testid="rail-delivery"]');
  await waitReady(page, 'delivery_query');

  // Nothing is returned until a stage is composed.
  await expect(page.locator('[data-testid="result-empty"]')).toBeVisible();
  await expect(page.locator('[data-testid="result-area"]')).toHaveAttribute('data-query-state', 'empty');

  await page.selectOption('[data-testid="stage-select"]', failureStage);
  await page.click('[data-testid="run-query"]');
  await page.waitForSelector('[data-testid="result-area"][data-query-state="ready"]');
  await waitReady(page, 'delivery_query_result');

  const firstResultPage = await page.locator('[data-testid="result-reference"]').allTextContents();
  const stagedRefs = await collectAcrossPages(page, '[data-testid="result-reference"]', 'result-pager');
  expect(stagedRefs.length).toBeGreaterThan(firstResultPage.length);

  const staged = new Set(stagedRefs);
  expect(staged.size).toBe(builds.filter((b) => b.status === failureStage).length);
  stagedRefs.forEach((ref) => expect(recordFor(ref).status).toBe(failureStage));

  /* =====================================================================
   * 4. Intersect the two selections by hand — they live in two applications.
   * ===================================================================== */
  const qualifying = classifiedRefs.filter((ref) => staged.has(ref)).sort();
  const expectedQualifying = builds
    .filter((b) => b.branch === trunkBranch && b.status === failureStage)
    .map((b) => String(b.build_id));
  expect(qualifying.map((r) => r.replace(/\D+/g, '')).sort()).toEqual(expectedQualifying.sort());

  /* =====================================================================
   * 5. Runtime per qualifying entry — search, open, render the site preview.
   *    One walk per entry; the figure exists nowhere else.
   * ===================================================================== */
  const runtimes = new Map<string, number>();

  for (const reference of qualifying) {
    await page.goto('/#/studio/build-reports');
    await waitReady(page, 'collection_list');

    await page.fill('[data-testid="collection-search"]', reference);
    await page.click('[data-testid="collection-search-submit"]');
    await waitReady(page, 'collection_list_searched');

    const listBody = await page.locator('[data-testid="collection-table"]').innerText();
    const record = recordFor(reference);
    // The collection view is not allowed to carry the answer-critical columns.
    expect(listBody).not.toContain(String(record.duration_sec));
    expect(listBody).not.toContain(record.commit_sha);
    expect(listBody).not.toContain(record.status);
    expect(listBody).not.toContain(record.branch);

    await page.click(`[data-testid="row-${reference}"]`);
    await waitReady(page, 'entry_editor');

    // The editor holds the token, not the number, and only an abbreviated revision.
    const editorBody = await page.locator('[data-testid="field-body"]').inputValue();
    expect(editorBody).not.toContain(String(record.duration_sec));
    const chip = (await page.locator('[data-testid="source-chip"]').innerText()).trim();
    expect(record.commit_sha.startsWith(chip)).toBeTruthy();
    expect(chip.length).toBeLessThan(record.commit_sha.length);

    await page.click('[data-testid="preview-entry"]');
    await waitReady(page, 'entry_preview');

    const article = await page.locator('[data-testid="preview-article"]').innerText();
    const match = article.match(/Elapsed wall-clock for this run was\s+([\d,]+)\s+seconds/);
    expect(match, 'rendered preview carries the runtime sentence for ' + reference).not.toBeNull();
    const elapsed = Number(match![1].replace(/,/g, ''));

    expect(elapsed).toBe(record.duration_sec);
    runtimes.set(reference, elapsed);

    // The preview renders exactly this entry: no other qualifying runtime leaks in.
    for (const other of qualifying) {
      if (other === reference) continue;
      const otherRecord = recordFor(other);
      if (otherRecord.duration_sec === record.duration_sec) continue;
      expect(article).not.toContain(String(otherRecord.duration_sec));
    }

    await page.click('[data-testid="close-preview"]');
    await waitReady(page, 'entry_editor');
  }

  expect(runtimes.size).toBe(qualifying.length);

  /* =====================================================================
   * 6. Source commits — only now can the longest run be identified, and the
   *    full-length identifier only exists inside a per-entry publish bundle.
   * ===================================================================== */
  const shas = new Map<string, string>();

  for (const reference of qualifying) {
    await page.goto('/#/studio/build-reports');
    await waitReady(page, 'collection_list');
    await page.fill('[data-testid="collection-search"]', reference);
    await page.click('[data-testid="collection-search-submit"]');
    await waitReady(page, 'collection_list_searched');
    await page.click(`[data-testid="row-${reference}"]`);
    await waitReady(page, 'entry_editor');

    await page.click('[data-testid="entry-actions"]');
    await expect(page.locator('[data-testid="entry-menu"]')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="menu-export"]')
    ]);
    await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible();

    const target = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(target);
    const bundle = fs.readFileSync(target, 'utf8');

    const shaLine = bundle.match(/^source_commit:\s*(\S+)$/m);
    expect(shaLine, 'publish bundle carries the full-length source commit').not.toBeNull();
    const sha = shaLine![1];

    const record = recordFor(reference);
    expect(sha).toBe(record.commit_sha);
    expect(bundle).not.toContain(String(record.duration_sec));
    expect(bundle).not.toContain(record.branch);
    expect(bundle).not.toContain(record.status);
    shas.set(reference, sha);

    await page.click('[data-testid="export-dismiss"]');
    await expect(page.locator('[data-testid="export-dialog"]')).toHaveCount(0);
  }

  /* =====================================================================
   * 7. Reconstruct the answer from what was collected, and check it against
   *    the corpus computed independently.
   * ===================================================================== */
  const totalFailedDurationSec = qualifying.reduce((sum, ref) => sum + runtimes.get(ref)!, 0);
  const longestRef = qualifying.reduce((best, ref) =>
    runtimes.get(ref)! > runtimes.get(best)! ? ref : best
  );
  const longestFailureCommitSha = shas.get(longestRef)!;

  const expectedRecords = builds.filter((b) => b.branch === trunkBranch && b.status === failureStage);
  const expectedTotal = expectedRecords.reduce((sum, b) => sum + b.duration_sec, 0);
  const expectedLongest = expectedRecords.reduce((best, b) => (b.duration_sec > best.duration_sec ? b : best));

  expect(totalFailedDurationSec).toBe(expectedTotal);
  expect(longestFailureCommitSha).toBe(expectedLongest.commit_sha);

  const answer = {
    total_failed_duration_sec: totalFailedDurationSec,
    longest_failure_commit_sha: longestFailureCommitSha
  };
  fs.writeFileSync(path.join(ROOT, 'ground_truth_answer.json'), JSON.stringify(answer, null, 2) + '\n');
});

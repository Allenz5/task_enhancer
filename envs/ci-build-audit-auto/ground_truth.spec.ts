/**
 * Ground truth for the "ci-build-audit" environment.
 *
 * This spec plays a competent agent solving the task inside the Meridian suite.
 * Every fact it needs is earned through the modality fsm.json declares for it:
 *
 *   branch (classification) -> Taxonomy manager, term membership roster, paged
 *   status (workflow stage) -> Delivery Console, composed query, paged result set
 *   duration_sec (runtime)  -> Studio, per entry, rendered site preview only
 *   commit_sha (full)       -> Studio, per entry, downloaded publish bundle only
 *
 * NO DATA VALUE IS TYPED IN THIS FILE. The corpus is loaded from
 * server/data.json at runtime and every expectation is derived from it.
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = __dirname;
const DOWNLOADS = path.join(ROOT, 'downloads');

type Build = {
  build_id: number; branch: string; status: string; duration_sec: number;
  commit_sha: string; commit_message: string; triggered_by: string;
  started_at: string; runner: string; test_suite: string; queue_wait_sec: number;
};

const CORPUS: Build[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'data.json'), 'utf8'));
const FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'facts.json'), 'utf8'));

/* The task's two selection parameters — the classification term and the workflow
   stage it asks about — are read out of the corpus itself, never typed. */
const PARAM_RECORD: Build = CORPUS[FACTS.qualifying_records[0]];
const TARGET_TERM = PARAM_RECORD.branch;
const TARGET_STAGE = PARAM_RECORD.status;

/* Reference format used by the product to key an entry (a format, not a value). */
const referenceOf = (b: Build) => `BR-${b.build_id}`;
const byReference = new Map(CORPUS.map((b) => [referenceOf(b), b]));

const sorted = (xs: string[]) => [...xs].sort();
const allBranches = [...new Set(CORPUS.map((b) => b.branch))];
const allStatuses = [...new Set(CORPUS.map((b) => b.status))];
const allShas = CORPUS.map((b) => b.commit_sha);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const word = (s: string) => new RegExp(`(^|[^\\w/.-])${esc(s)}($|[^\\w/.-])`, 'i');
const numberWord = (n: number) => new RegExp(`(^|\\D)${n}($|\\D)`);

/**
 * A surface must not disclose values it is not allowed to carry — not in its
 * text, not in an attribute, and not in the JSON it fetched to render itself.
 */
async function surfaceText(page: Page): Promise<string> {
  const text = await page.locator('body').innerText();
  const attrs = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach((e) => {
      for (const a of Array.from(e.attributes)) {
        if (a.name !== 'class' && a.name !== 'style') out.push(a.value);
      }
    });
    return out.join('\n');
  });
  return `${text}\n${attrs}`;
}

function assertClean(haystack: string, opts: {
  branches?: boolean; statuses?: boolean; fullShas?: boolean; shortShas?: boolean;
  durations?: number[]; where: string;
}) {
  if (opts.branches) {
    for (const b of allBranches) {
      expect(haystack, `${opts.where} leaked classification term "${b}"`).not.toMatch(word(b));
    }
  }
  if (opts.statuses) {
    for (const s of allStatuses) {
      expect(haystack, `${opts.where} leaked workflow stage "${s}"`).not.toMatch(word(s));
    }
  }
  if (opts.fullShas) {
    for (const sha of allShas) {
      expect(haystack.toLowerCase(), `${opts.where} leaked a full commit identifier`).not.toContain(sha.toLowerCase());
    }
  }
  if (opts.shortShas) {
    for (const sha of allShas) {
      expect(haystack.toLowerCase(), `${opts.where} leaked an abbreviated commit identifier`)
        .not.toContain(sha.slice(0, 7).toLowerCase());
    }
  }
  for (const d of opts.durations || []) {
    expect(haystack, `${opts.where} leaked a runtime figure (${d})`).not.toMatch(numberWord(d));
  }
}

async function assertNoLeak(page: Page, opts: Parameters<typeof assertClean>[1]) {
  assertClean(await surfaceText(page), opts);
}

const readyOn = (page: Page) => page.waitForSelector('body[data-ready="1"]');

test.describe.configure({ mode: 'serial' });

test('an agent earns every answer-critical fact through the Meridian suite', async ({ page }) => {
  /* Every JSON the pages fetch is recorded, so each surface can be checked for
     leakage in the payload as well as in the DOM. */
  const wire: { url: string; body: string }[] = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/')) return;
    try { wire.push({ url: res.url(), body: await res.text() }); } catch { /* navigated away */ }
  });
  const wireFor = (frag: string, exclude: string[] = []) =>
    wire.filter((r) => r.url.includes(frag) && !exclude.some((x) => r.url.includes(x)))
      .map((r) => r.body).join('\n');

  fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOADS, { recursive: true });

  /* ---------------------------------------------------------------- *
   * 0. Studio dashboard — the landing surface carries no entry data.  *
   * ---------------------------------------------------------------- */
  await page.goto('/');
  await readyOn(page);
  await expect(page.getByTestId('recent-title').first()).toBeVisible();
  await assertNoLeak(page, {
    branches: true, statuses: true, fullShas: true, shortShas: true,
    durations: CORPUS.map((b) => b.duration_sec), where: 'Studio dashboard',
  });

  /* ---------------------------------------------------------------- *
   * 1. Classification membership — Taxonomy manager (paged roster).   *
   * ---------------------------------------------------------------- */
  await page.getByTestId('app-taxonomy').click();
  await readyOn(page);

  const termRows = page.getByTestId('term-row');
  await expect(termRows).toHaveCount(allBranches.length);

  const exactTerm = new RegExp(`^${esc(TARGET_TERM)}$`);
  const termRow = termRows.filter({ has: page.getByTestId('term-name').filter({ hasText: exactTerm }) }).first();
  const shownCount = Number(await termRow.getByTestId('term-count').innerText());
  expect(shownCount).toBe(CORPUS.filter((b) => b.branch === TARGET_TERM).length);

  await termRow.getByTestId('term-name').click();
  await readyOn(page);
  await expect(page.getByTestId('term-title')).toHaveText(TARGET_TERM);

  const membershipRefs: string[] = [];
  let rosterPages = 0;
  for (let guard = 0; guard < 20; guard++) {
    rosterPages += 1;
    const pageNo = await page.locator('body').getAttribute('data-term-page');
    for (const r of await page.getByTestId('member-row').all()) {
      membershipRefs.push((await r.getAttribute('data-ref'))!);
    }
    // The roster shows references and titles only.
    await assertNoLeak(page, {
      statuses: true, fullShas: true, shortShas: true,
      durations: CORPUS.map((b) => b.duration_sec), where: 'term membership roster',
    });
    const next = page.getByTestId('term-next');
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForSelector(`body[data-ready="1"]:not([data-term-page="${pageNo}"])`);
  }

  const expectedMembers = CORPUS.filter((b) => b.branch === TARGET_TERM).map(referenceOf);
  expect(sorted(membershipRefs)).toEqual(sorted(expectedMembers));
  expect(rosterPages, 'the roster was walked across more than one page').toBeGreaterThan(1);

  /* ---------------------------------------------------------------- *
   * 2. Workflow stage — Delivery Console, form-gated query.           *
   * ---------------------------------------------------------------- */
  await page.getByTestId('app-delivery').click();
  await readyOn(page);
  await expect(page.getByTestId('result-empty')).toBeVisible();
  await expect(page.getByTestId('run-query')).toBeDisabled();

  await page.getByTestId('stage-select').selectOption(TARGET_STAGE);
  await expect(page.getByTestId('run-query')).toBeEnabled();
  await page.getByTestId('run-query').click();
  await page.waitForSelector('body[data-ready="1"][data-query-page="0"]');

  const totalMatches = Number((await page.getByTestId('result-total').innerText()).replace(/\D+/g, ''));
  expect(totalMatches).toBe(CORPUS.filter((b) => b.status === TARGET_STAGE).length);

  const stageRefs: string[] = [];
  let resultPages = 0;
  for (let guard = 0; guard < 20; guard++) {
    resultPages += 1;
    const pageNo = await page.locator('body').getAttribute('data-query-page');
    for (const r of await page.getByTestId('result-row').all()) {
      stageRefs.push((await r.getAttribute('data-ref'))!);
    }
    // The read API projects public fields only.
    await assertNoLeak(page, {
      fullShas: true, shortShas: true,
      durations: CORPUS.map((b) => b.duration_sec), where: 'delivery result set',
    });
    const next = page.getByTestId('result-next');
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForSelector(`body[data-ready="1"]:not([data-query-page="${pageNo}"])`);
  }

  const expectedStage = CORPUS.filter((b) => b.status === TARGET_STAGE).map(referenceOf);
  expect(sorted(stageRefs)).toEqual(sorted(expectedStage));
  expect(resultPages, 'the result set was walked across more than one page').toBeGreaterThan(1);

  /* ---------------------------------------------------------------- *
   * 3. Intersect the two selections, by hand, across the two apps.    *
   * ---------------------------------------------------------------- */
  const stageSet = new Set(stageRefs);
  const qualifying = membershipRefs.filter((r) => stageSet.has(r));
  expect(sorted(qualifying)).toEqual(sorted(FACTS.qualifying_records.map((i: number) => referenceOf(CORPUS[i]))));

  /* ---------------------------------------------------------------- *
   * 4. Per qualifying entry: runtime from the preview, full commit    *
   *    identifier from the downloaded publish bundle.                 *
   * ---------------------------------------------------------------- */
  await page.getByTestId('app-studio').click();
  await readyOn(page);
  await page.getByTestId('open-collection').click();
  await readyOn(page);
  await assertNoLeak(page, {
    branches: true, statuses: true, fullShas: true, shortShas: true,
    durations: CORPUS.map((b) => b.duration_sec), where: 'collection list',
  });

  const collected: { reference: string; duration: number; sha: string }[] = [];

  for (const reference of qualifying) {
    // search-to-reach
    await page.getByTestId('collection-search').fill(reference);
    await page.getByTestId('search-submit').click();
    await page.waitForSelector(`body[data-ready="1"][data-query="${reference}"]`);
    await expect(page.getByTestId('entry-row')).toHaveCount(1);

    await page.getByTestId('entry-link').click();
    await page.waitForSelector(`body[data-ready="1"][data-entry="${reference}"]`);

    // The editor holds the runtime as an unresolved token and abbreviates the commit.
    await expect(page.getByTestId('entry-body')).toContainText('{{ build.duration_sec }}');
    const chip = (await page.getByTestId('source-chip').innerText()).trim();
    expect(chip.length).toBeLessThan(12);
    await assertNoLeak(page, {
      branches: true, statuses: true, fullShas: true,
      durations: [byReference.get(reference)!.duration_sec], where: `editor ${reference}`,
    });

    // preview-render-only: the token resolves only when the entry is rendered
    await page.getByTestId('btn-preview').click();
    await page.waitForSelector('body[data-preview="ready"]');
    const runtimeText = await page.getByTestId('preview-runtime').innerText();
    const match = runtimeText.match(/([\d,]+)\s*seconds/);
    expect(match, `no runtime sentence rendered for ${reference}`).not.toBeNull();
    const duration = Number(match![1].replace(/,/g, ''));

    // The preview still abbreviates the commit, and renders exactly one entry:
    // no other qualifying entry's runtime appears on it.
    await assertNoLeak(page, {
      branches: true, statuses: true, fullShas: true,
      durations: qualifying.filter((r) => r !== reference).map((r) => byReference.get(r)!.duration_sec),
      where: `preview ${reference}`,
    });

    await page.getByTestId('btn-close-preview').click();
    await page.waitForSelector('body[data-preview="closed"]');

    // file-export-download, modal-gated, one entry per bundle
    await page.getByTestId('entry-menu-trigger').click();
    await expect(page.getByTestId('entry-menu')).toBeVisible();
    await page.getByTestId('menu-export').click();
    await expect(page.getByTestId('export-modal')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-confirm').click(),
    ]);
    const file = path.join(DOWNLOADS, download.suggestedFilename());
    await download.saveAs(file);
    await page.waitForSelector('body[data-export="downloaded"]');
    await expect(page.getByTestId('export-done')).toBeVisible();

    const bundle = fs.readFileSync(file, 'utf8');
    const shaLine = bundle.match(/^source_commit:\s*(\S+)$/m);
    expect(shaLine, `bundle for ${reference} carries no full source commit`).not.toBeNull();
    const sha = shaLine![1];
    expect(sha.length).toBeGreaterThan(chip.length);

    // The bundle excludes derived metrics and relational data. (The commit lines
    // are set aside first: a 40-character hex string can spell any digit run.)
    const record = byReference.get(reference)!;
    const bundleProse = bundle.replace(/^source_commit(_short)?:.*$/gm, '');
    expect(bundleProse, 'bundle leaked the elapsed-seconds figure').not.toMatch(numberWord(record.duration_sec));
    expect(bundleProse, 'bundle leaked the classification term').not.toMatch(word(record.branch));
    expect(bundleProse, 'bundle leaked the workflow stage').not.toMatch(word(record.status));

    await page.getByTestId('export-dismiss').click();
    await page.waitForSelector('body[data-export="closed"]');

    collected.push({ reference, duration, sha });

    // back to the collection for the next reference
    await page.getByRole('link', { name: 'Build Reports' }).first().click();
    await readyOn(page);
  }

  /* ---------------------------------------------------------------- *
   * 5. Every acquired value is checked against the corpus.            *
   * ---------------------------------------------------------------- */
  for (const c of collected) {
    const record = byReference.get(c.reference)!;
    expect(record.branch).toBe(TARGET_TERM);
    expect(record.status).toBe(TARGET_STAGE);
    expect(c.duration).toBe(record.duration_sec);
    expect(c.sha).toBe(record.commit_sha);
  }
  expect(collected.length).toBe(FACTS.qualifying_records.length);

  /* ---------------------------------------------------------------- *
   * 5b. The payloads behind those surfaces are just as narrow.        *
   * ---------------------------------------------------------------- */
  const everyDuration = CORPUS.map((b) => b.duration_sec);
  assertClean(wireFor('/api/studio/dashboard'), {
    branches: true, statuses: true, fullShas: true, shortShas: true,
    durations: everyDuration, where: 'dashboard payload',
  });
  assertClean(wireFor('/api/studio/collection'), {
    branches: true, statuses: true, fullShas: true, shortShas: true,
    durations: everyDuration, where: 'collection payload',
  });
  assertClean(wireFor('/api/taxonomy/term/'), {
    statuses: true, fullShas: true, shortShas: true,
    durations: everyDuration, where: 'term membership payload',
  });
  assertClean(wireFor('/api/delivery/query'), {
    branches: true, fullShas: true, shortShas: true,
    durations: everyDuration, where: 'delivery query payload',
  });
  for (const c of collected) {
    assertClean(wireFor(`/api/studio/entry/${c.reference}`, ['/render', '/bundle']), {
      branches: true, statuses: true, fullShas: true,
      durations: [byReference.get(c.reference)!.duration_sec], where: `editor payload ${c.reference}`,
    });
    assertClean(wireFor(`/api/studio/entry/${c.reference}/render`), {
      branches: true, statuses: true, fullShas: true, where: `render payload ${c.reference}`,
    });
  }

  /* ---------------------------------------------------------------- *
   * 6. Reconstruct the task's answer from what was collected.         *
   * ---------------------------------------------------------------- */
  const total_failed_duration_sec = collected.reduce((sum, c) => sum + c.duration, 0);
  const longest = collected.reduce((a, b) => (b.duration > a.duration ? b : a));
  const answer = {
    total_failed_duration_sec,
    longest_failure_commit_sha: longest.sha,
  };

  const expectedRecords = CORPUS.filter((b) => b.branch === TARGET_TERM && b.status === TARGET_STAGE);
  expect(answer.total_failed_duration_sec)
    .toBe(expectedRecords.reduce((s, b) => s + b.duration_sec, 0));
  expect(answer.longest_failure_commit_sha)
    .toBe(expectedRecords.reduce((a, b) => (b.duration_sec > a.duration_sec ? b : a)).commit_sha);

  fs.writeFileSync(path.join(ROOT, 'ground_truth_answer.json'), JSON.stringify(answer, null, 2) + '\n');
});

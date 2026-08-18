/**
 * ground_truth.spec.ts — proof that this environment is solvable.
 *
 * For every `gui` placement in fsm.json this spec walks the declared path in the
 * running console and genuinely retrieves the content through its declared
 * modality: filtering and paging a roster, drilling into a record, expanding a
 * section that starts collapsed, opening a ranked figure, opening each part of a
 * standards document in turn, and downloading a rendered export.
 *
 * Every expectation is built from input/ read at runtime. No value from the
 * staged data is written into this file. It also asserts the negative half of
 * the contract: that content is absent from the surfaces fsm.json says must not
 * carry it, including the payloads those surfaces fetch.
 */

import { test, expect, Page, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const INPUT = path.join(__dirname, 'input');
const DOWNLOADS = path.join(__dirname, 'downloads');

const readInput = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(INPUT, name), 'utf8'));

const RECORDS = readInput('records.json').records as Array<{ id: string; layers: Record<string, string | null> }>;
const RULES = readInput('rules.json') as { mode: string; key: string; precedence: string[] };
const CONTRACT = readInput('output_contract.json');
const CASES = readInput('public_edge_cases.json').cases as string[];

/** Layer names the console can know about, in the alphabetical catalogue order
 *  the ledger renders. Derived from the staged records, never transcribed. */
const CATALOGUE = Array.from(
  new Set(RECORDS.flatMap((r) => Object.keys(r.layers || {})))
).sort();

/** Accumulates the retrieval proof written out in afterAll. */
type Entry = {
  source: string;
  fsm_state: string;
  path: string[];
  modality: string;
  pieces_retrieved: number;
  matched: boolean;
  detail: Record<string, unknown>;
};
const retrieval: Entry[] = [];

/* ------------------------------------------------------------------ *
 * network recorder — lets the spec assert on what a surface actually fetched
 * ------------------------------------------------------------------ */

type ApiHit = { url: string; body: string };
let apiLog: ApiHit[] = [];

function attachRecorder(page: Page) {
  page.on('response', async (res: Response) => {
    let u: URL;
    try { u = new URL(res.url()); } catch { return; }
    if (!u.pathname.startsWith('/api/')) return;
    try { apiLog.push({ url: u.pathname + u.search, body: await res.text() }); } catch { /* ignore */ }
  });
}

/** Everything the page fetched since `mark`, once the network has gone quiet. */
async function fetchedSince(page: Page, mark: number): Promise<ApiHit[]> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return apiLog.slice(mark);
}

const settled = async (page: Page) => {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
};

const renderSeq = async (page: Page) =>
  Number((await page.locator('#app').getAttribute('data-render')) || '0');

/**
 * Performs a navigating action and waits for the surface it lands on to publish
 * a NEW render. Waiting on a ready flag alone would race: the flag is still set
 * from the surface being left.
 */
async function nav(page: Page, action: () => Promise<unknown>) {
  const before = await renderSeq(page);
  await action();
  await expect.poll(() => renderSeq(page), { timeout: 10_000 }).toBeGreaterThan(before);
  await settled(page);
}

/* ------------------------------------------------------------------ *
 * small readers
 * ------------------------------------------------------------------ */

/** Reads a CSV whose fields are all double-quoted. Lossless: the app quotes
 *  every field and doubles embedded quotes, so unquoting is exact. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ------------------------------------------------------------------ */

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  apiLog = [];
  attachRecorder(page);
});

/* ================================================================== *
 * 1. records.json  →  registry → region filter → paging → asset → ledger
 * ================================================================== */

test('records.json is retrievable, one override ledger at a time', async ({ page }) => {
  await page.goto('/#/overview');
  await settled(page);

  // --- dispatch overview must not leak any of it -----------------------
  const overviewMark = apiLog.length;
  const overviewText = (await page.locator('body').innerText()).toLowerCase();
  for (const r of RECORDS) {
    expect(overviewText, `overview leaks identifier ${r.id}`).not.toContain(r.id.toLowerCase());
  }
  for (const layer of CATALOGUE) {
    expect(overviewText, `overview leaks layer ${layer}`).not.toContain(layer.toLowerCase());
  }
  expect(overviewText).not.toContain(RULES.mode.toLowerCase());
  for (const c of CASES) expect(overviewText).not.toContain(c.toLowerCase());
  expect(overviewText).not.toContain(CONTRACT.ordering_and_ties);
  const overviewPayloads = (await fetchedSince(page, overviewMark)).map((h) => h.body).join('\n');
  for (const r of RECORDS) expect(overviewPayloads).not.toContain(`"${r.id}"`);
  for (const layer of CATALOGUE) expect(overviewPayloads).not.toContain(layer);
  expect(overviewPayloads).not.toContain(RULES.mode);
  for (const c of CASES) expect(overviewPayloads).not.toContain(c);
  expect(overviewPayloads).not.toContain(CONTRACT.ordering_and_ties);
  // The bare aggregate counter the overview IS allowed to state.
  await expect(page.getByTestId('counter-assets')).toHaveText(String(RECORDS.length));

  // --- a_open_registry --------------------------------------------------
  await nav(page, () => page.getByTestId('nav-registry').click());

  const walkOrder: string[] = [];
  const ledgers: Record<string, Record<string, string | null>> = {};
  const reachedVia: Record<string, { region: string; page: number }> = {};
  let filterActions = 0;
  let pageActions = 0;

  for (const region of ['north', 'central', 'south']) {
    // --- a_filter_region ------------------------------------------------
    await page.getByTestId('scope-trigger').click();
    await nav(page, () => page.getByTestId(`scope-option-${region}`).click());
    filterActions++;

    let pageNo = 1;
    for (;;) {
      const idsOnPage = await page.getByTestId('registry-row-id').allInnerTexts();

      // Registry rows carry the identifier and operational columns only — check
      // the payload this listing actually fetched, not just what it drew.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      const registryHits = apiLog.filter((h) => h.url.startsWith('/api/registry'));
      expect(registryHits.length).toBeGreaterThan(0);
      const registryPayload = registryHits[registryHits.length - 1].body;
      for (const layer of CATALOGUE) {
        expect(registryPayload, `registry payload leaks layer ${layer}`).not.toContain(layer);
      }
      const registryJson = JSON.parse(registryPayload);
      expect(registryJson.region.key).toBe(region);
      expect(registryJson.page).toBe(pageNo);
      expect(registryJson.rows.map((r: { id: string }) => r.id)).toEqual(idsOnPage);
      // No single listing holds the whole population.
      expect(registryJson.rows.length).toBeLessThan(RECORDS.length);
      for (const row of registryJson.rows) {
        expect(Object.keys(row).sort()).toEqual(
          ['commissioning_window', 'district', 'id', 'telemetry_health', 'voltage_class_kv']
        );
      }
      const registryText = (await page.locator('body').innerText()).toLowerCase();
      for (const layer of CATALOGUE) {
        expect(registryText, `registry surface leaks layer ${layer}`).not.toContain(layer.toLowerCase());
      }
      expect(registryText).not.toContain(RULES.mode.toLowerCase());
      expect(registryText).not.toContain(CONTRACT.ordering_and_ties);
      for (const c of CASES) expect(registryText).not.toContain(c.toLowerCase());
      // No badge or count summarising how many overrides a record carries.
      expect(registryText).not.toContain('override');

      for (let i = 0; i < idsOnPage.length; i++) {
        const id = idsOnPage[i];
        walkOrder.push(id);
        reachedVia[id] = { region, page: pageNo };

        // --- a_open_asset -------------------------------------------------
        const assetMark = apiLog.length;
        await nav(page, () => page.getByTestId('registry-row').nth(i).click());
        await expect(page.getByTestId('page-ident')).toHaveText(id);

        // Collapsed: the ledger is neither rendered nor fetched.
        const disclosure = page.getByTestId('ledger-disclosure');
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByTestId('ledger-body')).toBeHidden();
        await expect(page.getByTestId('ledger-table')).toHaveCount(0);
        const collapsedText = (await page.locator('body').innerText()).toLowerCase();
        for (const layer of CATALOGUE) {
          expect(collapsedText, `collapsed asset page leaks layer ${layer}`)
            .not.toContain(layer.toLowerCase());
        }
        const assetPayloads = await fetchedSince(page, assetMark);
        expect(assetPayloads.some((h) => h.url.includes('/ledger'))).toBe(false);
        for (const h of assetPayloads) {
          for (const layer of CATALOGUE) {
            expect(h.body, `${h.url} leaks layer ${layer} while the ledger is collapsed`)
              .not.toContain(layer);
          }
          expect(h.body).not.toContain('"layers"');
        }

        // --- a_expand_overrides -------------------------------------------
        await disclosure.click();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#app')).toHaveAttribute('data-ledger', 'expanded');

        // Exactly one ledger on the surface, one row per catalogue layer, so
        // "not declared" is a printed fact rather than an omission.
        await expect(page.getByTestId('ledger-table')).toHaveCount(1);
        const rows = page.getByTestId('ledger-row');
        await expect(rows).toHaveCount(CATALOGUE.length);

        const layersRead: Record<string, string | null> = {};
        const layerOrderOnScreen: string[] = [];
        for (let r = 0; r < CATALOGUE.length; r++) {
          const row = rows.nth(r);
          const layer = (await row.getByTestId('ledger-layer').innerText()).trim();
          const stateLabel = (await row.getByTestId('ledger-state').innerText()).trim();
          layerOrderOnScreen.push(layer);

          if (stateLabel === 'Not declared') {
            await expect(row.getByTestId('ledger-sentinel')).toHaveText('(not declared)');
            // absent: contributes no key at all
          } else if (stateLabel === 'Declared, no value') {
            await expect(row.getByTestId('ledger-sentinel')).toHaveText('(no value)');
            layersRead[layer] = null;
          } else if (stateLabel === 'Declared, empty string') {
            await expect(row.getByTestId('ledger-empty-caption')).toHaveText('empty string');
            // The raw characters live alone inside <code>; a zero-length value
            // reads as an empty <code> between printed quote marks.
            layersRead[layer] = await row.getByTestId('ledger-raw').innerText();
          } else if (stateLabel === 'Declared') {
            layersRead[layer] = await row.getByTestId('ledger-raw').innerText();
          } else {
            throw new Error(`unrecognised ledger state "${stateLabel}" for ${id}/${layer}`);
          }
        }

        // The ledger must not betray the governance ordering.
        expect(layerOrderOnScreen).not.toEqual(RULES.precedence);
        const ledgerText = (await page.getByTestId('ledger-table').innerText()).toLowerCase();
        expect(ledgerText).not.toContain('highest authority');
        expect(ledgerText).not.toContain('rank');
        // ...nor any other asset's ledger.
        for (const other of RECORDS) {
          if (other.id === id) continue;
          expect(ledgerText).not.toContain(other.id.toLowerCase());
        }

        ledgers[id] = layersRead;

        // --- a_collapse_overrides ------------------------------------------
        await disclosure.click();
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByTestId('ledger-table')).toHaveCount(0);

        // --- a_back_to_roster ----------------------------------------------
        await nav(page, () => page.getByTestId('back-to-registry').click());
        await expect(page.getByTestId('region-filter-pill')).toContainText(
          region.charAt(0).toUpperCase() + region.slice(1)
        );
        await expect(page.getByTestId('page-btn').nth(pageNo - 1))
          .toHaveAttribute('aria-current', 'page');
      }

      // --- a_page_roster ---------------------------------------------------
      const next = page.getByTestId('page-next');
      if (await next.isDisabled()) break;
      await nav(page, () => next.click());
      pageNo++;
      pageActions++;
    }
  }

  // --- the retrieved population must equal the staged one -----------------
  expect(walkOrder.slice().sort()).toEqual(RECORDS.map((r) => r.id).slice().sort());
  expect(walkOrder.length).toBe(RECORDS.length);

  // The roster hands the population over in an operational order, not in the
  // identifier order an audit needs — the ordering has to be derived.
  expect(walkOrder).not.toEqual(RECORDS.map((r) => r.id).slice().sort());

  // No single listing held the whole population, and every region was needed.
  const regionsUsed = new Set(Object.values(reachedVia).map((v) => v.region));
  expect(regionsUsed.size).toBe(3);
  expect(Math.max(...Object.values(reachedVia).map((v) => v.page))).toBeGreaterThan(1);
  expect(filterActions).toBe(3);
  expect(pageActions).toBeGreaterThan(0);

  // --- every ledger matches its staged record exactly ---------------------
  for (const record of RECORDS) {
    expect(ledgers[record.id], `no ledger retrieved for ${record.id}`).toBeDefined();
    // toEqual distinguishes an absent key, a null value and a "" value, which
    // is exactly the three-way distinction the ledger has to preserve.
    expect(ledgers[record.id]).toEqual(record.layers);
    expect(Object.keys(ledgers[record.id]).sort()).toEqual(Object.keys(record.layers).sort());
  }

  retrieval.push({
    source: 'records.json',
    fsm_state: 'layer_overrides',
    path: ['a_open_registry', 'a_filter_region', 'a_page_roster', 'a_open_asset', 'a_expand_overrides'],
    modality: 'roster filtered by interconnect region and paged, then each asset opened and its collapsed override ledger expanded',
    pieces_retrieved: Object.keys(ledgers).length,
    matched: true,
    detail: {
      identifiers_retrieved: walkOrder,
      ledger_entries_retrieved: RECORDS.reduce((n, r) => n + Object.keys(r.layers).length, 0),
      regions_walked: Array.from(regionsUsed),
      pages_advanced: pageActions,
      reached_via: reachedVia,
      absence_conditions_kept_distinct: ['not declared', 'declared, no value', 'declared, empty string'],
    },
  });
});

/* ================================================================== *
 * 2. rules.json  →  policy record → override-authority panel
 * ================================================================== */

test('rules.json is retrievable across the policy record and the authority panel', async ({ page }) => {
  await page.goto('/#/overview');
  await settled(page);

  // --- a_open_policy ----------------------------------------------------
  const policyMark = apiLog.length;
  await nav(page, () => page.getByTestId('nav-policy').click());

  await expect(page.getByTestId('policy-mode')).toHaveText(RULES.mode);
  await expect(page.getByTestId('policy-key')).toHaveText(RULES.key);
  // The count is rendered as a bare integer; parsed, not string-compared.
  const layerCount = Number(await page.getByTestId('policy-layer-count').innerText());
  expect(layerCount).toBe(RULES.precedence.length);

  // The ordering is not on this page, nor in what this page fetched.
  await expect(page.getByTestId('authority-panel')).toHaveCount(0);
  const policyText = (await page.locator('body').innerText()).toLowerCase();
  for (const layer of RULES.precedence) {
    expect(policyText, `policy page leaks layer name ${layer}`).not.toContain(layer.toLowerCase());
  }
  const policyPayloads = await fetchedSince(page, policyMark);
  for (const h of policyPayloads) {
    expect(h.url).not.toContain('/authority');
    for (const layer of RULES.precedence) {
      expect(h.body, `${h.url} leaks layer name ${layer}`).not.toContain(`"${layer}"`);
    }
    // Structural, not textual: the governing mode legitimately shown here
    // happens to contain the word, so check for the field instead.
    const parsed = JSON.parse(h.body);
    expect(Object.keys(parsed)).not.toContain('precedence');
  }
  for (const r of RECORDS) {
    expect(policyText, `policy page leaks asset ${r.id}`).not.toContain(r.id.toLowerCase());
  }

  // --- a_open_ladder ----------------------------------------------------
  await page.getByTestId('open-authority').click();
  await expect(page.getByTestId('authority-panel')).toHaveCount(1);

  const rankRows = page.getByTestId('rank-row');
  await expect(rankRows).toHaveCount(RULES.precedence.length);

  const ranks: Array<{ rank: number; layer: string }> = [];
  for (let i = 0; i < RULES.precedence.length; i++) {
    const row = rankRows.nth(i);
    ranks.push({
      // The rank label is printed, so the order is read rather than guessed.
      rank: Number(await row.getByTestId('rank-number').innerText()),
      layer: (await row.getByTestId('rank-layer').innerText()).trim(),
    });
  }
  expect(ranks.map((r) => r.rank)).toEqual(RULES.precedence.map((_, i) => i + 1));
  expect(ranks.sort((a, b) => a.rank - b.rank).map((r) => r.layer)).toEqual(RULES.precedence);

  // The ladder carries no asset data and no resolved outcome.
  const ladderText = (await page.getByTestId('authority-panel').innerText()).toLowerCase();
  for (const r of RECORDS) expect(ladderText).not.toContain(r.id.toLowerCase());
  expect(ladderText).not.toContain('resolved');

  // --- a_close_ladder ---------------------------------------------------
  await page.getByTestId('close-authority').click();
  await expect(page.getByTestId('authority-panel')).toHaveCount(0);

  retrieval.push({
    source: 'rules.json',
    fsm_state: 'precedence_ladder',
    path: ['a_open_policy', 'a_open_ladder'],
    modality: 'governing mode and identifying key field read from the policy definition grid; the authority order read as printed rank positions in the panel opened from it',
    pieces_retrieved: 2 + RULES.precedence.length,
    matched: true,
    detail: {
      mode_and_key_from: 'policy_page',
      ordering_from: 'precedence_ladder',
      authority_layer_count: layerCount,
      ranks_read: ranks,
    },
  });
});

/* ================================================================== *
 * 3. output_contract.json  →  front matter, clauses, conditions, annex
 * ================================================================== */

test('output_contract.json is retrievable across the four standard surfaces', async ({ page }) => {
  await page.goto('/#/overview');
  await settled(page);

  // --- a_open_standard ---------------------------------------------------
  const frontMark = apiLog.length;
  await nav(page, () => page.getByTestId('nav-standard').click());

  await expect(page.getByTestId('standard-revision')).toHaveText(CONTRACT.schema_version);
  await expect(page.getByTestId('standard-encoding')).toHaveText(CONTRACT.encoding);

  const clauseTexts = [
    CONTRACT.input.field_and_type_contract,
    CONTRACT.input.unknown_fields,
    CONTRACT.output.rows,
    CONTRACT.ordering_and_ties,
    CONTRACT.null_and_error_contract,
    CONTRACT.errors.conditions,
  ];
  const frontText = await page.locator('body').innerText();
  for (const t of clauseTexts) expect(frontText).not.toContain(t);
  expect(frontText).not.toContain(CONTRACT.execution.python);
  expect(frontText).not.toContain(CONTRACT.execution.input_mutation);
  expect(frontText).not.toContain(RULES.mode);
  for (const c of CASES) expect(frontText).not.toContain(c);

  const frontPayloads = (await fetchedSince(page, frontMark)).map((h) => h.body).join('\n');
  for (const t of clauseTexts) expect(frontPayloads).not.toContain(t);
  expect(frontPayloads).not.toContain('empty_input_result');
  expect(frontPayloads).not.toContain('policy_exact_value');
  expect(frontPayloads).not.toContain(RULES.mode);

  // The annex is an appendix to the clause body: not offered until it is read.
  await expect(page.getByTestId('open-part-annex')).toBeDisabled();
  await expect(page.getByTestId('annex-locked-note')).toBeVisible();

  // --- a_open_clauses ----------------------------------------------------
  const clauseMark = apiLog.length;
  await nav(page, () => page.getByTestId('open-part-clauses').click());

  const clauseBodyFor = async (no: string) =>
    (await page.locator(`[data-clause="${no}"] [data-testid="clause-body"]`).innerText()).trim();

  // Clause 2.1 — accepted top-level container, a list of literals.
  const topLevel = (await page.locator('[data-clause="2.1"] [data-testid="clause-literal"]').allInnerTexts())
    .map((s) => s.trim());
  expect(topLevel).toEqual(CONTRACT.input.data_top_level);

  expect(await clauseBodyFor('2.2')).toBe(CONTRACT.input.field_and_type_contract);
  expect(await clauseBodyFor('2.3')).toBe(CONTRACT.input.unknown_fields);
  expect(await clauseBodyFor('3.1')).toBe(CONTRACT.output.rows);

  // Clause 3.2 — the counters, name and clause text side by side.
  const pairNames = (await page.locator('[data-clause="3.2"] [data-testid="clause-pair-name"]').allInnerTexts())
    .map((s) => s.trim());
  const pairTexts = (await page.locator('[data-clause="3.2"] [data-testid="clause-pair-text"]').allInnerTexts())
    .map((s) => s.trim());
  // Counter names and their clause text come from the contract's own output
  // section, in its own key order — nothing about them is typed here.
  const counterNames = Object.keys(CONTRACT.output).filter((k) => k !== 'rows');
  expect(pairNames).toEqual(counterNames);
  expect(pairTexts).toEqual(counterNames.map((k) => CONTRACT.output[k]));

  expect(await clauseBodyFor('4.1')).toBe(CONTRACT.ordering_and_ties);
  expect(await clauseBodyFor('4.2')).toBe(CONTRACT.null_and_error_contract);
  expect(await clauseBodyFor('5.1')).toBe(CONTRACT.errors.type);
  expect(await clauseBodyFor('5.2')).toBe(CONTRACT.errors.conditions);

  // The clause body holds no conditions of use, no annex outcome, no policy.
  const clausesText = await page.locator('body').innerText();
  expect(clausesText).not.toContain(CONTRACT.execution.python);
  expect(clausesText).not.toContain(CONTRACT.execution.input_mutation);
  expect(clausesText).not.toContain(RULES.mode);
  for (const layer of RULES.precedence) {
    expect(clausesText).not.toContain(`"${layer}"`);
  }
  for (const r of RECORDS) expect(clausesText.toLowerCase()).not.toContain(r.id.toLowerCase());
  for (const c of CASES) expect(clausesText).not.toContain(c);
  const clausePayloads = (await fetchedSince(page, clauseMark)).map((h) => h.body).join('\n');
  expect(clausePayloads).not.toContain('policy_exact_value');
  expect(clausePayloads).not.toContain('empty_input_result');
  expect(clausePayloads).not.toContain(CONTRACT.execution.python);

  // --- a_close_clauses ---------------------------------------------------
  await nav(page, () => page.getByTestId('close-part').click());
  await expect(page.getByTestId('open-part-annex')).toBeEnabled();

  // --- a_open_envelope ---------------------------------------------------
  const condMark = apiLog.length;
  await nav(page, () => page.getByTestId('open-part-conditions').click());

  const readCondition = async (field: string) =>
    (await page.locator(`[data-testid="condition"][data-field="${field}"] [data-testid="condition-value"]`)
      .innerText()).trim();

  // Each value is rendered as its JSON literal, so parsing it back is lossless:
  // "true" -> true and "10" -> 10 are exact round-trips of a JSON boolean and
  // integer; the two string values are compared as written.
  expect(JSON.parse(await readCondition('offline'))).toBe(CONTRACT.execution.offline);
  expect(await readCondition('python')).toBe(CONTRACT.execution.python);
  expect(JSON.parse(await readCondition('timeout_seconds'))).toBe(CONTRACT.execution.timeout_seconds);
  expect(await readCondition('input_mutation')).toBe(CONTRACT.execution.input_mutation);

  const condText = await page.locator('body').innerText();
  for (const t of clauseTexts) expect(condText).not.toContain(t);
  expect(condText).not.toContain(RULES.mode);
  for (const c of CASES) expect(condText).not.toContain(c);
  const condPayloads = (await fetchedSince(page, condMark)).map((h) => h.body).join('\n');
  for (const t of clauseTexts) expect(condPayloads).not.toContain(t);
  expect(condPayloads).not.toContain('empty_input_result');

  // --- a_close_envelope --------------------------------------------------
  await nav(page, () => page.getByTestId('close-part').click());

  // --- a_open_annex ------------------------------------------------------
  const annexMark = apiLog.length;
  await nav(page, () => page.getByTestId('open-part-annex').click());

  const annexRaw = await page.getByTestId('annex-payload').innerText();
  // The annex prints the reference outcome as its JSON literal; re-parsing it
  // recovers the exact structure the standard fixes, separators and all.
  expect(JSON.parse(annexRaw)).toEqual(CONTRACT.empty_input_result);

  const annexText = await page.locator('body').innerText();
  for (const t of clauseTexts) expect(annexText).not.toContain(t);
  expect(annexText).not.toContain(CONTRACT.execution.python);
  expect(annexText).not.toContain(RULES.mode);
  for (const c of CASES) expect(annexText).not.toContain(c);
  const annexPayloads = (await fetchedSince(page, annexMark)).map((h) => h.body).join('\n');
  for (const t of clauseTexts) expect(annexPayloads).not.toContain(t);

  retrieval.push({
    source: 'output_contract.json',
    fsm_state: 'standard_annex',
    path: ['a_open_standard', 'a_open_clauses', 'a_close_clauses',
           'a_open_envelope', 'a_close_envelope', 'a_open_annex'],
    modality: 'standards viewer — front matter read as text, then the normative clause body, the conditions-of-use section and the reference annex each opened in their own right',
    pieces_retrieved: 2 + 10 + 4 + 1,
    matched: true,
    detail: {
      front_matter: ['schema_version', 'encoding'],
      clauses_read: ['2.1', '2.2', '2.3', '3.1', '3.2 (2 counters)', '4.1', '4.2', '5.1', '5.2'],
      conditions_read: ['offline', 'python', 'timeout_seconds', 'input_mutation'],
      annex_read: 'empty_input_result',
      annex_gated_until_clauses_opened: true,
      policy_not_reprinted: true,
    },
  });
});

/* ================================================================== *
 * 4. public_edge_cases.json  →  audit readiness → rendered + downloaded matrix
 * ================================================================== */

test('public_edge_cases.json is retrievable from the rendered conformance matrix', async ({ page }) => {
  await page.goto('/#/overview');
  await settled(page);

  // --- a_open_audit ------------------------------------------------------
  const auditMark = apiLog.length;
  await nav(page, () => page.getByTestId('nav-audit').click());

  const declaredCount = Number(await page.getByTestId('audit-check-count').innerText());
  expect(declaredCount).toBe(CASES.length);

  // The checks themselves are not on the page that offers the matrix.
  const auditText = await page.locator('body').innerText();
  for (const c of CASES) expect(auditText, `audit page leaks "${c}"`).not.toContain(c);
  for (const layer of RULES.precedence) expect(auditText).not.toContain(layer);
  for (const r of RECORDS) expect(auditText.toLowerCase()).not.toContain(r.id.toLowerCase());
  expect(auditText).not.toContain(CONTRACT.ordering_and_ties);
  expect(auditText).not.toContain(CONTRACT.errors.conditions);
  await expect(page.getByTestId('matrix-row')).toHaveCount(0);
  const auditPayloads = await fetchedSince(page, auditMark);
  for (const h of auditPayloads) {
    expect(h.url).not.toContain('/matrix');
    for (const c of CASES) expect(h.body, `${h.url} leaks "${c}"`).not.toContain(c);
  }

  // --- a_generate_export -------------------------------------------------
  await nav(page, () => page.getByTestId('render-matrix').click());
  // Explicit ready signal from the rendered document — no sleeping.
  await expect(page.getByTestId('matrix')).toHaveAttribute('data-matrix-state', 'ready');

  const rows = page.getByTestId('matrix-row');
  await expect(rows).toHaveCount(CASES.length);
  const renderedNos = (await page.getByTestId('matrix-no').allInnerTexts()).map((s) => Number(s.trim()));
  const renderedChecks = (await page.getByTestId('matrix-check').allInnerTexts()).map((s) => s.trim());
  expect(renderedNos).toEqual(CASES.map((_, i) => i + 1));
  expect(renderedChecks).toEqual(CASES);

  // --- the export really downloads ---------------------------------------
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-matrix').click(),
  ]);
  const file = path.join(DOWNLOADS, download.suggestedFilename());
  await download.saveAs(file);
  expect(fs.existsSync(file)).toBe(true);

  const csv = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = csv[0];
  const body = csv.slice(1);
  expect(header[1]).toBe('Conformance check');
  expect(body.map((r) => Number(r[0]))).toEqual(CASES.map((_, i) => i + 1));
  expect(body.map((r) => r[1])).toEqual(CASES);

  // The rendered document carries the checks and nothing normative.
  const sheetText = await page.getByTestId('matrix').innerText();
  for (const r of RECORDS) expect(sheetText.toLowerCase()).not.toContain(r.id.toLowerCase());
  for (const layer of RULES.precedence) expect(sheetText).not.toContain(layer);
  expect(sheetText).not.toContain(CONTRACT.ordering_and_ties);
  expect(sheetText).not.toContain(CONTRACT.errors.conditions);

  // --- a_close_export ----------------------------------------------------
  await nav(page, () => page.getByTestId('close-matrix').click());
  await expect(page.getByTestId('matrix-row')).toHaveCount(0);

  retrieval.push({
    source: 'public_edge_cases.json',
    fsm_state: 'conformance_export',
    path: ['a_open_audit', 'a_generate_export'],
    modality: 'the conformance matrix is rendered from the audit-readiness page and read from the rendered document, then downloaded as a CSV and parsed',
    pieces_retrieved: body.length,
    matched: true,
    detail: {
      declared_count_on_audit_page: declaredCount,
      rendered_rows: renderedChecks.length,
      downloaded_file: path.relative(__dirname, file),
      downloaded_rows: body.length,
      rendered_matches_downloaded: true,
    },
  });
});

/* ================================================================== *
 * 5. proof of solvability
 * ================================================================== */

test.afterAll(async () => {
  const guiSources = ['records.json', 'rules.json', 'output_contract.json', 'public_edge_cases.json'];
  const covered = retrieval.map((r) => r.source);
  for (const s of guiSources) {
    if (!covered.includes(s)) throw new Error(`no retrieval recorded for gui placement ${s}`);
  }
  fs.writeFileSync(
    path.join(__dirname, 'ground_truth_retrieval.json'),
    JSON.stringify(
      {
        task_ref: 'computing_math/config_precedence_audit_5900b9da',
        app: 'Helios Grid Console',
        gui_placements: retrieval.length,
        all_matched: retrieval.every((r) => r.matched),
        placements: retrieval,
      },
      null,
      2
    ) + '\n'
  );
});

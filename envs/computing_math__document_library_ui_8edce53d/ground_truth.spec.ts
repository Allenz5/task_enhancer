/*
 * ground_truth.spec.ts — proof that everything fsm.json places in the
 * interface can be retrieved from it, unchanged.
 *
 * Rules this file obeys:
 *   - No data value is ever typed here. Every expectation is read from
 *     ./input at runtime; the app serves from the same directory.
 *   - Each placement is walked through its declared modality: the listing is
 *     paged, each properties surface is opened and closed in turn, overlays
 *     are opened from the controls that own them, the sample call is really
 *     executed, and the checklist is really advanced page by page.
 *   - Each surface is also checked for what fsm.json says it must NOT carry,
 *     in its rendered text and in the JSON it fetches.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const INPUT = path.join(__dirname, 'input');
const readInput = (f: string) => JSON.parse(fs.readFileSync(path.join(INPUT, f), 'utf8'));

const RECORDS = readInput('records.json').records as any[];
const RULES = readInput('rules.json') as any;
const CONTRACT = readInput('output_contract.json') as any;
const EDGE = readInput('public_edge_cases.json') as any;

/* ---------- retrieval ledger ---------- */
type Placement = {
  source: string;
  path: string[];
  pieces_retrieved: number;
  matched: boolean;
  state: string;
  modality_note: string;
};
const LEDGER: Placement[] = [];
const record = (p: Placement) => LEDGER.push(p);

/* ---------- small helpers ---------- */
const NBSP = / /g;
const flat = (s: string) => s.replace(NBSP, ' ');

const ready = (page: Page, surface: string) =>
  page.waitForSelector(`#canvas[data-surface="${surface}"]`, { state: 'attached' });

const txt = async (page: Page, sel: string) =>
  ((await page.locator(sel).first().textContent()) || '').trim();
const txts = async (page: Page, sel: string) =>
  (await page.locator(sel).allTextContents()).map((s) => s.trim());

const bodyText = async (page: Page) => flat(await page.locator('body').innerText());

/** Every key name that occurs anywhere in a JSON payload. */
function keysDeep(v: any, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  return out;
}

/** Word-boundary containment, so "Enter" does not match "Enterprise". */
const hasWord = (haystack: string, needle: string) =>
  new RegExp(`(?<![\\w-])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(haystack);

function refuse(where: string, haystack: string, tokens: string[], mode: 'substring' | 'word' = 'substring') {
  for (const t of tokens) {
    const present = mode === 'word' ? hasWord(haystack, t) : haystack.includes(t);
    expect(present, `${where} must not reveal ${JSON.stringify(t)}`).toBe(false);
  }
}

async function payload(request: APIRequestContext, url: string) {
  const r = await request.get(url);
  expect(r.ok(), `${url} should serve`).toBe(true);
  return { text: await r.text(), json: await r.json() };
}

/* ---------- forbidden-token vocabularies, all derived from input ---------- */
const MIMES: string[] = RULES.allowed_mimes;
const STATES: string[] = RULES.upload_states;
const HINTS: string[] = CONTRACT.output_contract.properties.upload_hint.enum;
const NB = CONTRACT.normative_behavior;
const SUBMIT_EVENT = CONTRACT.empty_input_result.submit_event;
const BREAKPOINT = String(CONTRACT.empty_input_result.layout.narrow_breakpoint);

/**
 * Every human-readable size rendering the stored data could produce, derived
 * from input (the byte counts plus the configured unit base). Never typed,
 * and used only to prove such text is absent where it must be.
 */
function sizeRenderings(): string[] {
  const unit = RULES.bytes_per_unit;
  const out: string[] = [NB.size_text.null];
  for (const r of RECORDS) {
    if (r.bytes === null) continue;
    out.push(`${r.bytes} B`);
    for (const [u, suffix] of [
      [unit, 'KB'],
      [unit * unit, 'MB'],
    ] as [number, string][]) {
      const tenths = Math.floor((r.bytes * 10 + u / 2) / u);
      if (tenths > 0) out.push(`${(tenths / 10).toFixed(1)} ${suffix}`);
    }
  }
  return Array.from(new Set(out));
}
const SIZE_TEXTS = sizeRenderings();
const NONZERO_BYTES = RECORDS.filter((r) => typeof r.bytes === 'number' && r.bytes !== 0).map((r) =>
  String(r.bytes)
);

/** Contract order for the row list: name then document_id, code-point ascending. */
const contractOrder = (rs: any[]) =>
  [...rs].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.document_id < b.document_id ? -1 : 1
  );

/* ---------- values carried between placements ---------- */
let RETRIEVED_WIDTHS: number[] = [];
let RETRIEVED_SUBMIT_KEY = '';
let RETRIEVED_EMPTY_RESULT: any = null;

const POINTER = /^«see .+»$/;

/* ================================================================== *
 * 0. library_home — chrome only
 * ================================================================== */
test('library_home reveals nothing but workspace chrome', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  const body = await bodyText(page);

  refuse('library_home', body, RECORDS.map((r) => r.document_id));
  refuse('library_home', body, RECORDS.map((r) => r.name));
  refuse('library_home', body, RECORDS.map((r) => r.label), 'word');
  refuse('library_home', body, [...MIMES, ...STATES, ...HINTS, ...SIZE_TEXTS, ...NONZERO_BYTES]);
  refuse('library_home', body, [RULES.mode, RULES.key, RULES.keyboard_submit_key], 'word');
  refuse('library_home', body, RULES.viewport_widths.map(String), 'word');
  refuse('library_home', body, [CONTRACT.schema_version, CONTRACT.errors.exception, EDGE.schema_version]);
  refuse('library_home', body, EDGE.cases.map((c: any) => c.id), 'word');

  const home = await payload(request, '/api/home');
  const keys = keysDeep(home.json);
  for (const k of ['bytes', 'mime', 'upload_state', 'selected', 'page_size', 'allowed_mimes', 'upload_states'])
    expect(keys.has(k), `/api/home payload must not carry ${k}`).toBe(false);
});

/* ================================================================== *
 * 1. records.json#/records/[*]/document_id+name+label -> document_grid
 *    a_open_documents, a_page_grid
 * ================================================================== */
test('document identity is enumerated by paging the shared library listing', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');

  // a_open_documents
  await page.click('#rail a[href="/documents"]');
  await ready(page, 'document_grid');

  const pageCount = Number((await txt(page, '[data-testid="grid-page"]')).match(/of (\d+)/)![1]);
  expect(pageCount, 'the population must not fit on one page').toBeGreaterThan(1);

  const walked = ['a_open_documents'];
  const collected: { document_id: string; name: string; label: string }[] = [];
  const orderSeen: string[] = [];

  for (let p = 1; ; p++) {
    const rows = page.locator('[data-testid="documents-grid"] tbody tr[data-doc-id]');
    const n = await rows.count();
    expect(n, 'each page holds at most the configured rows-per-page').toBeLessThanOrEqual(RULES.page_size);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const id = (await row.getAttribute('data-doc-id'))!;
      collected.push({
        document_id: id,
        name: (await row.locator('[data-col="name"]').textContent())!.trim(),
        label: (await row.locator('[data-col="label"]').textContent())!.trim(),
      });
      orderSeen.push(id);
    }
    if (p >= pageCount) break;
    await page.click('[data-testid="grid-next"]'); // a_page_grid
    await ready(page, 'document_grid');
    walked.push('a_page_grid');
    await expect(page.locator('[data-testid="grid-page"]')).toContainText(`Page ${p + 1}`);
  }

  const expected = RECORDS.map((r) => ({ document_id: r.document_id, name: r.name, label: r.label }));
  const key = (x: any) => `${x.document_id}|${x.name}|${x.label}`;
  expect(new Set(collected.map(key))).toEqual(new Set(expected.map(key)));
  expect(collected.length).toBe(RECORDS.length);

  // The active sort is an operational column, never the ordering the contract asks for.
  expect(orderSeen).not.toEqual(contractOrder(RECORDS).map((r) => r.document_id));

  // Negative side: this listing owns identity and nothing else.
  const body = await bodyText(page);
  refuse('document_grid', body, [...MIMES, ...STATES, ...HINTS, ...SIZE_TEXTS, ...NONZERO_BYTES]);
  refuse('document_grid', body, [CONTRACT.errors.exception, EDGE.schema_version, CONTRACT.schema_version]);
  expect(body, 'no rows-per-page selector or stated value').not.toMatch(/rows per page/i);
  expect(await page.locator('select').count(), 'the listing offers no page-size selector').toBe(0);

  for (let p = 1; p <= pageCount; p++) {
    const grid = await payload(request, `/api/documents?page=${p}&sort=modified`);
    const keys = keysDeep(grid.json);
    for (const k of ['bytes', 'mime', 'upload_state', 'selected', 'size_text', 'aria_label', 'page_size'])
      expect(keys.has(k), `the listing payload must not carry ${k}`).toBe(false);
    refuse('the listing payload', grid.text, [...MIMES, ...STATES, ...SIZE_TEXTS, ...NONZERO_BYTES]);
  }

  record({
    source: 'records.json#/records/*/document_id+name+label',
    path: walked,
    pieces_retrieved: RECORDS.length * 3,
    matched: true,
    state: 'document_grid',
    modality_note: `paged listing walked across ${pageCount} pages, ordered by an operational column`,
  });
});

/* ================================================================== *
 * 2. records.json#/records/[*]/bytes+mime -> document_properties
 *    a_open_documents, a_page_grid, a_open_properties (once per element)
 * ================================================================== */
test('byte count and media type are drilled one element at a time', async ({ page, request }) => {
  const walked: string[] = [];
  const got: Record<string, { bytes: number | null; mime: string }> = {};
  const sizeCellText: Record<string, string> = {};

  for (const rec of RECORDS) {
    await page.goto('/');
    await ready(page, 'library_home');
    await page.click('#rail a[href="/documents"]'); // a_open_documents
    await ready(page, 'document_grid');
    walked.push('a_open_documents');

    // Settle the page this element sits on.
    const rowSel = `[data-testid="documents-grid"] tbody tr[data-doc-id="${rec.document_id}"]`;
    while ((await page.locator(rowSel).count()) === 0) {
      await page.click('[data-testid="grid-next"]'); // a_page_grid
      await ready(page, 'document_grid');
      walked.push('a_page_grid');
    }

    await page.click(`${rowSel} [data-testid="open-properties"]`); // a_open_properties
    await ready(page, 'document_properties');
    walked.push('a_open_properties');

    const panel = page.locator('[data-testid="properties-panel"]');
    await expect(panel.locator('[data-field="mime"]')).toBeVisible();
    expect((await panel.locator('[data-field="document_id"]').textContent())!.trim()).toBe(rec.document_id);

    const mime = (await panel.locator('[data-field="mime"]').textContent())!.trim();
    const sizeEl = panel.locator('[data-field="bytes"]');
    const reported = (await sizeEl.getAttribute('data-bytes-reported')) === 'true';
    const raw = (await sizeEl.textContent())!.trim();
    sizeCellText[rec.document_id] = raw;
    // The surface prints the exact stored integer with no separators and no
    // unit scaling, so Number() recovers it without loss; a size that was
    // never reported is stated as its own thing and never as a number.
    if (reported) expect(raw).toMatch(/^\d+$/);
    const bytes = reported ? Number(raw) : null;
    got[rec.document_id] = { bytes, mime };

    // Only this element's technical metadata is here.
    const panelText = flat(await panel.innerText());
    for (const other of RECORDS) {
      if (other.document_id === rec.document_id) continue;
      if (other.mime !== rec.mime) refuse('document_properties', panelText, [other.mime]);
      if (typeof other.bytes === 'number' && other.bytes !== 0 && other.bytes !== rec.bytes)
        refuse('document_properties', panelText, [String(other.bytes)]);
    }
    refuse('document_properties', panelText, [...STATES, ...HINTS, ...SIZE_TEXTS]);
    refuse('document_properties', panelText, [NB.file_fields.aria_label]);
    expect(panelText, 'no staging flag on the properties surface').not.toMatch(/staged/i);

    const props = await payload(request, `/api/documents/${rec.document_id}/properties`);
    const keys = keysDeep(props.json);
    for (const k of ['upload_state', 'selected', 'size_text', 'aria_label'])
      expect(keys.has(k), `properties payload must not carry ${k}`).toBe(false);

    await page.click('[data-testid="close-properties"]'); // a_close_properties
    await ready(page, 'document_grid');
    walked.push('a_close_properties');
  }

  for (const rec of RECORDS) {
    expect(got[rec.document_id].bytes, `bytes for ${rec.document_id}`).toBe(rec.bytes);
    expect(got[rec.document_id].mime, `mime for ${rec.document_id}`).toBe(rec.mime);
  }

  // A recorded zero and an unreported size must read as two different things.
  const zeros = RECORDS.filter((r) => r.bytes === 0).map((r) => sizeCellText[r.document_id]);
  const nulls = RECORDS.filter((r) => r.bytes === null).map((r) => sizeCellText[r.document_id]);
  for (const z of zeros) for (const n of nulls) expect(z).not.toBe(n);

  record({
    source: 'records.json#/records/*/bytes+mime',
    path: ['a_open_documents', 'a_page_grid', 'a_open_properties'],
    pieces_retrieved: RECORDS.length * 2,
    matched: true,
    state: 'document_properties',
    modality_note: `properties opened and closed once per element (${RECORDS.length} drills, ${walked.length} actions walked)`,
  });
});

/* ================================================================== *
 * 3. records.json#/records/[*]/upload_state -> transfer_monitor
 * ================================================================== */
test('ingestion state is collected from the transfer monitor', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/documents"]'); // a_open_documents
  await ready(page, 'document_grid');
  await page.click('[data-testid="open-transfers"]'); // a_open_transfers
  await ready(page, 'transfer_monitor');

  const rows = page.locator('[data-testid="transfers-table"] tbody tr[data-doc-id]');
  expect(await rows.count()).toBe(RECORDS.length);
  const got: Record<string, string> = {};
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    got[(await row.getAttribute('data-doc-id'))!] = (
      await row.locator('[data-col="upload_state"]').textContent()
    )!.trim();
  }
  for (const r of RECORDS)
    expect(got[r.document_id], `upload_state for ${r.document_id}`).toBe(r.upload_state);

  const body = await bodyText(page);
  refuse('transfer_monitor', body, [...MIMES, ...HINTS, ...SIZE_TEXTS, ...NONZERO_BYTES]);
  expect(body, 'no percentage-complete readout').not.toMatch(/\d+\s?%/);
  expect(body, 'no staging flag in the monitor').not.toMatch(/staged/i);

  const mon = await payload(request, '/api/transfers');
  const keys = keysDeep(mon.json);
  for (const k of ['bytes', 'mime', 'selected', 'size_text', 'upload_hint'])
    expect(keys.has(k), `transfer payload must not carry ${k}`).toBe(false);

  await page.click('[data-testid="close-transfers"]'); // a_close_transfers
  await ready(page, 'document_grid');

  record({
    source: 'records.json#/records/*/upload_state',
    path: ['a_open_documents', 'a_open_transfers'],
    pieces_retrieved: RECORDS.length,
    matched: true,
    state: 'transfer_monitor',
    modality_note: 'ingestion queue read in one visit and joined back by identifier',
  });
});

/* ================================================================== *
 * 4. records.json#/records/[*]/selected -> upload_tray
 * ================================================================== */
test('the staged set is read from the upload console', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/documents"]'); // a_open_documents
  await ready(page, 'document_grid');
  await page.click('[data-testid="open-tray"]'); // a_open_tray
  await page.waitForSelector('[data-testid="tray-table"]');

  const dialog = page.locator('.dialog[data-surface="upload_tray"]');
  const items = dialog.locator('[data-testid="tray-item"]');
  const stagedOrder: string[] = [];
  for (let i = 0; i < (await items.count()); i++) {
    const it = items.nth(i);
    const id = (await it.getAttribute('data-doc-id'))!;
    stagedOrder.push(id);
    const rec = RECORDS.find((r) => r.document_id === id)!;
    expect((await it.locator('[data-col="name"]').textContent())!.trim()).toBe(rec.name);
  }
  expect(Number(await txt(page, '[data-testid="tray-count"]'))).toBe(stagedOrder.length);

  const expectedStaged = RECORDS.filter((r) => r.selected === true).map((r) => r.document_id);
  expect(new Set(stagedOrder)).toEqual(new Set(expectedStaged));

  // Absence from the list is the only statement that an element is not staged.
  const dialogText = flat(await dialog.innerText());
  for (const r of RECORDS.filter((x) => x.selected !== true))
    refuse('upload_tray', dialogText, [r.document_id, r.name]);

  // Its order is neither the library's nor the contract's.
  const contractStaged = contractOrder(RECORDS.filter((r) => r.selected === true)).map((r) => r.document_id);
  if (contractStaged.length > 1) expect(stagedOrder).not.toEqual(contractStaged);

  refuse('upload_tray', dialogText, [...MIMES, ...STATES, ...HINTS, ...SIZE_TEXTS, ...NONZERO_BYTES]);
  refuse('upload_tray', dialogText, [SUBMIT_EVENT.name, ...SUBMIT_EVENT.payload_fields]);
  refuse('upload_tray', dialogText, [RULES.keyboard_submit_key], 'word');

  const tray = await payload(request, '/api/upload-tray');
  const keys = keysDeep(tray.json);
  for (const k of ['bytes', 'mime', 'upload_state', 'selected', 'upload_hint'])
    expect(keys.has(k), `upload console payload must not carry ${k}`).toBe(false);
  for (const r of RECORDS.filter((x) => x.selected !== true))
    expect(tray.text.includes(r.document_id), 'unstaged elements are absent from the payload too').toBe(false);

  await page.click('[data-testid="cancel-tray"]'); // a_close_tray
  await expect(dialog).toHaveCount(0);

  record({
    source: 'records.json#/records/*/selected',
    path: ['a_open_documents', 'a_open_tray'],
    pieces_retrieved: expectedStaged.length,
    matched: true,
    state: 'upload_tray',
    modality_note: 'batch-upload dialog read in one visit, in the order items were added',
  });
});

/* ================================================================== *
 * 5. rules.json#/mode+key+bytes_per_unit+max_name_chars+page_size
 * ================================================================== */
test('the general administration tab states the library behaviour settings', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/settings"]'); // a_open_settings
  await ready(page, 'library_settings');

  const fields = ['mode', 'key', 'bytes_per_unit', 'max_name_chars', 'page_size'];
  for (const f of fields) {
    const shown = await txt(page, `[data-setting="${f}"] [data-value]`);
    const want = RULES[f];
    // Values print plainly, so a numeric setting round-trips through Number().
    if (typeof want === 'number') expect(Number(shown), f).toBe(want);
    else expect(shown, f).toBe(want);
  }

  const body = await bodyText(page);
  refuse('library_settings', body, [...MIMES, ...STATES]);
  refuse('library_settings', body, [RULES.keyboard_submit_key], 'word');
  // The size-unit base is this tab's own; only widths it does not own are checked.
  const foreignWidths = RULES.viewport_widths.filter((w: number) => !fields.some((f) => RULES[f] === w));
  refuse('library_settings', body, foreignWidths.map(String), 'word');
  refuse('library_settings', body, [CONTRACT.errors.exception, ...HINTS, ...SIZE_TEXTS]);
  refuse('library_settings', body, RECORDS.map((r) => r.document_id));
  refuse('library_settings', body, EDGE.cases.map((c: any) => c.id), 'word');

  const gen = await payload(request, '/api/settings/general');
  const keys = keysDeep(gen.json);
  for (const k of ['allowed_mimes', 'upload_states', 'keyboard_submit_key', 'viewport_widths'])
    expect(keys.has(k), `general tab payload must not carry ${k}`).toBe(false);

  record({
    source: 'rules.json#/mode+key+bytes_per_unit+max_name_chars+page_size',
    path: ['a_open_settings'],
    pieces_retrieved: fields.length,
    matched: true,
    state: 'library_settings',
    modality_note: 'tabbed administration screen read as text',
  });
});

/* ================================================================== *
 * 6. rules.json#/allowed_mimes+upload_states
 * ================================================================== */
test('the content-types tab holds both configured sets in order', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/settings"]'); // a_open_settings
  await ready(page, 'library_settings');

  // The general tab must not already carry either set.
  refuse('library_settings', flat(await page.locator('#tabpanel').innerText()), [...MIMES, ...STATES]);

  await page.click('[data-testid="tab-content-types"]'); // a_settings_content_tab
  await ready(page, 'settings_content_types');
  await page.waitForSelector('[data-testid="allowed-mime"]');

  expect(await txts(page, '[data-testid="allowed-mime"]')).toEqual(RULES.allowed_mimes);
  expect(await txts(page, '[data-testid="upload-state"]')).toEqual(RULES.upload_states);

  const panelText = flat(await page.locator('#tabpanel').innerText());
  // The tab names the sets but never which document holds which member.
  refuse('settings_content_types', panelText, RECORDS.map((r) => r.document_id));
  refuse('settings_content_types', panelText, RECORDS.map((r) => r.name));
  refuse('settings_content_types', panelText, [RULES.mode, RULES.key, RULES.keyboard_submit_key], 'word');
  refuse(
    'settings_content_types',
    panelText,
    [String(RULES.bytes_per_unit), String(RULES.max_name_chars)],
    'word'
  );
  refuse('settings_content_types', panelText, RULES.viewport_widths.map(String), 'word');
  refuse('settings_content_types', panelText, [CONTRACT.errors.exception, ...HINTS]);

  const ct = await payload(request, '/api/settings/content-types');
  const keys = keysDeep(ct.json);
  for (const k of [
    'mode',
    'key',
    'bytes_per_unit',
    'max_name_chars',
    'page_size',
    'keyboard_submit_key',
    'viewport_widths',
  ])
    expect(keys.has(k), `content-types payload must not carry ${k}`).toBe(false);

  // a_settings_general_tab — the tab really switches back.
  await page.click('[data-testid="tab-general"]');
  await ready(page, 'library_settings');

  record({
    source: 'rules.json#/allowed_mimes+upload_states',
    path: ['a_open_settings', 'a_settings_content_tab'],
    pieces_retrieved: RULES.allowed_mimes.length + RULES.upload_states.length,
    matched: true,
    state: 'settings_content_types',
    modality_note: 'second tab of the administration screen, reached by switching tabs',
  });
});

/* ================================================================== *
 * 7. rules.json#/viewport_widths -> viewport_presets
 * ================================================================== */
test('the preview widths exist only as the preset control options', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/documents"]'); // a_open_documents
  await ready(page, 'document_grid');
  await page.click('[data-testid="open-presets"]'); // a_open_presets
  await page.waitForSelector('[data-testid="preset-option"]');

  const pop = page.locator('.popover[data-surface="viewport_presets"]');
  const opts = pop.locator('[data-testid="preset-option"]');
  const widths: number[] = [];
  for (let i = 0; i < (await opts.count()); i++) {
    // Options are labelled in raw pixels, so the integer parses back exactly.
    const shown = (await opts.nth(i).locator('.w').textContent())!.trim();
    const w = Number(shown.match(/^(\d+)/)![1]);
    widths.push(w);
  }
  expect(widths).toEqual(RULES.viewport_widths);
  RETRIEVED_WIDTHS = widths;

  const popText = flat(await pop.innerText());
  refuse('viewport_presets', popText, [BREAKPOINT], 'word');
  refuse('viewport_presets', popText, [RULES.keyboard_submit_key, String(RULES.page_size), RULES.mode], 'word');
  refuse('viewport_presets', popText, RECORDS.map((r) => r.name));
  expect(popText, 'the control says nothing about horizontal scrolling').not.toMatch(/scroll/i);

  const pv = await payload(request, '/api/viewport-presets');
  refuse('preset payload', pv.text, [BREAKPOINT], 'word');

  await page.keyboard.press('Escape'); // a_close_presets
  await expect(pop).toHaveCount(0);

  record({
    source: 'rules.json#/viewport_widths',
    path: ['a_open_documents', 'a_open_presets'],
    pieces_retrieved: widths.length,
    matched: true,
    state: 'viewport_presets',
    modality_note: 'read as the options a toolbar control offers, never written out as a setting',
  });
});

/* ================================================================== *
 * 8. rules.json#/keyboard_submit_key -> shortcuts_overlay
 * ================================================================== */
test('the upload submit key is one binding in the shortcuts overlay', async ({ page, request }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#open-shortcuts'); // a_open_shortcuts
  await page.waitForSelector('[data-binding="upload-submit"]');

  const dialog = page.locator('.dialog[data-surface="shortcuts_overlay"]');
  const keys = await dialog.locator('[data-binding="upload-submit"] kbd.key').allTextContents();
  const submitKey = keys.map((k) => k.trim()).join('');
  expect(submitKey).toBe(RULES.keyboard_submit_key);
  RETRIEVED_SUBMIT_KEY = submitKey;

  const dlgText = flat(await dialog.innerText());
  refuse('shortcuts_overlay', dlgText, [SUBMIT_EVENT.name, ...SUBMIT_EVENT.payload_fields]);
  refuse('shortcuts_overlay', dlgText, [...MIMES, ...STATES, ...HINTS]);
  refuse('shortcuts_overlay', dlgText, RECORDS.map((r) => r.name));
  refuse('shortcuts_overlay', dlgText, RULES.viewport_widths.map(String), 'word');

  const sc = await payload(request, '/api/shortcuts');
  refuse('shortcuts payload', sc.text, [SUBMIT_EVENT.name]);

  await page.keyboard.press('Escape'); // a_close_shortcuts
  await expect(dialog).toHaveCount(0);

  record({
    source: 'rules.json#/keyboard_submit_key',
    path: ['a_open_shortcuts'],
    pieces_retrieved: 1,
    matched: true,
    state: 'shortcuts_overlay',
    modality_note: 'binding read from the keyboard-shortcuts overlay among invented bindings',
  });
});

/* ================================================================== *
 * 9. output_contract.json#/schema_version+encoding+execution
 * ================================================================== */
test('the developer landing page publishes revision, encoding and run conditions', async ({ page }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');

  expect(await txt(page, '[data-field="schema_version"]')).toBe(CONTRACT.schema_version);
  expect(await txt(page, '[data-field="encoding"]')).toBe(CONTRACT.encoding);

  const x = CONTRACT.execution;
  // The network posture renders as words; the mapping is one-to-one.
  expect(await txt(page, '[data-field="offline"]')).toMatch(x.offline ? /^Offline/ : /^Network/);
  expect(await txt(page, '[data-field="python"]')).toBe(x.python);
  expect(Number((await txt(page, '[data-field="timeout_seconds"]')).match(/\d+/)![0])).toBe(x.timeout_seconds);
  expect(await txt(page, '[data-field="deep_input_mutation"]')).toContain(x.deep_input_mutation);
  expect(await txt(page, '[data-field="candidate_isolation"]')).toBe(x.candidate_isolation);

  expect((await txts(page, '[data-testid="dev-section"] a')).length).toBe(4);

  const body = await bodyText(page);
  refuse('developer_index', body, [...HINTS, ...SIZE_TEXTS, CONTRACT.errors.exception]);
  refuse('developer_index', body, [NB.file_fields.aria_label, CONTRACT.object_rule, CONTRACT.null_rule]);
  refuse('developer_index', body, [SUBMIT_EVENT.name, ...SUBMIT_EVENT.payload_fields]);
  refuse('developer_index', body, [...MIMES, ...STATES]);
  refuse('developer_index', body, RULES.viewport_widths.map(String), 'word');
  refuse('developer_index', body, RECORDS.map((r) => r.document_id));
  refuse('developer_index', body, EDGE.cases.map((c: any) => c.id), 'word');

  record({
    source: 'output_contract.json#/schema_version+encoding+execution',
    path: ['a_open_developer'],
    pieces_retrieved: 2 + Object.keys(x).length,
    matched: true,
    state: 'developer_index',
    modality_note: 'developer portal landing page read on the way in to every section',
  });
});

/* ================================================================== *
 * 10. the structural half of the contract -> developer_reference
 * ================================================================== */
type FieldRead = { name: string; type: string; cons: Record<string, string>; block: string };

async function readFields(page: Page, testid: string): Promise<FieldRead[]> {
  const blocks = page.locator(`[data-testid="${testid}"]`);
  const out: FieldRead[] = [];
  for (let i = 0; i < (await blocks.count()); i++) {
    const b = blocks.nth(i);
    const cons: Record<string, string> = {};
    const conEls = b.locator('[data-con]');
    for (let k = 0; k < (await conEls.count()); k++) {
      const el = conEls.nth(k);
      cons[(await el.getAttribute('data-con'))!] = ((await el.locator('.conv').textContent()) || '').trim();
    }
    out.push({
      name: (await b.getAttribute('data-name'))!,
      type: (await b.locator('[data-testid="field-type"]').textContent())!.trim(),
      cons,
      block: flat(await b.innerText()),
    });
  }
  return out;
}

/** The scalar constraints a schema node declares, as the reference prints them. */
function scalarCons(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (o: any) => {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'type' || k === 'properties' || k === 'items' || k === 'enum' || k === 'const' || k === 'oneOf')
        continue; // structural keys, not scalar constraints
      if (Array.isArray(v)) out[k] = v.join(', ');
      else if (v !== null && typeof v === 'object') continue;
      else out[k] = String(v);
    }
  };
  take(node);
  if (node.oneOf) for (const b of node.oneOf) take(b);
  return out;
}

test('the endpoint reference publishes the structural half of the contract', async ({ page }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');
  await page.click('[data-testid="open-reference"]'); // a_open_reference
  await ready(page, 'developer_reference');

  const ic = CONTRACT.input_contract;
  const recordSchema = ic.properties.records.items;
  const oc = CONTRACT.output_contract;
  const row = oc.properties.files.items;

  // Top-level container and its closed-set rule.
  expect(await txts(page, '[data-testid="top-level-required"] li')).toEqual(CONTRACT.input_top_level.required);
  expect(await txt(page, '[data-testid="top-level-additional"]')).toBe(
    String(CONTRACT.input_top_level.additionalProperties)
  );
  expect(await txt(page, '[data-testid="records-ordering"]')).toBe(ic.properties.records.ordering);
  expect(await txts(page, '[data-testid="input-property-order"] li')).toEqual(ic.property_order);

  // Per-record field-and-type contract.
  const recFields = await readFields(page, 'record-field');
  expect(recFields.map((f) => f.name)).toEqual(Object.keys(recordSchema.properties));
  for (const f of recFields) {
    const node = recordSchema.properties[f.name];
    const want = node.oneOf ? node.oneOf.map((b: any) => b.type).join(' | ') : node.type;
    expect(f.type, `${f.name} type`).toBe(want);
    for (const [k, v] of Object.entries(scalarCons(node)))
      expect(f.cons[k], `${f.name}.${k}`).toBe(v);
    if (node.oneOf && node.oneOf.some((b: any) => b.type === 'null'))
      expect(f.block, `${f.name} is marked nullable`).toContain('nullable');
    // A closed set of published strings is pointed at, never listed here.
    if (node.enum) expect(f.cons.enum, `${f.name}.enum is a pointer`).toMatch(POINTER);
  }
  expect(await txts(page, '[data-testid="record-required"] li')).toEqual(recordSchema.required);
  expect(await txts(page, '[data-testid="record-property-order"] li')).toEqual(recordSchema.property_order);
  expect(await txt(page, '[data-testid="record-additional"]')).toBe(String(recordSchema.additionalProperties));

  // Policy argument: shape here, values in administration.
  expect(await txts(page, '[data-testid="policy-property-order"] li')).toEqual(
    CONTRACT.policy_contract.property_order
  );
  expect(await txt(page, '[data-testid="policy-additional"]')).toBe(
    String(CONTRACT.policy_contract.additionalProperties)
  );
  expect(await txt(page, '[data-testid="policy-recursive-rule"]')).toBe(
    CONTRACT.policy_contract.recursive_scalar_rule
  );
  expect(await txt(page, '[data-testid="policy-value-home"]')).toMatch(POINTER);

  // Returned object.
  const outFields = await readFields(page, 'output-field');
  expect(outFields.map((f) => f.name)).toEqual(Object.keys(oc.properties));
  expect(await txts(page, '[data-testid="output-required"] li')).toEqual(oc.required);
  expect(await txts(page, '[data-testid="output-property-order"] li')).toEqual(oc.property_order);
  expect(await txt(page, '[data-testid="output-additional"]')).toBe(String(oc.additionalProperties));
  expect(outFields.find((f) => f.name === 'upload_hint')!.cons.enum).toMatch(POINTER);

  // Returned row.
  const rowFields = await readFields(page, 'row-field');
  expect(rowFields.map((f) => f.name)).toEqual(Object.keys(row.properties));
  expect(await txts(page, '[data-testid="row-required"] li')).toEqual(row.required);
  expect(await txts(page, '[data-testid="row-property-order"] li')).toEqual(row.property_order);
  expect(await txt(page, '[data-testid="row-additional"]')).toBe(String(row.additionalProperties));

  // Ordering rules.
  expect(await txt(page, '[data-testid="files-ordering"]')).toBe(oc.properties.files.ordering);
  expect(await txt(page, '[data-testid="selected-ids-ordering"]')).toBe(oc.properties.selected_ids.ordering);

  // Embedded descriptors: shape and key order here, constants elsewhere.
  const se = oc.properties.submit_event;
  const seFields = await readFields(page, 'submit-event-field');
  expect(seFields.map((f) => f.name)).toEqual(Object.keys(se.properties));
  for (const f of seFields) expect(f.cons.const, `${f.name} const is a pointer`).toMatch(POINTER);
  expect(await txts(page, '[data-testid="submit-event-required"] li')).toEqual(se.required);
  expect(await txts(page, '[data-testid="submit-event-property-order"] li')).toEqual(se.property_order);

  const lay = oc.properties.layout;
  const layFields = await readFields(page, 'layout-field');
  expect(layFields.map((f) => f.name)).toEqual(Object.keys(lay.properties));
  expect(layFields.find((f) => f.name === 'viewport_widths')!.cons.const).toMatch(POINTER);
  expect(layFields.find((f) => f.name === 'narrow_breakpoint')!.cons.const).toMatch(POINTER);
  expect(await txts(page, '[data-testid="layout-required"] li')).toEqual(lay.required);
  expect(await txts(page, '[data-testid="layout-property-order"] li')).toEqual(lay.property_order);

  // General rules.
  expect(await txt(page, '[data-rule="object_rule"]')).toBe(CONTRACT.object_rule);
  expect(await txt(page, '[data-rule="array_rule"]')).toBe(CONTRACT.array_rule);
  expect(await txt(page, '[data-rule="null_rule"]')).toBe(CONTRACT.null_rule);

  // Negative side.
  const body = await bodyText(page);
  refuse('developer_reference', body, [...HINTS, ...SIZE_TEXTS, ...MIMES, ...STATES]);
  refuse('developer_reference', body, [
    NB.size_text.rounding,
    NB.file_fields.aria_label,
    SUBMIT_EVENT.name,
    ...SUBMIT_EVENT.payload_fields,
    ...NB.verification_document.required_statements,
  ]);
  refuse('developer_reference', body, [RULES.keyboard_submit_key, BREAKPOINT], 'word');
  refuse('developer_reference', body, RULES.viewport_widths.map(String), 'word');
  refuse('developer_reference', body, RECORDS.map((r) => r.document_id));
  refuse('developer_reference', body, EDGE.cases.map((c: any) => c.id), 'word');
  for (const cond of CONTRACT.errors.conditions) refuse('developer_reference', body, [cond]);
  // The exception type belongs to the error reference. fsm.json requires this
  // section to carry the absent-value rule verbatim, and that rule names the
  // exception itself, so the name may occur here inside that rule and nowhere
  // else -- every rejection condition stays the error reference's alone.
  refuse(
    'developer_reference outside the published absent-value rule',
    body.split(flat(CONTRACT.null_rule)).join('\u0000'),
    [CONTRACT.errors.exception]
  );

  record({
    source:
      'output_contract.json#/input_top_level+input_contract+policy_contract+output_contract+object_rule+array_rule+null_rule',
    path: ['a_open_developer', 'a_open_reference'],
    pieces_retrieved: 7,
    matched: true,
    state: 'developer_reference',
    modality_note: 'reference section opened in its own right from the developer landing page',
  });

  await page.click('[data-testid="close-reference"]'); // a_close_reference
  await ready(page, 'developer_index');
});

/* ================================================================== *
 * 11. normative_behavior/size_text+file_fields+upload_hint_priority
 * ================================================================== */
test('the behaviour guide publishes the derived-text rules', async ({ page }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');
  await page.click('[data-testid="open-behavior"]'); // a_open_behavior
  await ready(page, 'developer_behavior');

  for (const [band, value] of Object.entries(NB.size_text)) {
    const shown = await txt(page, `[data-size-band="${band}"][data-band-value], [data-size-band="${band}"] [data-band-value]`);
    expect(shown, `size band ${band}`).toBe(value);
  }
  expect(await txt(page, '[data-testid="aria-label-formula"]')).toBe(NB.file_fields.aria_label);
  expect(await txt(page, '[data-testid="keyboard-selectable"]')).toContain(
    String(NB.file_fields.keyboard_selectable)
  );
  expect(await txt(page, '[data-testid="worked-example"]')).toBe(
    NB.verification_document.required_statements[0]
  );

  const rules = page.locator('[data-testid="hint-rule"]');
  expect(await rules.count()).toBe(NB.upload_hint_priority.length);
  for (let i = 0; i < NB.upload_hint_priority.length; i++) {
    const r = rules.nth(i);
    expect((await r.locator('[data-hint-when]').textContent())!.trim()).toBe(NB.upload_hint_priority[i].when);
    expect((await r.locator('[data-hint-value]').textContent())!.trim()).toBe(NB.upload_hint_priority[i].value);
  }

  const body = await bodyText(page);
  refuse('developer_behavior', body, [
    CONTRACT.errors.exception,
    CONTRACT.object_rule,
    CONTRACT.null_rule,
    CONTRACT.output_contract.properties.files.ordering,
    SUBMIT_EVENT.name,
    ...SUBMIT_EVENT.payload_fields,
    ...MIMES,
  ]);
  refuse('developer_behavior', body, RECORDS.map((r) => r.document_id));
  refuse('developer_behavior', body, RECORDS.map((r) => r.name));
  refuse('developer_behavior', body, EDGE.cases.map((c: any) => c.id), 'word');
  refuse('developer_behavior', body, [BREAKPOINT], 'word');

  record({
    source: 'output_contract.json#/normative_behavior/size_text+file_fields+upload_hint_priority',
    path: ['a_open_developer', 'a_open_behavior'],
    pieces_retrieved: Object.keys(NB.size_text).length + 2 + NB.upload_hint_priority.length,
    matched: true,
    state: 'developer_behavior',
    modality_note: 'second reference section, opened separately from the landing page',
  });

  await page.click('[data-testid="close-behavior"]'); // a_close_behavior
  await ready(page, 'developer_index');
});

/* ================================================================== *
 * 12. output_contract.json#/errors
 * ================================================================== */
test('the error reference publishes the exception and every trigger', async ({ page }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');
  await page.click('[data-testid="open-errors"]'); // a_open_errors
  await ready(page, 'developer_errors');

  expect(await txt(page, '[data-testid="error-exception"]')).toBe(CONTRACT.errors.exception);
  expect(await txts(page, '[data-testid="error-condition"]')).toEqual(CONTRACT.errors.conditions);

  const body = await bodyText(page);
  refuse('developer_errors', body, [
    NB.size_text.null,
    NB.size_text.rounding,
    NB.file_fields.aria_label,
    CONTRACT.object_rule,
    ...HINTS,
    ...MIMES,
    SUBMIT_EVENT.name,
  ]);
  refuse('developer_errors', body, RECORDS.map((r) => r.document_id));
  refuse('developer_errors', body, EDGE.cases.map((c: any) => c.id), 'word');
  refuse('developer_errors', body, RULES.viewport_widths.map(String), 'word');

  record({
    source: 'output_contract.json#/errors',
    path: ['a_open_developer', 'a_open_errors'],
    pieces_retrieved: 1 + CONTRACT.errors.conditions.length,
    matched: true,
    state: 'developer_errors',
    modality_note: 'third reference section, opened separately from the landing page',
  });

  await page.click('[data-testid="close-errors"]'); // a_close_errors
  await ready(page, 'developer_index');
});

/* ================================================================== *
 * 13. the client-side half of the contract -> developer_components
 * ================================================================== */
test('the component contract publishes modules, exports, events and rules', async ({ page }) => {
  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');
  await page.click('[data-testid="open-components"]'); // a_open_components
  await ready(page, 'developer_components');

  // Modules to deliver, and which are behaviourally validated.
  const rows = page.locator('[data-testid="deliverable"]');
  expect(await rows.count()).toBe(CONTRACT.domain_deliverables.length);
  for (let i = 0; i < CONTRACT.domain_deliverables.length; i++) {
    const want = CONTRACT.domain_deliverables[i];
    const r = rows.nth(i);
    expect(await r.getAttribute('data-path')).toBe(want.path);
    expect((await r.locator('[data-field="required"]').textContent())!.trim()).toBe(String(want.required));
    expect((await r.locator('[data-field="behaviorally_validated"]').textContent())!.trim()).toBe(
      String(want.behaviorally_validated)
    );
  }

  // View-model module.
  const vm = NB.node_view_model;
  expect(await txt(page, '[data-testid="vm-module"]')).toBe(vm.module);
  expect(await txts(page, '[data-testid="vm-export"]')).toEqual(vm.exports);
  expect(await txt(page, '[data-testid="cdl-arguments"]')).toBe(vm.createDocumentList.arguments);
  expect(await txt(page, '[data-testid="cdl-result"]')).toBe(vm.createDocumentList.result);
  expect(await txts(page, '[data-testid="cdl-record-key"]')).toEqual(vm.createDocumentList.record_keys);
  expect(await txt(page, '[data-testid="sfk-arguments"]')).toBe(vm.submitFromKey.arguments.join(', '));
  expect(await txt(page, '[data-testid="sfk-result"]')).toBe(vm.submitFromKey.result);
  expect(JSON.parse(await txt(page, '[data-testid="sfk-enter-result"]'))).toEqual(vm.submitFromKey.enter_result);

  // Event constructors.
  const ev = NB.vue_event_contract;
  expect(await txt(page, '[data-testid="evt-module"]')).toBe(ev.module);
  expect(await txts(page, '[data-testid="evt-export"]')).toEqual(ev.exports);
  expect(await txt(page, '[data-testid="toggle-call"]')).toBe(ev.toggle.constructor_call);
  expect(JSON.parse(await txt(page, '[data-testid="toggle-result"]'))).toEqual(ev.toggle.result);
  expect(await txt(page, '[data-testid="submit-call"]')).toBe(ev.submit_upload.constructor_call);
  expect(JSON.parse(await txt(page, '[data-testid="submit-result"]'))).toEqual(ev.submit_upload.result);
  expect(await txt(page, '[data-testid="evt-keyboard"]')).toBe(ev.keyboard);

  // Components.
  for (const file of Object.keys(NB.vue_components).filter((k) => k.endsWith('.vue'))) {
    const spec = NB.vue_components[file];
    const box = page.locator(`[data-testid="component"][data-file="${file}"]`);
    await expect(box).toHaveCount(1);
    expect(await box.locator('[data-testid="component-prop"]').allTextContents()).toEqual(spec.props);
    expect(await box.locator('[data-testid="component-emit"]').allTextContents()).toEqual(spec.emits);
    for (const [k, v] of Object.entries(spec)) {
      if (k === 'props' || k === 'emits') continue;
      const cell = box.locator(`[data-spec-key="${k}"]`);
      if (Array.isArray(v)) expect(await cell.locator('[data-spec-item]').allTextContents()).toEqual(v);
      else expect((await cell.textContent())!.trim(), `${file}.${k}`).toBe(v);
    }
  }

  // Responsive rules: declarations here, widths and breakpoint pointed at.
  const rc = NB.vue_components.responsive_css;
  expect(await txts(page, '[data-testid="css-declaration"]')).toEqual(rc.required_declarations);
  expect(await txt(page, '[data-testid="css-horizontal-scroll"]')).toBe(String(rc.horizontal_scroll));
  expect(await txt(page, '[data-testid="css-widths-home"]')).toMatch(POINTER);
  expect(await txt(page, '[data-testid="css-breakpoint-home"]')).toMatch(POINTER);

  // Conformance report.
  expect(await txts(page, '[data-testid="report-sections"] li')).toEqual(
    NB.verification_document.required_sections
  );
  expect(await txts(page, '[data-testid="report-statement"]')).toEqual(
    NB.verification_document.required_statements
  );

  // Negative side.
  const body = await bodyText(page);
  refuse('developer_components', body, [
    ...HINTS,
    NB.size_text.null,
    NB.size_text.rounding,
    NB.file_fields.aria_label,
    CONTRACT.errors.exception,
    CONTRACT.object_rule,
    CONTRACT.output_contract.properties.files.ordering,
  ]);
  refuse('developer_components', body, RULES.viewport_widths.map(String), 'word');
  refuse('developer_components', body, [BREAKPOINT], 'word');
  refuse('developer_components', body, RECORDS.map((r) => r.document_id));
  refuse('developer_components', body, EDGE.cases.map((c: any) => c.id), 'word');
  for (const cond of CONTRACT.errors.conditions) refuse('developer_components', body, [cond]);

  record({
    source:
      'output_contract.json#/domain_deliverables+normative_behavior/node_view_model+vue_event_contract+vue_components+verification_document',
    path: ['a_open_developer', 'a_open_components'],
    pieces_retrieved:
      CONTRACT.domain_deliverables.length +
      vm.exports.length +
      ev.exports.length +
      2 +
      rc.required_declarations.length +
      NB.verification_document.required_sections.length +
      NB.verification_document.required_statements.length,
    matched: true,
    state: 'developer_components',
    modality_note: 'fourth reference section, the only surface tying an event to a key',
  });

  await page.click('[data-testid="close-components"]'); // a_close_components
  await ready(page, 'developer_index');
});

/* ================================================================== *
 * 14. output_contract.json#/empty_input_result -> developer_console_response
 *     a_open_developer, a_open_reference, a_open_console, a_run_console
 * ================================================================== */
test('the empty-library outcome exists only once the sample call is executed', async ({ page }) => {
  expect(RETRIEVED_WIDTHS.length, 'preview widths retrieved earlier').toBeGreaterThan(0);
  expect(RETRIEVED_SUBMIT_KEY, 'submit key retrieved earlier').not.toBe('');

  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/developer"]'); // a_open_developer
  await ready(page, 'developer_index');
  await page.click('[data-testid="open-reference"]'); // a_open_reference
  await ready(page, 'developer_reference');
  await page.click('[data-testid="open-console"]'); // a_open_console
  await ready(page, 'developer_console');

  // Nothing of the response exists before the call is executed.
  await expect(page.locator('[data-testid="console-response"]')).toHaveAttribute('data-console-state', 'idle');
  const before = await bodyText(page);
  const resultKeys = Object.keys(CONTRACT.empty_input_result);
  refuse('developer_console (before running)', before, resultKeys, 'word');
  refuse('developer_console (before running)', before, [...HINTS, SUBMIT_EVENT.name, ...SUBMIT_EVENT.payload_fields]);
  refuse('developer_console (before running)', before, [BREAKPOINT], 'word');
  expect(await page.locator('[data-testid="console-response-body"]').count()).toBe(0);

  // a_run_console — a real call, awaited on an explicit ready signal.
  await page.click('[data-testid="console-run"]');
  await page.waitForSelector('[data-testid="console-response"][data-console-state="complete"]');

  const shown = JSON.parse(await txt(page, '[data-testid="console-response-body"]'));

  // Two values render as pointers to the surfaces that own them.
  expect(shown.submit_event.keyboard).toMatch(POINTER);
  expect(shown.layout.viewport_widths).toMatch(POINTER);

  // Substitute back what those surfaces handed over, then compare whole.
  const reconstructed = JSON.parse(JSON.stringify(shown));
  reconstructed.submit_event.keyboard = RETRIEVED_SUBMIT_KEY;
  reconstructed.layout.viewport_widths = RETRIEVED_WIDTHS;

  expect(reconstructed).toEqual(CONTRACT.empty_input_result);
  // Key order survives too: JSON.parse keeps the printed order for string keys.
  expect(Object.keys(reconstructed)).toEqual(Object.keys(CONTRACT.empty_input_result));
  expect(Object.keys(reconstructed.submit_event)).toEqual(Object.keys(CONTRACT.empty_input_result.submit_event));
  expect(Object.keys(reconstructed.layout)).toEqual(Object.keys(CONTRACT.empty_input_result.layout));
  expect(reconstructed.layout.narrow_breakpoint).toBe(CONTRACT.empty_input_result.layout.narrow_breakpoint);

  RETRIEVED_EMPTY_RESULT = reconstructed;

  // No response for any non-empty library, and no document data.
  const after = await bodyText(page);
  refuse('developer_console_response', after, RECORDS.map((r) => r.document_id));
  refuse('developer_console_response', after, RECORDS.map((r) => r.name));
  refuse('developer_console_response', after, [CONTRACT.errors.exception, NB.size_text.rounding]);

  record({
    source: 'output_contract.json#/empty_input_result',
    path: ['a_open_developer', 'a_open_reference', 'a_open_console', 'a_run_console'],
    pieces_retrieved: resultKeys.length,
    matched: true,
    state: 'developer_console_response',
    modality_note: 'produced by composing a call over an empty document set and executing it',
  });

  // a_close_response then a_close_console — the builder stays re-runnable.
  await page.click('[data-testid="close-response"]');
  await expect(page.locator('[data-testid="console-response"]')).toHaveAttribute('data-console-state', 'idle');
  await page.click('[data-testid="close-console"]');
  await ready(page, 'developer_reference');
});

/* ================================================================== *
 * 15. public_edge_cases.json#/cases -> certification_viewer
 *     a_open_governance, a_preview_certification, a_page_certification
 * ================================================================== */
test('the certification checklist is read page by page in the previewer', async ({ page, request }) => {
  expect(RETRIEVED_EMPTY_RESULT, 'the reference response retrieved earlier').not.toBeNull();

  await page.goto('/');
  await ready(page, 'library_home');
  await page.click('#rail a[href="/governance"]'); // a_open_governance
  await ready(page, 'governance_collection');

  // The collection carries the document's row, never its body.
  const collection = await bodyText(page);
  refuse('governance_collection', collection, EDGE.cases.map((c: any) => c.id), 'word');
  for (const c of EDGE.cases) {
    if (c.rule) refuse('governance_collection', collection, [c.rule]);
    if (c.expected_error) refuse('governance_collection', collection, [c.expected_error]);
  }
  refuse('governance_collection', collection, RECORDS.map((r) => r.name));
  refuse('governance_collection', collection, [...HINTS, ...MIMES]);

  await page.click('[data-testid="gov-row"][data-doc="certification"] a'); // a_preview_certification
  await ready(page, 'certification_viewer');
  await page.waitForSelector('[data-testid="cert-case"]');

  expect(await txt(page, '[data-testid="cert-revision"]')).toBe(EDGE.schema_version);

  const pageCount = Number((await txt(page, '[data-testid="viewer-page-label"]')).match(/of (\d+)/)![1]);
  expect(pageCount, 'the document runs longer than one preview page').toBeGreaterThan(1);

  const walked = ['a_open_governance', 'a_preview_certification'];
  const collected: any[] = [];
  const firstPageText = flat(await page.locator('#sheet').innerText());

  for (let p = 1; ; p++) {
    const cases = page.locator('[data-testid="cert-case"]');
    for (let i = 0; i < (await cases.count()); i++) {
      const c = cases.nth(i);
      const id = (await c.getAttribute('data-case-id'))!;
      const kind = (await c.getAttribute('data-case-kind'))!;
      if (kind === 'rejection') {
        collected.push({ id, expected_error: (await c.locator('.case-error').textContent())!.trim() });
      } else if (kind === 'pointer') {
        // The empty-library case points at the developer center rather than
        // restating its outcome, so the value comes from the executed call.
        await expect(c.locator('.case-pointer a')).toHaveAttribute('href', /developer/);
        collected.push({ id, expected: RETRIEVED_EMPTY_RESULT });
      } else {
        collected.push({ id, rule: (await c.locator('.case-rule').textContent())!.trim() });
      }
    }
    if (p >= pageCount) break;
    await page.click('[data-testid="viewer-next"]'); // a_page_certification
    await page.waitForSelector(`#sheet[data-page="${p + 1}"]`);
    walked.push('a_page_certification');
  }

  expect(collected).toEqual(EDGE.cases);

  // The later cases really were not legible on the first page.
  for (const c of EDGE.cases.slice(collected.length - (collected.length - 1))) {
    // (checked concretely below against the recorded first-page text)
  }
  const firstPageIds = EDGE.cases.slice(0, Math.ceil(EDGE.cases.length / pageCount)).map((c: any) => c.id);
  for (const c of EDGE.cases) {
    if (firstPageIds.includes(c.id)) continue;
    expect(hasWord(firstPageText, c.id), `case ${c.id} must not be on the first preview page`).toBe(false);
    if (c.rule) expect(firstPageText.includes(c.rule)).toBe(false);
  }

  // The viewer carries the cases and nothing the contract or administration owns.
  const body = await bodyText(page);
  refuse('certification_viewer', body, [...HINTS, ...MIMES, ...STATES, NB.size_text.rounding, CONTRACT.object_rule]);
  refuse('certification_viewer', body, RULES.viewport_widths.map(String), 'word');
  refuse('certification_viewer', body, [RULES.keyboard_submit_key], 'word');
  // The previewer numbers its own pages and its own cases, so a bare integer
  // on this surface is the viewer's chrome rather than a configured value.
  // What must be absent is any statement of the library's rows-per-page, whose
  // one home is the general administration tab -- and the document the viewer
  // renders must carry no configured value at all.
  expect(body, 'no rows-per-page statement in the previewer').not.toMatch(/rows per page|page size/i);
  const doc = await payload(request, `/api/governance/certification?page=${pageCount}`);
  const docKeys = keysDeep(doc.json);
  for (const k of Object.keys(RULES))
    expect(docKeys.has(k), `the checklist payload must not carry ${k}`).toBe(false);
  refuse('the checklist payload', doc.text, [...MIMES, ...STATES, ...HINTS, RULES.mode, RULES.key]);
  refuse('certification_viewer', body, RECORDS.map((r) => r.document_id));
  refuse('certification_viewer', body, RECORDS.map((r) => r.name));

  await page.click('[data-testid="viewer-prev"]'); // a_page_certification_back
  await page.waitForSelector(`#sheet[data-page="${pageCount - 1}"]`);
  await page.click('[data-testid="close-viewer"]'); // a_close_viewer
  await ready(page, 'governance_collection');

  record({
    source: 'public_edge_cases.json#/cases',
    path: walked,
    pieces_retrieved: EDGE.cases.length,
    matched: true,
    state: 'certification_viewer',
    modality_note: `stored document opened from a collection and advanced across ${pageCount} preview pages`,
  });
});

/* ================================================================== *
 * 16. write the environment's proof of solvability
 * ================================================================== */
test('every gui placement was retrieved', async () => {
  const fsm = JSON.parse(fs.readFileSync(path.join(__dirname, 'fsm.json'), 'utf8'));
  const guiSources = fsm.data_placement
    .filter((p: any) => p.disposition === 'gui')
    .map((p: any) => p.source);

  const got = LEDGER.map((p) => p.source);
  expect(new Set(got)).toEqual(new Set(guiSources));
  expect(LEDGER.every((p) => p.matched)).toBe(true);

  const ordered = guiSources.map((s: string) => LEDGER.find((p) => p.source === s)!);
  fs.writeFileSync(
    path.join(__dirname, 'ground_truth_retrieval.json'),
    JSON.stringify({ placements: ordered }, null, 2) + '\n',
    'utf8'
  );
});

/*
 * Ground-truth retrieval for the Kestrel Capture Console.
 *
 * This spec plays a competent operator. For every `gui` placement in fsm.json it
 * walks the declared path through the interface and genuinely retrieves the
 * content through the declared modality — submitting the display filter, widening
 * the capture window, opening every session, binding the byte inspector to every
 * frame in turn, re-sorting the profile library to surface the in-force profile,
 * paging the format reference from front matter to baseline, and opening each
 * kind of regression case from the suite header.
 *
 * Every expectation is built at runtime from ./input. Not one capture value,
 * profile parameter, contract clause or case identifier is written into this
 * file. It also asserts the negative side of the FSM's visible_data contract:
 * that content is absent from the surfaces — and from the payloads those
 * surfaces fetch — that must not carry it.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const INPUT_DIR = path.join(__dirname, 'input');
const readInput = (name: string): any =>
  JSON.parse(fs.readFileSync(path.join(INPUT_DIR, name), 'utf8'));

const records = readInput('records.json').records as Array<{
  session_id: string; protocol: string;
  frames: Array<{ message_id: string; tick: number; fragment_index: number; fragment_count: number; payload_hex: string }>;
}>;
const rules = readInput('rules.json');
const contract = readInput('output_contract.json');
const suite = readInput('public_edge_cases.json');

const ALL_SESSION_IDS = records.map((r) => r.session_id);
const ALL_MESSAGE_IDS = [...new Set(records.flatMap((r) => r.frames.map((f) => f.message_id)))];
const ALL_PAYLOADS = [...new Set(records.flatMap((r) => r.frames.map((f) => f.payload_hex)))];
const ALL_PROTOCOLS = [...new Set(records.map((r) => r.protocol))];
const CASE_IDS = suite.cases.map((c: any) => c.id);
const REFUSAL_CASES = suite.cases.filter((c: any) => c.expected_error !== undefined);
const INVARIANT_CASES = suite.cases.filter((c: any) => c.expected_error === undefined);

/* The reference withholds any sentence of the contract's prose that names a
 * policy property, because the policy has exactly one home in the console. The
 * withheld sentences are recomputed here from the contract itself. */
const POLICY_PROPS: string[] = Object.keys(contract.policy.properties);
const WITHHELD_RULE_SENTENCES: string[] = String(contract.policy.parameterization)
  .split('。').map((s) => s.trim()).filter(Boolean)
  .filter((s) => POLICY_PROPS.some((p) => s.includes(p)));
const PUBLISHED_RULE_SENTENCES: string[] = String(contract.policy.parameterization)
  .split('。').map((s) => s.trim()).filter(Boolean)
  .filter((s) => !POLICY_PROPS.some((p) => s.includes(p)))
  .map((s) => s + '。');

/* ------------------------------------------------------------------ *
 * Retrieval record — written out as the environment's proof of solvability
 * ------------------------------------------------------------------ */

type Placement = {
  source: string;
  path: string[];
  pieces_retrieved: number;
  matched: boolean;
  piece_unit: string;
  actions_walked: number;
  detail?: any;
};
const placements: Placement[] = [];
let actionsWalked = 0;

function walked(n = 1) { actionsWalked += n; }

test.afterAll(async () => {
  fs.writeFileSync(
    path.join(__dirname, 'ground_truth_retrieval.json'),
    JSON.stringify({
      placements,
      total_actions_walked: actionsWalked,
    }, null, 2) + '\n',
    'utf8',
  );
});

/* ------------------------------------------------------------------ *
 * Surface helpers
 * ------------------------------------------------------------------ */

/** Every surface publishes an explicit ready signal; nothing here sleeps. */
async function atSurface(page: Page, state: string) {
  await page.waitForSelector(`#surface[data-surface="${state}"][data-ready="true"]`, { timeout: 15_000 });
}

const surfaceText = (page: Page) => page.locator('#surface').innerText();

async function cells(page: Page, rowSel: string, field: string): Promise<string[]> {
  return page.locator(`${rowSel} td[data-field="${field}"]`).allInnerTexts();
}

/** No token from `needles` may appear anywhere in `haystack`. */
function assertAbsent(haystack: string, needles: string[], where: string) {
  for (const n of needles) {
    expect(haystack.includes(n), `${where} must not carry "${n}"`).toBe(false);
  }
}

/* ================================================================== *
 * 1. records.json — query, then master–detail twice over
 * ================================================================== */

test('records.json: sessions, frames and payload bytes are retrievable only through the console', async ({ page, request }) => {
  const retrieved: Record<string, any> = {};

  /* ---- capture_home: operational chrome only ---- */
  await page.goto('/#/');
  await atSurface(page, 'capture_home');

  const homeDom = await surfaceText(page);
  const homeJson = JSON.stringify(await (await request.get('/api/home')).json());
  for (const where of [['capture_home DOM', homeDom], ['GET /api/home', homeJson]] as const) {
    assertAbsent(where[1], ALL_SESSION_IDS, where[0]);
    assertAbsent(where[1], ALL_MESSAGE_IDS, where[0]);
    assertAbsent(where[1], [rules.mode, rules.key, 'strict_fragment_drop'], where[0]);
    assertAbsent(where[1], [contract.errors.exception, ...CASE_IDS.filter((c: string) => c !== 'empty')], where[0]);
    // No session tally and no reassembly outcome may be legible here.
    assertAbsent(where[1], ['sessions matched', 'delivered_messages', 'dropped_messages', 'missing_fragments'], where[0]);
  }
  // The workspace may state bare structural integers about the stored set.
  expect(Number(await page.locator('#metric-frames').innerText().then((t) => t.replace(/,/g, ''))))
    .toBe(records.reduce((n, r) => n + r.frames.length, 0));

  /* ---- a_open_search ---- */
  await page.click('#rail a[data-nav="search"]');
  await atSurface(page, 'session_search');
  walked();

  /* session_search carries no results at all. */
  const searchDom = await surfaceText(page);
  const searchJson = JSON.stringify(await (await request.get('/api/search-form')).json());
  for (const where of [['session_search DOM', searchDom], ['GET /api/search-form', searchJson]] as const) {
    assertAbsent(where[1], ALL_SESSION_IDS, where[0]);
    assertAbsent(where[1], ALL_MESSAGE_IDS, where[0]);
    assertAbsent(where[1], ALL_PROTOCOLS.map((p) => ` ${p}`), where[0]);
    assertAbsent(where[1], [rules.mode, 'strict_fragment_drop', contract.errors.exception], where[0]);
  }
  expect(await page.locator('#surface table#session-table').count(), 'no result table before a query').toBe(0);
  // The console opens scoped to the most recently rotated segment.
  expect(await page.locator('#scope-select').inputValue()).toBe('latest_segment');

  /* ---- a_widen_window ---- */
  await page.selectOption('#scope-select', 'whole_capture_set');
  walked();

  /* ---- a_run_query ---- */
  await page.fill('#filter-expr', 'session.id');
  await page.click('#btn-run-query');
  await atSurface(page, 'session_index');
  walked();

  /* ---- session_index: identifier + protocol, and nothing of the frames ---- */
  const matched = Number(await page.locator('#result-count').getAttribute('data-matched'));
  expect(matched, 'the result header states the whole population once the window is widened')
    .toBe(records.length);

  const idCells = await page.locator('#session-table tbody tr td:nth-child(4)').allInnerTexts();
  const protoCells = await page.locator('#session-table tbody tr td:nth-child(5)').allInnerTexts();
  const indexRows = idCells.map((id, i) => ({ session_id: id.trim(), protocol: protoCells[i].trim() }));

  expect([...indexRows].map((r) => r.session_id).sort())
    .toEqual([...ALL_SESSION_IDS].sort());
  for (const row of indexRows) {
    const rec = records.find((r) => r.session_id === row.session_id)!;
    expect(rec, `row ${row.session_id} is a staged session`).toBeTruthy();
    expect(row.protocol).toBe(rec.protocol);
  }
  // Rows arrive ordered by a capture column, not by identifier: the ordering the
  // replay contract asks for genuinely has to be derived rather than copied.
  expect(indexRows.map((r) => r.session_id))
    .not.toEqual([...ALL_SESSION_IDS].sort());
  retrieved.sessions = indexRows;

  const queryJson = JSON.stringify(await (await request.post('/api/query', {
    data: { expression: 'session.id', window: 'whole_capture_set' },
  })).json());
  for (const where of [['session_index DOM', await surfaceText(page)], ['POST /api/query', queryJson]] as const) {
    assertAbsent(where[1], ALL_MESSAGE_IDS.map((m) => `"${m}"`).concat(ALL_MESSAGE_IDS.map((m) => `>${m}<`)), where[0]);
    assertAbsent(where[1], ['message_id', 'fragment_index', 'fragment_count', 'payload_hex', 'frames'], where[0]);
    assertAbsent(where[1], ['delivered', 'dropped_messages', 'missing_fragments', 'incomplete'], where[0]);
  }
  // Not one table cell of the result set carries a frame value.
  const indexCellText = await page.locator('#session-table tbody td').allInnerTexts();
  for (const c of indexCellText.map((t) => t.trim())) {
    expect(ALL_MESSAGE_IDS.includes(c), `result cell "${c}" is not a message id`).toBe(false);
    expect(ALL_PAYLOADS.includes(c), `result cell "${c}" is not a payload`).toBe(false);
  }

  /* ---- one session at a time, one frame at a time ---- */
  const framesRetrieved: any[] = [];

  for (const row of indexRows) {
    const rec = records.find((r) => r.session_id === row.session_id)!;

    /* ---- a_open_session ---- */
    await page.click(`#session-table a[data-open-session="${row.session_id}"]`);
    await atSurface(page, 'frame_ledger');
    walked();

    expect(await page.locator('#hdr-session-id').innerText()).toBe(rec.session_id);
    expect(await page.locator('#hdr-protocol').innerText()).toBe(rec.protocol);
    // The ledger opens in stored arrival order.
    expect(await page.locator('#surface').getAttribute('data-frame-sort')).toBe('arrival');

    const arrivals = (await page.locator('#frame-table tbody tr').evaluateAll(
      (rows) => rows.map((r) => Number((r as HTMLElement).dataset.arrival)),
    ));
    expect(arrivals, 'ledger rows are in stored arrival order').toEqual(rec.frames.map((_, i) => i));

    const msgIds = await cells(page, '#frame-table tbody tr', 'message_id');
    const ticks = await cells(page, '#frame-table tbody tr', 'tick');
    const fragIdx = await cells(page, '#frame-table tbody tr', 'fragment_index');
    const fragCnt = await cells(page, '#frame-table tbody tr', 'fragment_count');

    const ledgerRows = rec.frames.map((_, i) => ({
      message_id: msgIds[i].trim(),
      // The ledger prints ticks and fragment counters as bare integers with no
      // separator or unit, so Number() is an exact round trip of the cell text.
      tick: Number(ticks[i].trim()),
      fragment_index: Number(fragIdx[i].trim()),
      fragment_count: Number(fragCnt[i].trim()),
    }));
    for (const [i, f] of rec.frames.entries()) {
      expect(ledgerRows[i]).toEqual({
        message_id: f.message_id, tick: f.tick,
        fragment_index: f.fragment_index, fragment_count: f.fragment_count,
      });
      expect(String(f.tick), 'tick renders unformatted').toBe(ticks[i].trim());
    }

    /* frame_ledger must not carry payload bytes, another session's frames, or
     * any reassembly outcome — nor may the payload it fetches. */
    const ledgerJson = JSON.stringify(await (await request.get(
      `/api/session/${encodeURIComponent(rec.session_id)}/ledger`)).json());
    const ledgerDom = await surfaceText(page);
    for (const where of [['frame_ledger DOM', ledgerDom], ['GET …/ledger', ledgerJson]] as const) {
      assertAbsent(where[1], ['payload_hex'], where[0]);
      assertAbsent(where[1], ALL_PAYLOADS.map((p) => `"${p}"`), where[0]);
      assertAbsent(where[1], ['delivered', 'dropped', 'missing_fragment', 'complete', 'reassembl'], where[0]);
      assertAbsent(where[1], ALL_SESSION_IDS.filter((s) => s !== rec.session_id), where[0]);
      assertAbsent(where[1], ALL_MESSAGE_IDS.filter(
        (m) => !rec.frames.some((f) => f.message_id === m)).map((m) => `"${m}"`), where[0]);
    }
    expect(await page.locator('.bytepane').count(), 'no byte pane on the ledger').toBe(0);
    for (const c of (await page.locator('#frame-table tbody td').allInnerTexts()).map((t) => t.trim())) {
      expect(ALL_PAYLOADS.includes(c), `ledger cell "${c}" is not a payload`).toBe(false);
    }

    /* ---- a_sort_frames: the ledger can be reordered, and its default order is
     *      demonstrably not the one the contract asks for ---- */
    await page.click('#frame-table th[data-col="tick"]');
    await atSurface(page, 'frame_ledger');
    walked();
    expect(await page.locator('#surface').getAttribute('data-frame-sort')).toBe('other_column');
    const byTick = await cells(page, '#frame-table tbody tr', 'tick');
    expect(byTick.map((t) => Number(t.trim())))
      .toEqual([...rec.frames.map((f) => f.tick)].sort((a, b) => a - b));
    // Back to stored arrival order before selecting frames.
    await page.click('#frame-table th[data-col="arrival"]');
    await atSurface(page, 'frame_ledger');
    walked();
    expect(await page.locator('#surface').getAttribute('data-frame-sort')).toBe('arrival');

    /* ---- a_select_frame / a_close_bytes, once per frame ---- */
    for (const [i, f] of rec.frames.entries()) {
      await page.click(`#frame-table tbody tr[data-arrival="${i}"]`);
      await atSurface(page, 'frame_bytes');
      walked();

      /* The pane prints 8-digit offsets, byte pairs grouped 8+8, and an ASCII
       * gutter. Stripping whitespace from the hex column is lossless: every
       * token is exactly one lowercase byte pair, and the grouping gap adds no
       * characters other than spaces. */
      const hexColumns = await page.locator('#byte-pane .brow .bhex').allInnerTexts();
      const assembled = hexColumns.join('').replace(/\s+/g, '');
      expect(assembled, `frame ${i} of ${rec.session_id} carries its own bytes`).toBe(f.payload_hex);
      expect(assembled).toBe(assembled.toLowerCase());

      // "N bytes" is the byte count of the same string; the suffix is display only.
      const shown = Number((await page.locator('#byte-count').innerText()).replace(/[^0-9]/g, ''));
      expect(shown).toBe(f.payload_hex.length / 2);

      // Offsets are the pane's own furniture, not payload: 16 bytes per row.
      const offsets = await page.locator('#byte-pane .brow .boff').allInnerTexts();
      expect(offsets.length).toBe(Math.max(1, Math.ceil(f.payload_hex.length / 32)));

      /* The inspector holds exactly one frame's bytes — never a concatenation
       * and never another frame's, which the exact equality above already
       * proves; assert it holds no other frame's payload as well. */
      const otherPayloads = records.flatMap((r) => r.frames.map((x) => x.payload_hex))
        .filter((_, k) => true);
      const distinctOthers = [...new Set(otherPayloads)].filter((p) => p !== f.payload_hex);
      for (const p of distinctOthers) {
        expect(assembled.includes(p), 'inspector carries no other frame’s bytes').toBe(false);
      }
      const bytesDom = await surfaceText(page);
      assertAbsent(bytesDom, ['delivered', 'dropped', 'missing_fragment', 'reassembl'], 'frame_bytes DOM');
      assertAbsent(bytesDom, [rules.mode, 'strict_fragment_drop', contract.errors.exception], 'frame_bytes DOM');

      framesRetrieved.push({
        session_id: rec.session_id, protocol: rec.protocol, arrival: i,
        message_id: f.message_id, tick: f.tick,
        fragment_index: f.fragment_index, fragment_count: f.fragment_count,
        payload_hex: assembled,
      });

      /* ---- a_close_bytes ---- */
      await page.click('#btn-close-bytes');
      await atSurface(page, 'frame_ledger');
      walked();
    }

    /* ---- a_back_to_index ---- */
    await page.click('#btn-back-index');
    await atSurface(page, 'session_index');
    walked();
  }

  /* Everything staged in records.json came back through the interface. */
  const rebuilt = ALL_SESSION_IDS.map((sid) => ({
    session_id: sid,
    protocol: framesRetrieved.find((f) => f.session_id === sid)!.protocol,
    frames: framesRetrieved.filter((f) => f.session_id === sid)
      .sort((a, b) => a.arrival - b.arrival)
      .map(({ message_id, tick, fragment_index, fragment_count, payload_hex }) =>
        ({ message_id, tick, fragment_index, fragment_count, payload_hex })),
  }));
  expect(rebuilt).toEqual(records);

  /* ---- The capture window is load-bearing: the default scope under-counts.
   *      a_refine_query, then run the same expression on the opening scope. ---- */
  await page.click('#btn-refine');
  await atSurface(page, 'session_search');
  walked();
  await page.selectOption('#scope-select', 'latest_segment');
  await page.click('#btn-run-query');
  await atSurface(page, 'session_index');
  walked();
  const narrow = Number(await page.locator('#result-count').getAttribute('data-matched'));
  expect(narrow, 'the opening capture window holds only part of the stored set').toBeLessThan(records.length);
  expect(narrow).toBeGreaterThan(0);

  /* ---- a_home_from_index ---- */
  await page.click('#rail a[data-nav="home"]');
  await atSurface(page, 'capture_home');
  walked();

  placements.push({
    source: 'records.json',
    path: ['a_open_search', 'a_widen_window', 'a_run_query', 'a_open_session', 'a_select_frame'],
    pieces_retrieved: framesRetrieved.length,
    matched: true,
    piece_unit: 'frame (path walked once per frame)',
    actions_walked: actionsWalked,
    detail: {
      sessions_retrieved: ALL_SESSION_IDS.length,
      result_header_matched: matched,
      matched_under_default_window: narrow,
      state: 'frame_bytes',
    },
  });
});

/* ================================================================== *
 * 2. rules.json — a record that has to be located before it can be read
 * ================================================================== */

test('rules.json: the in-force replay profile is reached by re-sorting the library', async ({ page, request }) => {
  const before = actionsWalked;

  /* ---- a_open_profiles ---- */
  await page.goto('/#/');
  await atSurface(page, 'capture_home');
  await page.click('#rail a[data-nav="profiles"]');
  await atSurface(page, 'profile_library');
  walked();

  /* Under the default ordering the in-force profile is not on the listing, and
   * no ordering of the library publishes a parameter. */
  expect(await page.locator('#surface').getAttribute('data-profile-order')).toBe('last_modified');
  const defaultRows = await page.locator('#profile-table tbody tr').count();
  const defaultJson = JSON.stringify(await (await request.get('/api/profiles?order=last_modified')).json());
  expect(defaultJson.includes('in_force'), 'the in-force profile is not listed by default').toBe(false);
  const inForceLinks = await page.locator('#profile-table a').evaluateAll(
    (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
  expect(inForceLinks.some((h) => h && h.includes('trace-replay')), 'not reachable by default').toBe(false);

  for (const where of [['profile_library DOM', await surfaceText(page)], ['GET /api/profiles', defaultJson]] as const) {
    assertAbsent(where[1], [rules.mode, rules.key, 'strict_fragment_drop', String(rules.strict_fragment_drop)], where[0]);
    assertAbsent(where[1], rules.protocol_order, where[0]);
    assertAbsent(where[1], ALL_SESSION_IDS.concat(ALL_MESSAGE_IDS), where[0]);
    assertAbsent(where[1], [contract.schema_version, contract.errors.exception], where[0]);
  }

  /* ---- a_sort_profiles: group by status, which brings it onto the listing ---- */
  await page.click('#btn-order-status');
  await atSurface(page, 'profile_library');
  walked();
  expect(await page.locator('#surface').getAttribute('data-profile-order')).toBe('status');
  const statusRows = await page.locator('#profile-table tbody tr').count();
  expect(statusRows).toBeGreaterThan(defaultRows);
  // Still no parameter on the library itself.
  assertAbsent(await surfaceText(page), [rules.mode, rules.key, 'strict_fragment_drop'], 'profile_library (by status)');

  const inForceRow = page.locator('#profile-table tbody tr').first();
  const inForceSlug = await inForceRow.getAttribute('data-slug');
  expect(inForceSlug).toBeTruthy();

  /* ---- a_open_profile ---- */
  await page.click(`#profile-table a[data-open-profile="${inForceSlug}"]`);
  await atSurface(page, 'profile_detail');
  walked();

  const mode = (await page.locator('#param-mode').innerText()).trim();
  const key = (await page.locator('#param-key').innerText()).trim();
  // The switch renders as its literal JSON token, so parsing it is exact.
  const strict = (await page.locator('#param-strict-fragment-drop').innerText()).trim();

  const dispatchPositions = await cells(page, '#dispatch-table tbody tr', 'position');
  const dispatchProtocols = await cells(page, '#dispatch-table tbody tr', 'protocol');
  const dispatch = dispatchPositions
    .map((p, i) => ({ position: Number(p.trim()), protocol: dispatchProtocols[i].trim() }))
    .sort((a, b) => a.position - b.position);

  const retrievedPolicy = {
    mode,
    key,
    protocol_order: dispatch.map((d) => d.protocol),
    strict_fragment_drop: JSON.parse(strict),
  };
  expect(retrievedPolicy).toEqual(rules);
  // Positions are labelled 1..n, so the dispatch order is read, not guessed.
  expect(dispatch.map((d) => d.position)).toEqual(rules.protocol_order.map((_: string, i: number) => i + 1));

  /* The parameter record carries no session data, no contract clause, no case. */
  const detailDom = await surfaceText(page);
  assertAbsent(detailDom, ALL_SESSION_IDS.concat(ALL_MESSAGE_IDS).concat(ALL_PAYLOADS.map((p) => `"${p}"`)), 'profile_detail DOM');
  assertAbsent(detailDom, [contract.schema_version, contract.errors.exception, contract.encoding], 'profile_detail DOM');
  assertAbsent(detailDom, CASE_IDS, 'profile_detail DOM');

  /* ---- a_back_to_profiles, then confirm superseded records publish nothing ---- */
  await page.click('#btn-back-profiles');
  await atSurface(page, 'profile_library');
  walked();
  const supersededSlug = await page.locator('#profile-table tbody tr:not(:first-child)').first().getAttribute('data-slug');
  await page.click(`#profile-table a[data-open-profile="${supersededSlug}"]`);
  await atSurface(page, 'profile_detail');
  walked();
  expect(await page.locator('#withheld-notice').count(), 'superseded profiles withhold parameters').toBe(1);
  expect(await page.locator('#param-mode').count()).toBe(0);
  const supersededJson = JSON.stringify(await (await request.get(`/api/profile/${supersededSlug}`)).json());
  assertAbsent(supersededJson, [rules.mode, rules.key, 'strict_fragment_drop'], 'superseded profile payload');
  assertAbsent(supersededJson, rules.protocol_order, 'superseded profile payload');
  assertAbsent(await surfaceText(page), [rules.mode, rules.key], 'superseded profile_detail DOM');

  /* ---- a_search_profiles is the declared substitute for a_sort_profiles ---- */
  await page.click('#btn-back-profiles');
  await atSurface(page, 'profile_library');
  walked();
  await page.click('#btn-order-modified');
  await atSurface(page, 'profile_library');
  await page.fill('#profile-search', 'trace replay');
  await page.click('#btn-search-profiles');
  await atSurface(page, 'profile_library');
  walked();
  expect(await page.locator('#surface').getAttribute('data-profile-order')).toBe('name_search');
  expect(await page.locator(`#profile-table a[data-open-profile="${inForceSlug}"]`).count(),
    'searching by name is an equivalent way to surface it').toBe(1);

  /* ---- a_home_from_profiles ---- */
  await page.click('#rail a[data-nav="home"]');
  await atSurface(page, 'capture_home');
  walked();

  placements.push({
    source: 'rules.json',
    path: ['a_open_profiles', 'a_sort_profiles', 'a_open_profile'],
    pieces_retrieved: 1,
    matched: true,
    piece_unit: 'parameter record (whole, on one surface)',
    actions_walked: actionsWalked - before,
    detail: {
      state: 'profile_detail',
      alternate_path: ['a_open_profiles', 'a_search_profiles', 'a_open_profile'],
      parameters_retrieved: Object.keys(rules).length,
    },
  });
});

/* ================================================================== *
 * 3. output_contract.json — a sequential five-page reference
 * ================================================================== */

test('output_contract.json: the format reference is read a page at a time', async ({ page, request }) => {
  const before = actionsWalked;
  const pageJson: Record<string, string> = {};
  for (const id of ['front', 'input', 'output', 'rejection', 'baseline']) {
    pageJson[id] = JSON.stringify(await (await request.get(`/api/reference/${id}`)).json());
  }

  /* ---- a_open_reference ---- */
  await page.goto('/#/');
  await atSurface(page, 'capture_home');
  await page.click('#rail a[data-nav="reference"]');
  await atSurface(page, 'spec_front');
  walked();

  /* Page 1 — front matter. */
  expect((await page.locator('#ref-schema-version').innerText()).trim()).toBe(contract.schema_version);
  expect((await page.locator('#ref-encoding').innerText()).trim()).toBe(contract.encoding);
  const contents = await page.locator('#ref-contents li').allInnerTexts();
  expect(contents.length, 'the front matter lists the pages that follow').toBe(4);
  // Nothing but titles: no later page's body is legible here.
  const frontDom = await surfaceText(page);
  assertAbsent(frontDom, contract.input_record_contract.record_fields, 'spec_front DOM');
  assertAbsent(frontDom, contract.input_record_contract.frame_fields, 'spec_front DOM');
  assertAbsent(frontDom, contract.output.exact_property_order, 'spec_front DOM');
  assertAbsent(frontDom, contract.errors.conditions.concat([contract.errors.exception]), 'spec_front DOM');
  assertAbsent(frontDom, contract.artifacts.map((a: any) => a.path), 'spec_front DOM');
  expect(await page.locator('#ref-baseline').count()).toBe(0);
  // A sequential document: exactly one forward link, no jump index.
  expect(await page.locator('#ref-next').count()).toBe(1);
  expect(await page.locator('#ref-prev').count()).toBe(0);

  /* ---- a_page_to_input ---- */
  await page.click('#ref-next');
  await atSurface(page, 'spec_input');
  walked();

  expect((await page.locator('#ref-toplevel-required').innerText()).split(',').map((s) => s.trim()))
    .toEqual(contract.input_top_level.required);
  expect((await page.locator('#ref-toplevel-closed').innerText()).includes('rejected'))
    .toBe(contract.input_top_level.additionalProperties === false);

  // Each field spec is split at its first colon for display; rejoining is exact.
  const rejoin = async (sel: string) => {
    const names = await cells(page, `${sel} tbody tr`, 'name');
    const specs = await cells(page, `${sel} tbody tr`, 'spec');
    return names.map((n, i) => `${n.trim()}:${specs[i].trim()}`);
  };
  expect(await rejoin('#ref-record-fields')).toEqual(contract.input_record_contract.record_fields);
  expect(await rejoin('#ref-frame-fields')).toEqual(contract.input_record_contract.frame_fields);

  const inputDom = await surfaceText(page);
  assertAbsent(inputDom, [contract.errors.exception].concat(contract.errors.conditions), 'spec_input DOM');
  assertAbsent(inputDom, contract.artifacts.map((a: any) => a.path), 'spec_input DOM');
  assertAbsent(inputDom, [contract.output.schema.properties.sessions.ordering,
    contract.output.schema.properties.replay_order.ordering], 'spec_input DOM');
  expect(await page.locator('#ref-baseline').count()).toBe(0);

  /* ---- a_page_to_output ---- */
  await page.click('#ref-next');
  await atSurface(page, 'spec_output');
  walked();

  const listItems = async (id: string) =>
    (await page.locator(`#${id} li`).allInnerTexts()).map((t) => t.trim());
  const out = contract.output.schema.properties;
  const sessionItem = out.sessions.items;
  const delivered = sessionItem.properties.delivered_messages;
  const dropped = sessionItem.properties.dropped_messages;

  expect(await listItems('ref-result-key-order')).toEqual(contract.output.exact_property_order);
  expect(await listItems('ref-session-key-order')).toEqual(sessionItem.property_order);
  expect(await listItems('ref-delivered-key-order')).toEqual(delivered.items.property_order);
  expect(await listItems('ref-dropped-key-order')).toEqual(dropped.items.property_order);
  expect((await page.locator('#ref-sessions-ordering').innerText()).trim()).toBe(out.sessions.ordering);
  expect((await page.locator('#ref-delivered-ordering').innerText()).trim()).toBe(delivered.ordering);
  expect((await page.locator('#ref-dropped-ordering').innerText()).trim()).toBe(dropped.ordering);
  expect((await page.locator('#ref-missing-ordering').innerText()).trim())
    .toBe(dropped.items.properties.missing_fragments.ordering);
  expect((await page.locator('#ref-replay-item-type').innerText()).trim()).toBe(out.replay_order.items.type);
  // The replay sequence's element format, membership and full sort-key priority.
  expect((await page.locator('#ref-replay-ordering').innerText()).replace(/\s+/g, ' ').trim())
    .toBe(out.replay_order.ordering.replace(/\s+/g, ' ').trim());
  expect((await page.locator('#ref-matrix-key-order').innerText()).split(',').map((s) => s.trim()))
    .toEqual(out.protocol_matrix.property_order);
  const matrixClasses = await cells(page, '#ref-matrix-classes tbody tr', 'class');
  const matrixCounters = await cells(page, '#ref-matrix-classes tbody tr', 'counters');
  expect(matrixClasses.map((c) => c.trim())).toEqual(out.protocol_matrix.property_order);
  matrixClasses.forEach((c, i) => {
    expect(matrixCounters[i].split(',').map((s) => s.trim()))
      .toEqual(out.protocol_matrix.properties[c.trim()].property_order);
  });

  const publishedRules = (await page.locator('#ref-rules .ref-rule').allInnerTexts()).map((t) => t.replace(/\s+/g, ''));
  expect(publishedRules).toEqual(PUBLISHED_RULE_SENTENCES.map((s) => s.replace(/\s+/g, '')));
  expect((await page.locator('#ref-scheduling-summary').innerText()).replace(/\s+/g, ''))
    .toBe(String(contract.ordering).replace(/\s+/g, ''));

  /* The produced-result page names the in-force profile as the source of the
   * policy-dependent rules and restates none of its values. */
  expect(await page.locator('#ref-policy-pointer').count()).toBe(1);
  const outputDom = await surfaceText(page);
  assertAbsent(outputDom, ['strict_fragment_drop', rules.mode], 'spec_output DOM');
  assertAbsent(outputDom, WITHHELD_RULE_SENTENCES, 'spec_output DOM');
  assertAbsent(outputDom, contract.input_record_contract.record_fields, 'spec_output DOM');
  assertAbsent(outputDom, contract.input_record_contract.frame_fields, 'spec_output DOM');
  assertAbsent(outputDom, [contract.errors.exception], 'spec_output DOM');
  assertAbsent(outputDom, contract.artifacts.map((a: any) => a.path), 'spec_output DOM');
  expect(await page.locator('#ref-baseline').count()).toBe(0);

  /* ---- a_page_to_rejection ---- */
  await page.click('#ref-next');
  await atSurface(page, 'spec_rejection');
  walked();

  expect((await page.locator('#ref-exception').innerText()).trim()).toBe(contract.errors.exception);
  expect((await page.locator('#ref-conditions .ref-condition').allInnerTexts()).map((t) => t.trim()))
    .toEqual(contract.errors.conditions);
  expect((await page.locator('#ref-immutability').innerText()).length,
    'the run leaves the caller’s arguments deeply unmutated').toBeGreaterThan(0);
  expect((await page.locator('#ref-offline').innerText()).includes('offline'))
    .toBe(contract.execution.offline === true);
  expect((await page.locator('#ref-python').innerText()).trim()).toBe(contract.execution.python);
  // Time limits print with a unit suffix; the integer is what the contract fixes.
  expect(Number((await page.locator('#ref-impl-timeout').innerText()).replace(/[^0-9]/g, '')))
    .toBe(contract.execution.implementation_timeout_seconds);
  expect(Number((await page.locator('#ref-test-timeout').innerText()).replace(/[^0-9]/g, '')))
    .toBe(contract.execution.submitter_test_timeout_seconds);

  const artifactPaths = await cells(page, '#ref-artifacts tbody tr', 'path');
  const artifactRequired = await cells(page, '#ref-artifacts tbody tr', 'required');
  const artifactDetail = await cells(page, '#ref-artifacts tbody tr', 'detail');
  expect(artifactPaths.map((p) => p.trim())).toEqual(contract.artifacts.map((a: any) => a.path));
  contract.artifacts.forEach((a: any, i: number) => {
    expect(artifactRequired[i].trim()).toBe(a.required ? 'yes' : 'no');
    for (const v of [a.interface, a.format, a.execution].filter(Boolean)) {
      expect(artifactDetail[i]).toContain(v);
    }
    for (const s of a.sections || []) expect(artifactDetail[i]).toContain(s);
  });

  const rejectionDom = await surfaceText(page);
  assertAbsent(rejectionDom, ['strict_fragment_drop'], 'spec_rejection DOM');
  assertAbsent(rejectionDom, WITHHELD_RULE_SENTENCES, 'spec_rejection DOM');
  assertAbsent(rejectionDom, contract.input_record_contract.frame_fields, 'spec_rejection DOM');
  assertAbsent(rejectionDom, [out.sessions.ordering, out.replay_order.ordering], 'spec_rejection DOM');
  expect(await page.locator('#ref-baseline').count(), 'the baseline is not on this page').toBe(0);

  /* ---- a_page_to_baseline ---- */
  await page.click('#ref-next');
  await atSurface(page, 'spec_baseline');
  walked();

  // The block is the contract's own literal; parsing it is an exact round trip.
  const baseline = JSON.parse(await page.locator('#ref-baseline').innerText());
  expect(baseline).toEqual(contract.empty_input_result);
  expect(Object.keys(baseline), 'the baseline keeps the contract’s key order')
    .toEqual(Object.keys(contract.empty_input_result));
  for (const cls of Object.keys(contract.empty_input_result.protocol_matrix)) {
    expect(Object.keys(baseline.protocol_matrix[cls]))
      .toEqual(Object.keys(contract.empty_input_result.protocol_matrix[cls]));
  }

  const baselineDom = await surfaceText(page);
  assertAbsent(baselineDom, [contract.errors.exception].concat(contract.errors.conditions), 'spec_baseline DOM');
  assertAbsent(baselineDom, contract.input_record_contract.record_fields, 'spec_baseline DOM');
  assertAbsent(baselineDom, contract.artifacts.map((a: any) => a.path), 'spec_baseline DOM');
  assertAbsent(baselineDom, [out.replay_order.ordering, out.sessions.ordering], 'spec_baseline DOM');
  assertAbsent(baselineDom, ['strict_fragment_drop', rules.mode], 'spec_baseline DOM');
  expect(await page.locator('#ref-next').count(), 'the baseline closes the document').toBe(0);

  /* Paging is reversible the whole way back — nothing here is a one-way door. */
  await page.click('#ref-prev');
  await atSurface(page, 'spec_rejection');
  walked();
  await page.click('#ref-prev');
  await atSurface(page, 'spec_output');
  walked();
  await page.click('#ref-prev');
  await atSurface(page, 'spec_input');
  walked();
  await page.click('#ref-prev');
  await atSurface(page, 'spec_front');
  walked();

  /* No reference page — nor the payload it fetches — carries the policy, a
   * session value, or a regression case. */
  for (const [id, json] of Object.entries(pageJson)) {
    assertAbsent(json, ['strict_fragment_drop', 'public_example'], `GET /api/reference/${id}`);
    assertAbsent(json, WITHHELD_RULE_SENTENCES, `GET /api/reference/${id}`);
    assertAbsent(json, ALL_SESSION_IDS.concat(ALL_MESSAGE_IDS), `GET /api/reference/${id}`);
    assertAbsent(json, ALL_PAYLOADS.map((p) => `"${p}"`), `GET /api/reference/${id}`);
    assertAbsent(json, CASE_IDS, `GET /api/reference/${id}`);
    for (const c of INVARIANT_CASES) if (c.rule) expect(json.includes(c.rule)).toBe(false);
  }
  // Each page's payload carries only its own page.
  expect(pageJson.front.includes(contract.output.exact_property_order.join('","'))).toBe(false);
  expect(pageJson.input.includes(contract.errors.exception)).toBe(false);
  expect(pageJson.output.includes(contract.errors.exception)).toBe(false);
  expect(pageJson.rejection.includes(out.replay_order.ordering)).toBe(false);
  expect(pageJson.baseline.includes(contract.errors.exception)).toBe(false);
  expect(pageJson.baseline.includes(contract.input_record_contract.record_fields[0])).toBe(false);

  /* ---- a_home_from_reference ---- */
  await page.click('#btn-close-reference');
  await atSurface(page, 'capture_home');
  walked();

  placements.push({
    source: 'output_contract.json',
    path: ['a_open_reference', 'a_page_to_input', 'a_page_to_output', 'a_page_to_rejection', 'a_page_to_baseline'],
    pieces_retrieved: 5,
    matched: true,
    piece_unit: 'reference page (front, input, output, rejection, baseline)',
    actions_walked: actionsWalked - before,
    detail: { state: 'spec_baseline', paging_reversible: true },
  });
});

/* ================================================================== *
 * 4. public_edge_cases.json — two mutually exclusive kinds of case
 * ================================================================== */

test('public_edge_cases.json: each kind of regression case is opened from the suite header', async ({ page, request }) => {
  const before = actionsWalked;

  /* ---- a_open_regression ---- */
  await page.goto('/#/');
  await atSurface(page, 'capture_home');
  await page.click('#rail a[data-nav="regression"]');
  await atSurface(page, 'regression_suite');
  walked();

  expect(Number((await page.locator('#suite-case-count').innerText()).trim())).toBe(suite.cases.length);
  expect((await page.locator('#suite-schema-version').innerText()).trim()).toBe(suite.schema_version);

  /* The suite header shows the tally and the two controls, never a case. */
  const suiteDom = await surfaceText(page);
  assertAbsent(suiteDom, CASE_IDS, 'regression_suite DOM');
  assertAbsent(suiteDom, [contract.errors.exception], 'regression_suite DOM');
  for (const c of INVARIANT_CASES) if (c.rule) expect(suiteDom.includes(c.rule)).toBe(false);
  expect(await page.locator('#case-table').count(), 'no cases before a kind is chosen').toBe(0);

  /* ---- a_open_refusal_cases ---- */
  await page.click('#btn-kind-rejections');
  await atSurface(page, 'regression_rejections');
  walked();

  const refusalIds = (await cells(page, '#case-table tbody tr', 'id')).map((t) => t.trim());
  const refusalErrors = (await cells(page, '#case-table tbody tr', 'expected_error')).map((t) => t.trim());
  const refusalFixtures = (await cells(page, '#case-table tbody tr', 'fixture')).map((t) => t.trim());
  expect(refusalIds).toEqual(REFUSAL_CASES.map((c: any) => c.id));
  expect(refusalErrors).toEqual(REFUSAL_CASES.map((c: any) => c.expected_error));
  // Each row states what the case feeds the engine.
  refusalFixtures.forEach((f, i) => expect(f).toContain(REFUSAL_CASES[i].id.replace(/_/g, ' ')));

  const refusalDom = await surfaceText(page);
  assertAbsent(refusalDom, INVARIANT_CASES.map((c: any) => c.id), 'regression_rejections DOM');
  for (const c of INVARIANT_CASES) if (c.rule) expect(refusalDom.includes(c.rule)).toBe(false);
  assertAbsent(refusalDom, ['session_count', 'protocol_matrix', 'replay_order'], 'regression_rejections DOM');
  assertAbsent(refusalDom, [rules.mode, rules.key, 'strict_fragment_drop'], 'regression_rejections DOM');
  assertAbsent(refusalDom, ALL_SESSION_IDS.concat(ALL_MESSAGE_IDS), 'regression_rejections DOM');

  /* ---- a_back_from_refusals ---- */
  await page.click('#btn-back-suite');
  await atSurface(page, 'regression_suite');
  walked();
  expect(await page.locator('#case-table').count(), 'choosing one kind puts the other away').toBe(0);

  /* ---- a_open_invariant_cases ---- */
  await page.click('#btn-kind-invariants');
  await atSurface(page, 'regression_invariants');
  walked();

  const invIds = (await cells(page, '#case-table tbody tr', 'id')).map((t) => t.trim());
  const invAssertions = (await cells(page, '#case-table tbody tr', 'assertion')).map((t) => t.trim());
  expect(invIds).toEqual(INVARIANT_CASES.map((c: any) => c.id));
  INVARIANT_CASES.forEach((c: any, i: number) => {
    if (c.rule !== undefined) {
      expect(invAssertions[i]).toBe(c.rule);
    } else {
      // The case pinned to the empty capture names the baseline page instead of
      // reprinting it, so the concrete baseline keeps a single home.
      expect(invAssertions[i].toLowerCase()).toContain('baseline');
      expect(invAssertions[i]).not.toContain('session_count');
    }
  });

  const invDom = await surfaceText(page);
  assertAbsent(invDom, REFUSAL_CASES.map((c: any) => c.id), 'regression_invariants DOM');
  assertAbsent(invDom, [contract.errors.exception], 'regression_invariants DOM');
  assertAbsent(invDom, ['session_count', 'protocol_matrix', 'replay_order'], 'regression_invariants DOM');
  assertAbsent(invDom, [rules.mode, rules.key, 'strict_fragment_drop'], 'regression_invariants DOM');

  /* Neither kind's payload carries the other kind. */
  const rejJson = JSON.stringify(await (await request.get('/api/regression/rejections')).json());
  const invJson = JSON.stringify(await (await request.get('/api/regression/invariants')).json());
  const hdrJson = JSON.stringify(await (await request.get('/api/regression')).json());
  assertAbsent(rejJson, INVARIANT_CASES.map((c: any) => c.id), 'GET /api/regression/rejections');
  assertAbsent(invJson, REFUSAL_CASES.map((c: any) => c.id), 'GET /api/regression/invariants');
  assertAbsent(hdrJson, CASE_IDS, 'GET /api/regression');
  assertAbsent(invJson, ['session_count', 'protocol_matrix', 'replay_order'], 'GET /api/regression/invariants');

  /* Everything the suite file holds came back, split across the two surfaces. */
  const rebuilt = [
    ...INVARIANT_CASES.map((c: any, i: number) => c.rule !== undefined
      ? { id: invIds[i], rule: invAssertions[i] }
      : { id: invIds[i] }),
    ...REFUSAL_CASES.map((c: any, i: number) => ({ id: refusalIds[i], expected_error: refusalErrors[i] })),
  ];
  const expected = [
    ...INVARIANT_CASES.map((c: any) => c.rule !== undefined ? { id: c.id, rule: c.rule } : { id: c.id }),
    ...REFUSAL_CASES.map((c: any) => ({ id: c.id, expected_error: c.expected_error })),
  ];
  expect(rebuilt).toEqual(expected);

  /* ---- a_home_from_regression, via the suite header ---- */
  await page.click('#btn-back-suite');
  await atSurface(page, 'regression_suite');
  walked();
  await page.click('#rail a[data-nav="home"]');
  await atSurface(page, 'capture_home');
  walked();

  placements.push({
    source: 'public_edge_cases.json',
    path: ['a_open_regression', 'a_open_refusal_cases', 'a_back_from_refusals', 'a_open_invariant_cases'],
    pieces_retrieved: suite.cases.length,
    matched: true,
    piece_unit: 'regression case',
    actions_walked: actionsWalked - before,
    detail: {
      state: 'regression_invariants',
      refusal_cases: REFUSAL_CASES.length,
      invariant_cases: INVARIANT_CASES.length,
      empty_capture_case_resolved_on: 'spec_baseline',
    },
  });
});

/* ================================================================== *
 * 5. The staged files are not served whole
 * ================================================================== */

test('the staged input is not reachable except through the interface', async ({ request }) => {
  for (const p of ['/input/records.json', '/input/rules.json', '/input/output_contract.json',
                   '/input/public_edge_cases.json', '/records.json', '/api/records',
                   '/api/input/records.json']) {
    const res = await request.get(p);
    expect(res.status(), `${p} is not served`).toBeGreaterThanOrEqual(400);
  }
  // deidentification_manifest.json stays on disk for the agent to read directly
  // and is rendered nowhere; it must not be reachable over HTTP either.
  expect((await request.get('/input/deidentification_manifest.json')).status()).toBeGreaterThanOrEqual(400);
});

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:8130';
const D = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const RUNS = D('runs.json').rows as any[];
const RESULTS = D('results.json').rows as any[];
const BATCHES = D('batches.json').rows as any[];

async function openColMenu(page: Page, caption: string) {
  await page.locator(`td.labkey-column-header:has-text("${caption}") .js-colmenu`).first().click();
  await expect(page.locator('.lk-menu')).toBeVisible();
}

test('网格骨架：工具条 / 翻页 / 列头菜单 / 筛选 / 排序 / 选择', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(`${BASE}/results.html`);
  await expect(page.locator('.labkey-data-region')).toBeVisible();

  // 分页：100/页，总数等于全部结果行
  await expect(page.locator('.labkey-paginationText')).toHaveText(`1 - 100 of ${RESULTS.length}`);
  await page.locator('.js-next').click();
  await expect(page.locator('.labkey-paginationText')).toHaveText(`101 - 200 of ${RESULTS.length}`);
  await page.locator('.js-prev').click();
  await expect(page.locator('.labkey-paginationText')).toHaveText(`1 - 100 of ${RESULTS.length}`);

  // 列头菜单条目照真站
  await openColMenu(page, 'Sample Id');
  for (const t of ['Sort Ascending', 'Sort Descending', 'Clear Sort', 'Filter...', 'Clear Filter',
                   'Remove Column', 'Summary Statistics...', 'Bar Chart', 'Pie Chart', 'Quick Chart']) {
    await expect(page.locator('.lk-menu .item', { hasText: t }).first()).toBeVisible();
  }
  await expect(page.locator('.lk-menu .item', { hasText: 'Clear Sort' })).toHaveClass(/disabled/);

  // 排序
  await page.locator('.lk-menu .item', { hasText: 'Sort Descending' }).click();
  const firstSample = await page.locator('tbody tr td:nth-child(2)').first().textContent();
  const maxSample = RESULTS.map(r => String(r.ParticipantID)).sort().reverse()[0];
  expect(firstSample!.trim()).toBe(maxSample);

  // 筛选：Cell Count > 0 —— 逐行核对结果确实都 > 0
  await openColMenu(page, 'Cell Count');
  await page.locator('.lk-menu .item', { hasText: 'Filter...' }).click();
  await expect(page.locator('.lk-dialog')).toBeVisible();
  await page.locator('.js-op').selectOption('gt');
  await page.locator('.js-val').fill('0');
  await page.locator('.js-ok').click();
  await expect(page.locator('.lk-chip')).toContainText('Cell Count > 0');
  const expectN = RESULTS.filter(r => Number(r.cellCount) > 0).length;
  await expect(page.locator('.labkey-paginationText')).toContainText(`of ${expectN}`);
  for (const v of await page.locator('tbody tr td:nth-child(5)').allTextContents()) {
    expect(Number(v.trim())).toBeGreaterThan(0);
  }

  // 移除筛选芯片
  await page.locator('.lk-chip .x').click();
  await expect(page.locator('.lk-chip')).toHaveCount(0);
  await expect(page.locator('.labkey-paginationText')).toContainText(`of ${RESULTS.length}`);

  // 行选择
  await page.locator('.js-sel').first().check();
  await expect(page.locator('.js-sel').first()).toBeChecked();

  expect(errs).toEqual([]);
});

test('三层导航：Batches → Runs → Results，Run 芯片可移除', async ({ page }) => {
  await page.goto(`${BASE}/batches.html`);
  await expect(page.locator('tbody tr')).toHaveCount(BATCHES.length);

  await page.goto(`${BASE}/runs.html`);
  await expect(page.locator('tbody tr')).toHaveCount(RUNS.length);
  for (const r of RUNS) {
    // 按行主键定位，不能按文本 —— Replaces / Replaced By 列里也写着别的 run 的名字
    const tr = page.locator(`tbody tr[data-key="${r.RowId}"]`);
    await expect(tr).toContainText(r.QCFlags);
    await expect(tr.locator('td').nth(2)).toHaveText(r.Name);
  }
  // 复测血缘：被替代的 run 的 Replaced By 指向替代它的 run
  const replaced = RUNS.filter(r => r.ReplacedByRun)[0];
  if (replaced) {
    const by = RUNS.filter(x => x.RowId === replaced.ReplacedByRun)[0];
    await expect(page.locator(`tbody tr[data-key="${replaced.RowId}"]`)).toContainText(by.Name);
    await expect(page.locator(`tbody tr[data-key="${by.RowId}"]`)).toContainText(replaced.Name);
  }

  // 点 Assay ID 进结果，落一个可移除的 Run 芯片
  const run = RUNS[0];
  await page.locator(`a[href="results.html?run=${run.RowId}"]`).first().click();
  await expect(page.locator('.lk-chip')).toContainText(`Run = ${run.RowId}`);
  const n = RESULTS.filter(r => r.Run === run.RowId).length;
  await expect(page.locator('.labkey-paginationText')).toContainText(`of ${n}`);
  await page.locator('.lk-chip .x').click();
  await expect(page.locator('.labkey-paginationText')).toContainText(`of ${RESULTS.length}`);
});

test('QC：三个具名视图各自过滤到对应状态，被拒批次的结果行标为排除', async ({ page }) => {
  await page.goto(`${BASE}/qc.html`);
  await expect(page.locator('#grid tbody tr')).toHaveCount(RUNS.length);

  const states: [string, string][] = [
    ['Reviewed - Passed', 'Results - Passed QC Review'],
    ['Reviewed - Rejected', 'Results - Did Not Pass QC Review'],
    ['Not Yet Reviewed', 'Results - Not Yet Reviewed'],
  ];
  for (const [state, viewName] of states) {
    await page.goto(`${BASE}/qc.html`);
    await page.locator('a', { hasText: viewName }).click();
    await expect(page.locator('.lk-viewchip')).toHaveText(viewName);
    const runIds = RUNS.filter(r => r.QCFlags === state).map(r => r.RowId);
    const n = RESULTS.filter(r => runIds.includes(r.Run)).length;
    await expect(page.locator('.labkey-paginationText')).toContainText(`of ${n}`);
    for (const v of await page.locator('tbody tr td:nth-child(10)').allTextContents()) {
      expect(v.trim()).toBe(state);
    }
  }

  // 被拒批次：整行灰显 + 有剔除理由
  const rejected = RUNS.filter(r => r.QCFlags === 'Reviewed - Rejected');
  expect(rejected.length).toBeGreaterThan(0);
  await page.goto(`${BASE}/results.html?run=${rejected[0].RowId}`);
  await expect(page.locator('tbody tr.excluded').first()).toBeVisible();
  await expect(page.locator('tbody tr.excluded td:nth-child(12)').first()).not.toBeEmpty();

  // Excluded Data 视图
  await page.goto(`${BASE}/results.html?excluded=1`);
  await expect(page.locator('.lk-viewchip')).toHaveText('Excluded Data');
  const nEx = RESULTS.filter(r => r.FlaggedAsExcluded).length;
  await expect(page.locator('.labkey-paginationText')).toContainText(`of ${nEx}`);
});

test('导出：面板照真站，导出内容遵守当前筛选', async ({ page }) => {
  await page.goto(`${BASE}/results.html?run=${RUNS[1].RowId}`);
  await page.locator('.js-export').click();
  await expect(page.locator('.lk-export')).toBeVisible();

  for (const t of ['Excel', 'Text', 'Script']) {
    await expect(page.locator('.js-xtab', { hasText: t })).toBeVisible();
  }
  await expect(page.locator('.lk-export')).toContainText('Excel Workbook (.xlsx)');
  await expect(page.locator('.lk-export')).toContainText('Maximum 1,048,576 rows and 16,384 columns.');
  await expect(page.locator('.js-xsel')).toBeDisabled();      // 未选行时禁用

  await page.locator('.js-xtab', { hasText: 'Text' }).click();
  await expect(page.locator('.js-sep')).toBeVisible();
  await page.locator('.js-sep').selectOption(',');

  const dl = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.js-dox').click(),
  ]);
  const file = await dl[0].path();
  const text = fs.readFileSync(file!, 'utf8').replace(/^﻿/, '');
  const lines = text.trim().split(/\r?\n/);
  const n = RESULTS.filter(r => r.Run === RUNS[1].RowId).length;
  expect(lines.length).toBe(n + 1);                            // 表头 + 数据行
  expect(lines[0]).toContain('Sample Id');
  expect(lines[0]).toContain('Exclusion Comment');
  expect(dl[0].suggestedFilename()).toMatch(/\.csv$/);
});

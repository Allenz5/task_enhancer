import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8099';

test('搜索 → 筛选 → 翻页 → 点卡片 → 读详情 → 收藏 → 收藏夹', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(`${BASE}/index.html`);
  await expect(page.locator('.job-card-box')).toHaveCount(15);
  const total0 = await page.locator('.result-count').textContent();
  expect(total0).toContain('为你找到');

  // 翻页
  await page.locator('.page a', { hasText: '2' }).first().click();
  await expect(page.locator('.page a.cur')).toHaveText('2');
  await expect(page.locator('.job-card-box').first()).toBeVisible();
  await page.locator('.page a', { hasText: '1' }).first().click();

  // 筛选：学历要求 = 本科
  const dd = page.locator('.dd[data-key="jobDegree"]');
  await dd.locator('.dd-label').click();
  await dd.locator('.dd-menu li', { hasText: '本科' }).click();
  await expect(dd.locator('.dd-label')).toHaveText(/本科/);
  const n = await page.locator('.job-card-box').count();
  expect(n).toBeGreaterThan(0);
  for (const t of await page.locator('.job-card-box .tag-list').allTextContents()) {
    expect(t).toContain('本科');
  }

  // 筛选：薪资 20-50K，叠加生效
  const sd = page.locator('.dd[data-key="salaryDesc"]');
  await sd.locator('.dd-label').click();
  await sd.locator('.dd-menu li', { hasText: '20-50K' }).click();
  await expect(sd.locator('.dd-label')).toHaveText('20-50K');

  // 空结果态
  await page.locator('#q').fill('绝不存在的岗位xyz');
  await page.locator('#btnSearch').click();
  await expect(page.locator('#noResult')).toBeVisible();

  // 清空
  await page.locator('#q').fill('');
  await page.locator('#btnSearch').click();
  await page.locator('#btnClear').click();
  await expect(page.locator('.job-card-box')).toHaveCount(15);

  // 点第 3 张卡 → 右面板换内容，不跳页
  const url0 = page.url();
  const card = page.locator('.job-card-box').nth(2);
  const name = (await card.locator('.job-name').textContent())!.trim();
  await card.click();
  await expect(card).toHaveClass(/active/);
  await expect(page.locator('.job-detail-header .job-name')).toHaveText(name);
  expect(page.url()).toBe(url0);
  await expect(page.locator('.job-detail-desc')).toContainText('岗位职责');
  await expect(page.locator('.job-address-desc')).not.toBeEmpty();

  // 收藏 → 收藏夹能查到
  await page.locator('#btnLike').click();
  await expect(page.locator('#btnLike')).toHaveText(/已收藏/);
  await page.goto(`${BASE}/favorites.html`);
  await expect(page.locator('#favTable tbody tr')).toHaveCount(1);
  await expect(page.locator('#favTable tbody tr td').first()).toHaveText(name);

  // 独立详情页
  await page.locator('#favTable .job-name').click();
  await expect(page.locator('.job-banner h1')).toHaveText(name);
  await expect(page.locator('.job-banner .salary')).not.toBeEmpty();
  await expect(page.locator('.job-sider')).toContainText('公司基本信息');

  // 公司页
  await page.locator('.job-sider .more-job-btn').click();
  await expect(page.locator('.company-banner h1')).not.toBeEmpty();
  await expect(page.locator('.hot-job').first()).toBeVisible();
  await expect(page.locator('.kv dt').first()).toBeVisible();

  expect(errs).toEqual([]);
});

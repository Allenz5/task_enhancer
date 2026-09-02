/*
 * ground_truth.spec.ts —— 证明 mapping.json 放进界面的每一条样本数据，都能原样从界面里取回来。
 *
 * 本文件遵守的规矩：
 *   - 不硬写任何数据值。所有期望都在运行时从 ./input/samples.json 读，
 *     站点从 ./data/*.json 渲染，两边是同一份来源生成的。
 *   - 每条样本都按它自己声明的「来源定位」走：
 *       A 级（企业官方岗位页）→ 先进公司页确认，再进岗位页；
 *       B 级（公开招聘平台）  → 走平台搜索列表 → 点卡片 → 独立岗位页。
 *   - 证据短语必须在详情正文里逐字取到（任务要求结论可回查证据短语），
 *     且不出现在列表卡上 —— 即：不打开详情就拿不到。
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const INPUT = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'input', 'samples.json'), 'utf8')
);
const SAMPLES = INPUT.samples as any[];
const ABILITIES = INPUT.abilities as string[];

type Placement = { sampleId: string; grade: string; via: string; fields: number; ok: boolean };
const LEDGER: Placement[] = [];

/* 打开某个城市的搜索页并把城市切过去 */
async function switchCity(page: Page, city: string) {
  const dd = page.locator('.dd[data-key="cityName"]');
  if ((await dd.locator('.dd-label').textContent())?.includes(city)) return;
  await dd.locator('.dd-label').click();
  await dd.locator('.dd-menu li', { hasText: new RegExp(`^${city}$`) }).click();
  await expect(dd.locator('.dd-label')).toContainText(city);
}

test.describe('24 条岗位样本的可取回性', () => {

  test('骨架契约：页面、筛选维度、翻页都在', async ({ page }) => {
    await page.goto('/index.html');
    // 10 个筛选维度（城市 + 9 个）
    await expect(page.locator('.c-filter-condition .dd')).toHaveCount(10);
    await expect(page.locator('#btnClear')).toBeVisible();
    // 默认城市下有结果，且每页 5 条以内
    const n = await page.locator('.job-card-box').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(5);
    // 样本量 > 每页容量的城市必须真的出翻页
    const counts: Record<string, number> = {};
    for (const s of SAMPLES) counts[s.城市] = (counts[s.城市] || 0) + 1;
    const paged = Object.entries(counts).filter(([, c]) => c > 5).map(([c]) => c);
    for (const city of paged) {
      await switchCity(page, city);
      await expect(page.locator('.page a.cur')).toBeVisible();
    }
  });

  test('B 级样本：搜索列表 → 点卡片 → 独立岗位页，证据短语只在详情里', async ({ page }) => {
    const bs = SAMPLES.filter(s => s.来源等级 === 'B');
    expect(bs.length).toBeGreaterThan(0);

    for (const s of bs) {
      await page.goto('/index.html');
      await switchCity(page, s.城市);
      // 走真实检索路径找到它，而不是直接拼 URL
      await page.locator('#q').fill(s.岗位名);
      await page.locator('#btnSearch').click();

      const card = page.locator(`.job-card-box[data-id="${s.样本ID}"]`);
      await expect(card, `样本 ${s.样本ID} 应能在 ${s.城市} 的搜索结果里找到`).toBeVisible();

      // 列表卡上能取到的字段
      await expect(card.locator('.job-name')).toHaveText(s.岗位名);
      await expect(card.locator('.boss-name')).toHaveText(s.公司);
      await expect(card.locator('.company-location')).toContainText(s.城市);
      await expect(card.locator('.tag-list')).toContainText(s.经验年限);
      await expect(card.locator('.tag-list')).toContainText(s.学历);

      // 证据短语不在列表卡上 —— 不打开详情就拿不到
      const cardText = (await card.textContent()) || '';
      for (const a of Object.keys(s.证据短语)) {
        expect(cardText, `${s.样本ID} 的证据短语不应出现在列表卡`).not.toContain(s.证据短语[a]);
      }

      // 点卡片 → 右侧详情换内容，且不跳页
      const before = page.url();
      await card.click();
      await expect(card).toHaveClass(/active/);
      await expect(page.locator('.job-detail-header .job-name')).toHaveText(s.岗位名);
      expect(page.url()).toBe(before);

      // 进独立岗位页（来源定位）读证据短语
      await page.goto('/' + s.来源定位);
      await expect(page.locator('.job-banner h1')).toHaveText(s.岗位名);
      const desc = (await page.locator('.job-detail-desc').innerText());
      let fields = 5;
      for (const a of ABILITIES) {
        const coded = s.能力编码[a] === 1;
        if (coded) {
          expect(desc, `${s.样本ID} 编码为 1 的「${a}」必须能回查到证据短语`)
            .toContain(s.证据短语[a]);
          fields++;
        } else {
          expect(desc, `${s.样本ID} 编码为 0 的「${a}」不应出现证据短语`)
            .not.toContain(INPUT.evidencePhrases[a]);
        }
      }
      LEDGER.push({ sampleId: s.样本ID, grade: 'B', via: '平台搜索→详情', fields, ok: true });
    }
  });

  test('A 级样本：公司页（企业官方）→ 岗位页，来源分层在界面上成立', async ({ page }) => {
    const as = SAMPLES.filter(s => s.来源等级 === 'A');
    expect(as.length).toBeGreaterThan(0);

    for (const s of as) {
      // 来源定位就是公司页
      await page.goto('/' + s.来源定位);
      await expect(page.locator('.company-banner h1')).toHaveText(s.公司);
      const jobCard = page.locator(`.hot-job[href="job.html?jobId=${s.样本ID}"]`);
      await expect(jobCard, `${s.样本ID} 应挂在 ${s.公司} 的官方公司页上`).toBeVisible();
      await expect(jobCard.locator('.n')).toHaveText(s.岗位名);
      await expect(jobCard).toContainText(s.经验年限);
      await expect(jobCard).toContainText(s.学历);
      // 工商信息（真站有，A 级来源可信度的一部分）
      await expect(page.locator('.kv dt').first()).toBeVisible();

      await jobCard.click();
      await expect(page.locator('.job-banner h1')).toHaveText(s.岗位名);
      const desc = await page.locator('.job-detail-desc').innerText();
      let fields = 5;
      for (const a of ABILITIES) {
        if (s.能力编码[a] === 1) {
          expect(desc, `${s.样本ID} 编码为 1 的「${a}」必须能回查到证据短语`)
            .toContain(s.证据短语[a]);
          fields++;
        } else {
          expect(desc).not.toContain(INPUT.evidencePhrases[a]);
        }
      }
      LEDGER.push({ sampleId: s.样本ID, grade: 'A', via: '公司页→岗位页', fields, ok: true });
    }
  });

  test('收藏夹能把跨城市挑出来的样本汇到一张表', async ({ page }) => {
    const picks = SAMPLES.slice(0, 4);
    for (const s of picks) {
      await page.goto('/' + (s.来源等级 === 'B' ? s.来源定位 : `job.html?jobId=${s.样本ID}`));
      await page.locator('#btnCollect').click();
      await expect(page.locator('#btnCollect')).toHaveText('已收藏');
    }
    await page.goto('/favorites.html');
    await expect(page.locator('#favTable tbody tr')).toHaveCount(picks.length);
    for (const s of picks) {
      const row = page.locator(`#favTable tbody tr[data-id="${s.样本ID}"]`);
      await expect(row).toContainText(s.岗位名);
      await expect(row).toContainText(s.公司);
      await expect(row).toContainText(s.城市);
    }
  });

  test.afterAll(() => {
    const covered = new Set(LEDGER.map(p => p.sampleId));
    const missing = SAMPLES.map(s => s.样本ID).filter(id => !covered.has(id));
    // eslint-disable-next-line no-console
    console.log(`\n取回台账：${covered.size}/${SAMPLES.length} 条样本走通；` +
      `字段取回合计 ${LEDGER.reduce((a, p) => a + p.fields, 0)} 项` +
      (missing.length ? `；未覆盖 ${missing.join(',')}` : '；无遗漏'));
    if (missing.length) throw new Error('有样本未走通：' + missing.join(','));
  });
});

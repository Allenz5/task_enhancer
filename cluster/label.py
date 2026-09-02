"""用 catalog.py 那份 42 项品类表，给 489 条候选任务打标 —— 供人工审阅。

跟之前几轮分类的区别：
  · population 是筛完 + 复核回收之后的 489 条，全部确认"来源可以做网页复刻"
  · 选项集是为这批数据量身编的，每项点名一个真实参照产品，不是 G2 的通用市场分类
  · 允许 null，但 null 意味着"这 42 项都不对"，是给人工审阅的信号，不是排除

喂进去的线索：形态族、筛选阶段的记录类型与操作、原文点名的来源、之前判的 G2 品类。
这些都是已经花钱算出来的，不用白不用。

产出 labels.json + labeled.csv
"""
import json, re, csv, collections
import llm, catalog

shp = json.load(open('shape.json'))
sc = json.load(open('screen.json'))
a = json.load(open('audit.json'))
f2 = json.load(open('full2.json'))
named = json.load(open('named_sources.json'))
sm = json.load(open('source_map.json'))
rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
ids = list(shp['assign'])
print(f'{len(ids)} 条候选，{len(catalog.CATALOG)} 项品类')

GOAL = f"""给每条任务判定：**如果要把它的输入数据搬进一个网页界面，该照着下面哪一类网站建。**

这批任务已经过两道筛，确认它们的数据来源是**可以做网页复刻的**（有检索、列表、
详情、导出的那种站）。现在只需要定是哪一类。

判断的是**数据本身的形态与出处**，不是任务要你做什么。一条任务要求你写 Python 分析
招聘数据，答案仍然是招聘岗位站；一条任务要求你搭 Web 服务，但数据是实验批次检验记录，
答案是 LIMS。

每一项都点了参照产品 —— 判的时候想一想：**这份数据倒进那个产品的界面里，摆得下吗？**"""

RULES = f"""每条任务输出一个对象：

{{"id": <编号>, "slug": "<逐字取自品类表>"|null, "confidence": 0.0, "why": "<15 字以内>"}}

- 多个说得通时，选**数据结构最贴**的那个，不是行业最像的那个。
  半导体的批次量测和制药的稳定性检验都是 `lims`，因为都是"批次→结果行+质控"。
- `back-office-ledger` 是内部台账的兜底项，只在前面几类台账都不贴时用。
- 实在没有一项对得上才填 null —— null 会进人工复核，不是被丢弃。

只输出 JSON 数组，无其他文字。"""

BAT = 12
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = []
    for j, c in enumerate(chunk):
        v = shp['assign'][c]
        bits = [f"形态族：{v['family']}"]
        if c in sc and sc[c]['web'] == 'yes':
            bits.append(f"记录：{sc[c]['records']}　操作：{'+'.join(sc[c]['ops'])}")
        if c in a and a[c]['verdict'] == 'web':
            bits.append(f"复核判定来源：{a[c]['source']}")
        s = named.get(c, {}).get('source', '')
        if s:
            bits.append(f"原文点名：{sm.get(s.strip(), {}).get('canonical') or s}")
        if c in f2 and f2[c].get('slug'):
            bits.append(f"G2 品类：{f2[c]['slug']}")
        body.append(f"### 任务 {b*BAT+j}\n（{'；'.join(bits)}）\n"
                    f"task_name: {byid[c]['task_name']}\n"
                    f"industry_domain: {byid[c]['industry_domain']}\n"
                    f"files: {', '.join(byid[c]['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', byid[c]['desc'])[:800]}")
    prompts.append(f'{GOAL}\n\n## 品类表（{len(catalog.CATALOG)} 项）\n\n'
                   f'{catalog.menu_text()}\n\n## 待判断的 {len(chunk)} 条\n\n'
                   + '\n\n'.join(body) + f'\n\n## 输出\n\n{RULES}')
print(f'{len(prompts)} 批 × 每批约 {len(prompts[0]):,} 字符')

A = llm.by_id(llm.ask('label', 'A', prompts))
B = llm.by_id(llm.ask('label', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('slug') != B[j].get('slug')]
miss = [j for j in range(len(ids)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('label', 'C', prompts, only=set(third))) if third else {}

out = {}
for j, c in enumerate(ids):
    vs = [x[j] for x in (A, B, C) if j in x]
    if not vs:
        continue
    picks = [x.get('slug') if x.get('slug') in catalog.SLUGS else None for x in vs]
    slug, n = collections.Counter(picks).most_common(1)[0]
    pick = next((x for x in vs if x.get('slug') == slug), vs[0])
    out[c] = dict(slug=slug, votes=f'{n}/{len(vs)}', why=pick.get('why'),
                  alts=sorted({p for p in picks if p and p != slug}))
json.dump(out, open('labels.json', 'w'), ensure_ascii=False, indent=0)

sz = collections.Counter(v['slug'] for v in out.values() if v['slug'])
print(f'\n═══ {len(out)} 条 → labels.json ═══')
print(f'  有品类 {sum(1 for v in out.values() if v["slug"])} 条，'
      f'null {sum(1 for v in out.values() if not v["slug"])} 条，{len(sz)} 项被用到')
print('  一致度:', dict(collections.Counter(v['votes'] for v in out.values())))
print()
for s, n in sz.most_common():
    zh, ref = catalog.BY_SLUG[s][1], catalog.BY_SLUG[s][2]
    print(f'  {n:4d}  {s:26s} {zh:18s} ← {ref}')
unused = [s for s, *_ in catalog.CATALOG if s not in sz]
if unused:
    print(f'\n  没被用到的 {len(unused)} 项: {", ".join(unused)}')

with open('labeled.csv', 'w', newline='', encoding='utf-8-sig') as fh:
    w = csv.writer(fh)
    w.writerow(['品类', '中文', '参照产品', '族内序号', '一致度', '另一票',
                '任务名', '判据', '形态族', '记录/来源', '原文点名', '行业',
                'custom_id', '我的判断'])
    order = [s for s, _ in sz.most_common()] + [None]
    for s in order:
        grp = [c for c in ids if c in out and out[c]['slug'] == s]
        grp.sort(key=lambda c: (out[c]['votes'], not out[c]['alts']))
        zh, ref = (catalog.BY_SLUG[s][1], catalog.BY_SLUG[s][2]) if s else ('（无匹配）', '')
        for i, c in enumerate(grp, 1):
            v, sp = out[c], shp['assign'][c]
            src = named.get(c, {}).get('source', '')
            if src:
                src = sm.get(src.strip(), {}).get('canonical') or src
            rec = sp.get('records') or (a[c]['source'] if c in a and a[c]['verdict'] == 'web' else '')
            w.writerow([s or '', zh, ref, i, v['votes'], ' / '.join(v['alts']),
                        byid[c]['task_name'][:70], v['why'], sp['family'], rec, src,
                        byid[c]['industry_domain'][:16], c, ''])
print('\nlabeled.csv 已写出')

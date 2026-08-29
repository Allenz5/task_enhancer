"""筛选通过的 327 条，用 G2 首页那份精简分类（289 项）分类。

跟 shape.py 是同一批任务的两种分法，可以直接对照：形态族是模型从数据形态归纳的，
G2 精简版是外部固定的商业软件品类表。看两者对不对得上。

只对 screen.py 判 yes 的跑 —— 之前用精简菜单那次是在未筛选的 896 条上跑的，
population 不一样，结果不可比。
"""
import json, re, collections
import llm

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
sc = json.load(open('screen.json'))
cats = json.load(open('g2_categories.json'))
slim = json.load(open('g2_slim.json'))
named = json.load(open('named_sources.json'))
sm = json.load(open('source_map.json'))

ids = [c for c, v in sc.items() if v['web'] == 'yes']
MENU = '\n\n'.join(f'### {sec}\n' + '\n'.join(f'{s} | {cats[s]}' for s in v)
                   for sec, v in slim.items())
N = sum(len(v) for v in slim.values())
print(f'{len(ids)} 条筛选通过的任务，菜单 {N} 项')

GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
这批任务已经过筛：它们的数据都来自某个**多记录的 Web 界面** —— 一个人要拿到它，
得在界面上搜索、筛选、翻页、点开详情、导出。现在要定的是那是哪一类界面。

不是问用什么工具解题（Python/Excel 之类一律不算）。

**出处优先于场景。** 公开数据集套一个虚构岗位（"你是设备状态监测工程师…"），
出处仍然是数据集仓库，不要改判成场景里的系统。

**原文里出现的软件名未必是数据来源，多数时候不是** —— 可能是解题工具、要生成的
产出物、数据里的一个字段值、或设计参考。判断前先自问那个名字是不是出处。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。"""

RULES = f"""每条给两个判断：

- `slug`：**逐字取自菜单，或者填 null。** 多个都说得通时选最具体的。
  这份菜单只有 {N} 项，覆盖的是通用商业软件。**装不下就填 null，不要硬凑** ——
  null 我们能识别，硬凑的会混进结果里看不出来。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"slug":"..."|null,"confidence":0.0}}, ...]"""

BAT = 12
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = []
    for j, c in enumerate(chunk):
        r = byid[c]
        s = sc[c]
        hint = f"\n（筛选记录：{s['records']}　操作：{'+'.join(s['ops'])}）"
        src = named.get(c, {}).get('source', '')
        if src:
            hint += f"\n（原文点名来源：{sm.get(src.strip(), {}).get('canonical') or src}）"
        body.append(f"### 任务 {b*BAT+j}{hint}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\n"
                    f"files: {', '.join(r['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:500]}")
    prompts.append(f'{GOAL}\n\n## 品类菜单（{N} 项，按分组排列）\n\n{MENU}\n\n'
                   f'## 待判断的 {len(chunk)} 条\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')

A = llm.by_id(llm.ask('slim', 'A', prompts))
B = llm.by_id(llm.ask('slim', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('slug') != B[j].get('slug')]
miss = [j for j in range(len(ids)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('slim', 'C', prompts, only=set(third))) if third else {}

legal = {s for v in slim.values() for s in v}
out = {}
for j, c in enumerate(ids):
    vs = [x[j].get('slug') for x in (A, B, C) if j in x]
    if not vs:
        continue
    vs = [s if s in legal else None for s in vs]
    s, n = collections.Counter(vs).most_common(1)[0]
    out[c] = dict(slug=s, votes=f'{n}/{len(vs)}')
json.dump(out, open('slim.json', 'w'), ensure_ascii=False, indent=0)

hit = {k: v for k, v in out.items() if v['slug']}
sz = collections.Counter(v['slug'] for v in hit.values())
print(f'\n═══ {len(out)} 条 → slim.json ═══')
print(f'  落桶 {len(hit)} 条（{len(hit)*100//len(out)}%），{len(sz)} 个品类，'
      f'单例 {sum(1 for _, n in sz.items() if n == 1)} 个')
print(f'  菜单装不下 {len(out)-len(hit)} 条')
print('  一致度:', dict(collections.Counter(v['votes'] for v in out.values())))
print('\n最大的桶:')
for s, n in sz.most_common(15):
    print(f'  {n:4d}  {s} | {cats[s]}')

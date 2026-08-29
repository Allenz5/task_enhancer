"""二级说"这清单里没有"的任务，拿全量菜单再问一遍。

两级拆分有个结构性缺陷：一级把任务路由进某个分组之后，二级只能接受或拒绝，
**不能改道**。一级送错了分组，二级在错误的清单里当然找不到，只能填 null。

拿旧版交叉验证 539 条二级 null，其中 255 条旧版给过的品类就在本次菜单里 ——
有些在一级选中的分组下（二级自己没认出来），有些压根在别的分组下（一级路由错了）。

所以这一轮不分组，把全部 1969 项一次性摆出来，跳过路由这一层。回收多少条，
同时就是"两级拆分到底损失了多少"的度量。

产出 recovered.json，并把结果并回 categories.json（`via` 标记来路）
"""
import json, re, collections
import llm, taxonomy

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
cat = json.load(open('categories.json'))
todo = [c for c, v in cat.items() if v['section'] and not v['slug']]
print(f'二级判 null 的 {len(todo)} 条，用全量菜单重问')

MENU = '\n\n'.join(f'### {sec}\n' + taxonomy.menu_text(sec) for sec in taxonomy.SECTIONS)
N = sum(len(v) for v in taxonomy.LEVEL2.values())

GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题（Python/Excel 之类一律不算）。问的是：这份数据原本躺在谁的界面里？
一个人要拿到它，会去哪个系统里翻页、筛选、点开详情、导出？

**出处优先于场景。** 如果原文写了数据的来路（"数据来自…"、"从…下载"、"公开 benchmark"、
"CC-BY / CC0 许可"），那个来路就是答案——不要因为任务描述里的岗位场景就改判成那个
场景里的系统。公开数据集套一个虚构岗位，出处仍然是数据集仓库。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。

**原文里出现的软件名未必是数据来源，多数时候不是** —— 可能是解题工具（"使用墨刀完成
PRD"、"不得重跑 LAMMPS"）、要生成的产出物、数据里的一个字段值、或设计参考。
判断品类之前先自问那个名字是不是出处，不是就忽略它，回到数据本身的形态。

**这批任务上一轮已经被判过一次"没有合适的品类"。** 上一轮只看到了某一个分组下的
清单，可能是分组选错了、也可能是漏看了。这次给你的是**全部 %d 个品类**，
请重新判断，不要因为上一轮说没有就跟着说没有。""" % N

RULES = f"""每条给两个判断：

- `slug`：**逐字取自菜单，或者填 null。**
  多个都说得通时选最具体的。
  菜单覆盖 {N} 个品类，包含 Simulation & CAE、Laboratory、Geology and Seismic、GIS、
  Business Intelligence、Statistical Analysis、Game Development、Weather Data 这些 ——
  别因为任务"听起来很科研"或"很工程"就退回 null。
  确实没有对得上的才填 null：数据来自没有商业软件品类的系统（实验台自研采集脚本、
  研究组内部处理流水线、某台专用仪器的原始导出、公开数据集的下载包），那就是 null。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"slug":"..."|null,"confidence":0.0}}, ...]"""

BAT = 16
prompts = []
for b, chunk in enumerate(llm.batched(todo, BAT)):
    body = []
    for j, cid in enumerate(chunk):
        r = byid[cid]
        body.append(f"### 任务 {b*BAT+j}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\n"
                    f"files: {', '.join(r['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:600]}")
    prompts.append(f'{GOAL}\n\n## 品类菜单（{N} 项，按分组排列）\n\n{MENU}\n\n'
                   f'## 待判断的 {len(chunk)} 条\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')
print(f'{len(prompts)} 批 × 每批 {len(prompts[0]):,} 字符')

A = llm.by_id(llm.ask('recover', 'A', prompts))
B = llm.by_id(llm.ask('recover', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('slug') != B[j].get('slug')]
miss = [j for j in range(len(todo)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('recover', 'C', prompts, only=set(third))) if third else {}

legal = {s for v in taxonomy.LEVEL2.values() for s in v}
rec = {}
for j, cid in enumerate(todo):
    vs = [r[j].get('slug') for r in (A, B, C) if j in r]
    if not vs:
        continue
    vs = [s if s in legal else None for s in vs]
    slug, n = collections.Counter(vs).most_common(1)[0]
    rec[cid] = dict(slug=slug, votes=f'{n}/{len(vs)}')
json.dump(rec, open('recovered.json', 'w'), ensure_ascii=False, indent=0)

hit = {c: v for c, v in rec.items() if v['slug']}
for cid, v in hit.items():
    cat[cid].update(slug=v['slug'], l2_votes=v['votes'], via='全量菜单')
json.dump(cat, open('categories.json', 'w'), ensure_ascii=False, indent=0)

sz = collections.Counter(v['slug'] for v in hit.values())
print(f'\n═══ 回收 {len(hit)}/{len(todo)} 条（{len(hit)*100//len(todo)}%），'
      f'落在 {len(sz)} 个品类 ═══')
print('  最大的:')
for s, n in sz.most_common(15):
    print(f'    {n:4d}  {s} | {taxonomy.NAME[s]}')
same_sec = sum(1 for c, v in hit.items() if taxonomy.LEVEL2.get(cat[c]['section']) and
               v['slug'] in taxonomy.LEVEL2[cat[c]['section']])
print(f'\n  其中 {same_sec} 条的品类本来就在一级选中的分组下（二级漏看了）')
print(f'       {len(hit)-same_sec} 条在别的分组下（一级路由错了，二级无法改道）')

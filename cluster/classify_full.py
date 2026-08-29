"""筛选通过的 327 条，对 G2 全量品类分两级。

跟 classify_slim.py 是同一批任务、两份菜单的对照：那边是 G2 首页的 289 项精简版，
装不下 207 条；这边是全量 1969 项（taxonomy.py 折叠后），看覆盖能补回多少。

两级的规则跟 classify.py 一样，但多了一条回退：
  一级  38 个顶层分组，**必须选一个**。那时模型还没见过品类清单，问它"有没有合适的"
        等于让它猜一份没看过的单子。
  二级  只发命中分组的品类清单，允许说"这里面没有"。
  回退  二级说 null 的，**不丢弃，退回一级的分组当桶** —— 分组本身就是一个粒度，
        总比没有强，也方便事后再看要不要单独建骨架。

产出 full2.json
"""
import json, re, collections
import llm, taxonomy

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
sc = json.load(open('screen.json'))
named = json.load(open('named_sources.json'))
sm = json.load(open('source_map.json'))
ids = [c for c, v in sc.items() if v['web'] == 'yes']
print(f'{len(ids)} 条筛选通过的任务')

GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
这批任务已经过筛：它们的数据都来自某个**多记录的 Web 界面** —— 一个人要拿到它，
得在界面上搜索、筛选、翻页、点开详情、导出。现在要定的是那是哪一类界面。

不是问用什么工具解题（Python/Excel 之类一律不算）。

**出处优先于场景。** 公开数据集套一个虚构岗位（"你是设备状态监测工程师…"），
出处仍然是数据集仓库，不要改判成场景里的系统。

**原文里出现的软件名未必是数据来源，多数时候不是** —— 可能是解题工具、要生成的
产出物、数据里的一个字段值、或设计参考。判断前先自问那个名字是不是出处。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。"""


def brief(i, c):
    r, s = byid[c], sc[c]
    hint = f"（记录：{s['records']}　操作：{'+'.join(s['ops'])}）"
    src = named.get(c, {}).get('source', '')
    if src:
        hint += f"\n（原文点名来源：{sm.get(src.strip(), {}).get('canonical') or src}）"
    return (f"### 任务 {i}\n{hint}\ntask_name: {r['task_name']}\n"
            f"industry_domain: {r['industry_domain']}\n"
            f"files: {', '.join(r['files'][:6])}\n"
            f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
            f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:500]}")


BAT = 12


def vote(items, prompts, step, key):
    A = llm.by_id(llm.ask(step, 'A', prompts))
    B = llm.by_id(llm.ask(step, 'B', prompts))
    dis = [j for j in set(A) & set(B) if A[j].get(key) != B[j].get(key)]
    miss = [j for j in range(len(items)) if j not in A or j not in B]
    third = sorted({j // BAT for j in dis + miss})
    print(f'  A/B 不一致 {len(dis)}，缺失 {len(miss)} → 第三轮 {len(third)}/{len(prompts)} 批')
    C = llm.by_id(llm.ask(step, 'C', prompts, only=set(third))) if third else {}
    out = {}
    for j in range(len(items)):
        vs = [x[j] for x in (A, B, C) if j in x]
        if vs:
            v, n = collections.Counter(x.get(key) for x in vs).most_common(1)[0]
            out[j] = (v, f'{n}/{len(vs)}')
    return out


# ───────────────── 一级：必须选一个分组 ─────────────────

L1_RULES = f"""每条给两个判断：

- `section`：**逐字取自上面 {len(taxonomy.SECTIONS)} 个分组之一。必须选一个，不能不选。**
  这是粗粒度的一步，只圈范围，具体品类下一轮再定 —— 不必纠结分组内部的细分。
  **拿不准时选最接近的那个。** 觉得没有任何品类对得上，也先选一个最沾边的分组：
  下一轮会把该分组下的全部品类摆给你看，到那时你可以说"这里面没有合适的"。
  现在还看不到清单，判断不了。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"section":"...","confidence":0.0}}, ...]"""

prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = '\n\n'.join(brief(b*BAT+j, c) for j, c in enumerate(chunk))
    prompts.append(f'{GOAL}\n\n## 顶层分组（{len(taxonomy.SECTIONS)} 个，破折号后是组内品类举例）\n\n'
                   f'{taxonomy.sections_text()}\n\n## 待判断的 {len(chunk)} 条\n\n{body}'
                   f'\n\n## 输出\n\n{L1_RULES}')
print(f'\n一级：{len(prompts)} 批')
lvl1 = vote(ids, prompts, 'full2-section', 'section')

secs = set(taxonomy.SECTIONS)
by_sec, meta = collections.defaultdict(list), {}
for j, c in enumerate(ids):
    if j not in lvl1:
        continue
    s, v = lvl1[j]
    if s in secs:
        by_sec[s].append(c)
        meta[c] = dict(section=s, l1_votes=v)
print(f'\n一级落进分组 {sum(len(v) for v in by_sec.values())}/{len(ids)} 条')
for s, v in sorted(by_sec.items(), key=lambda kv: -len(kv[1])):
    print(f'  {len(v):4d}  {s}')

# ───────────────── 二级：分组内定品类，null 回退到分组 ─────────────────

out = {}
for sec in sorted(by_sec, key=lambda s: -len(by_sec[s])):
    sub = by_sec[sec]
    rules = f"""每条给两个判断：

- `slug`：**逐字取自上面 {len(taxonomy.LEVEL2[sec])} 项之一，或者填 null。**
  上一轮把这条任务归到了「{sec}」，但那是在看不到品类清单的情况下选的，未必对。
  现在你看到了完整清单，**以清单为准**。多个都说得通时选最具体的。
  只有这两种情况填 null：清单里确实没有一项对得上；或者上一轮把这条放错了分组。
  填 null 不会丢弃这条任务 —— 它会退回「{sec}」这个粗粒度，所以不要为了不落空而硬凑。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"slug":"..."|null,"confidence":0.0}}, ...]"""
    prompts = []
    for b, chunk in enumerate(llm.batched(sub, BAT)):
        body = '\n\n'.join(brief(b*BAT+j, c) for j, c in enumerate(chunk))
        prompts.append(f'{GOAL}\n\n这批任务已判定属于「{sec}」。\n\n'
                       f'## 该分组下的品类（{len(taxonomy.LEVEL2[sec])} 项）\n\n'
                       f'{taxonomy.menu_text(sec)}\n\n## 待判断的 {len(chunk)} 条\n\n{body}'
                       f'\n\n## 输出\n\n{rules}')
    step = 'full2-cat/' + re.sub(r'[^a-z0-9]+', '-', sec.lower()).strip('-')
    print(f'\n二级 · {sec}：{len(sub)} 条 / {len(prompts)} 批 / 菜单 {len(taxonomy.LEVEL2[sec])} 项')
    res = vote(sub, prompts, step, 'slug')
    legal = set(taxonomy.LEVEL2[sec])
    for j, c in enumerate(sub):
        slug, v = res.get(j, (None, None))
        slug = slug if slug in legal else None
        out[c] = dict(bucket=slug or sec, level='品类' if slug else '分组',
                      slug=slug, section=sec, l1_votes=meta[c]['l1_votes'], l2_votes=v)

json.dump(out, open('full2.json', 'w'), ensure_ascii=False, indent=0)

fine = {k: v for k, v in out.items() if v['slug']}
sz = collections.Counter(v['bucket'] for v in out.values())
print(f'\n═══ {len(out)} 条 → full2.json ═══')
print(f'  定到品类 {len(fine)} 条（{len(fine)*100//len(out)}%），'
      f'回退到分组 {len(out)-len(fine)} 条')
print(f'  共 {len(sz)} 个桶，单例 {sum(1 for _, n in sz.items() if n == 1)} 个')
print('\n最大的桶:')
for s, n in sz.most_common(18):
    kind = '品类' if s in taxonomy.NAME else '分组'
    print(f'  {n:4d}  [{kind}] {s}{" | " + taxonomy.NAME[s] if s in taxonomy.NAME else ""}')

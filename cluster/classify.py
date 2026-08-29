"""原文没写来源的任务，按品类菜单分类。分两级。

一级只问 38 个顶层分组，菜单 250 token；二级只发命中那个分组的品类清单。
好处是覆盖回到 G2 全量 2238 项，成本却比"每批都发一份剪过的大菜单"低一个数量级 ——
绝大多数分组的二级菜单只有几十项。

**"没有合适的"只在二级问。** 一级必须选一个分组 —— 那时模型只看到 38 个分组名，
根本没见过品类清单，让它判断"有没有合适的"等于让它猜一份没看过的单子。二级看得到
该分组下的全部品类，说"这里面没有"才是有依据的。实测：一级放开 null 时排除了 606 条，
其中 272 条（45%）是误杀。

二级也负责纠正一级 —— prompt 里明说上一轮是盲选的分组、以清单为准，
所以"这条根本不属于这个分组"同样填 null。

产出 categories.json
"""
import json, re, collections
import llm, taxonomy

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
named = json.load(open('named_sources.json'))
todo = [r['custom_id'] for r in rows if r['custom_id'] not in named]
print(f'待分类 {len(todo)} 条（find_sources.py 已钉死 {len(named)} 条）')

GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题（Python/Excel 之类一律不算）。问的是：这份数据原本躺在谁的界面里？
一个人要拿到它，会去哪个系统里翻页、筛选、点开详情、导出？

**出处优先于场景。** 如果原文写了数据的来路（"数据来自…"、"从…下载"、"公开 benchmark"、
"CC-BY / CC0 许可"、"可自由再分发"），那个来路就是答案——**不要因为任务描述里的岗位场景
（"你是设备状态监测工程师，工厂有一套试验台…"）就改判成那个场景里的系统。**
公开数据集套一个虚构岗位，出处仍然是数据集仓库。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。
industry_domain 只能弱参考——它说的是"谁在用"，不是"数据出自哪个系统"。

**原文里出现的软件名未必是数据来源，多数时候不是。** 同一个名字可能是：
- 拿来解题的工具 —— "使用墨刀完成 PRD 输出"、"不得重跑 LAMMPS"、"若无 VASP 则跳过"
- 这道题要生成的产出物 —— "生成 Neuroglancer 状态文件"
- 数据内容里的一个字段值 —— 数据是招聘岗位表，文中的 RenderDoc 是某个岗位要求里的技能
- 设计参考 —— "交互页面可参考有赞小程序或唯品会小程序的产品架构"

这些名字往往是整段文字里最显眼的词，很容易顺着它答。**判断品类之前先自问：那个名字
到底是不是这份数据的出处？不是的话就忽略它，回到数据本身的形态。**
注意否定句是陷阱：「不需要运行 VASP 能量计算」里的 VASP 是明确不用的解题工具。"""


def brief(i, r):
    return (f"### 任务 {i}\ntask_name: {r['task_name']}\n"
            f"industry_domain: {r['industry_domain']}\n"
            f"files: {', '.join(r['files'][:6])}\n"
            f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
            f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:600]}")


def vote(items, prompts, step, key):
    """A/B 两轮 + 只补跑分歧和缺失的批次，返回 {下标: (取值, 票数, 轮数)}。"""
    A = llm.by_id(llm.ask(step, 'A', prompts))
    B = llm.by_id(llm.ask(step, 'B', prompts))
    dis = [j for j in set(A) & set(B) if A[j].get(key) != B[j].get(key)]
    miss = [j for j in range(len(items)) if j not in A or j not in B]
    third = sorted({j // BAT for j in dis + miss})
    print(f'  A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
    C = llm.by_id(llm.ask(step, 'C', prompts, only=set(third))) if third else {}
    out = {}
    for j in range(len(items)):
        vs = [r[j] for r in (A, B, C) if j in r]
        if not vs:
            continue
        v, n = collections.Counter(x.get(key) for x in vs).most_common(1)[0]
        conf = round(sum(x.get('confidence') or 0 for x in vs) / len(vs), 2)
        sr = collections.Counter(x.get('source_real') for x in vs if x.get('source_real'))
        out[j] = (v, n, len(vs), conf, sr.most_common(1)[0][0] if sr else None)
    return out


BAT = 12

# ───────────────────────── 一级：落在哪个顶层分组 ─────────────────────────

L1_MENU = taxonomy.sections_text()
L1_RULES = f"""每条给三个判断：

- `section`：**逐字取自上面 {len(taxonomy.SECTIONS)} 个分组之一。这一轮必须选一个，不能不选。**
  这是粗粒度的一步，只圈范围，具体品类下一轮再定 —— 所以不必纠结分组内部的细分，
  也不要因为拿不准具体是哪一类就犹豫。**拿不准时选最接近的那个。**
  如果你觉得没有任何品类对得上，那也先选一个最沾边的分组：下一轮会把该分组下的
  全部品类摆给你看，到那时你可以说"这里面没有合适的"。现在还看不到清单，判断不了。

- `source_real`：**只看数据本身有没有真实出身，不要看你能不能认出是哪个产品。**
  `"yes"` 数据带领域特征：专业字段名、物理单位、专有格式、可信的记录规模。
  **认不出具体产品也照样填 yes** ——现实里绝大多数数据来自没有名气的内部系统。
  `"no"` 只在明显是为出题现编时用：字段全是 id/rule/case/mode 这类无领域含义的
  通用名，没有任何单位或专有格式，体量只有几百字节到几 KB。
  `"unsure"` 两边特征都有。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"section":"...","source_real":"yes|no|unsure","confidence":0.0}}, ...]"""

prompts = []
for b, chunk in enumerate(llm.batched(todo, BAT)):
    body = '\n\n'.join(brief(b*BAT+j, byid[c]) for j, c in enumerate(chunk))
    prompts.append(f'{GOAL}\n\n## 顶层分组（{len(taxonomy.SECTIONS)} 个，破折号后是组内品类举例）'
                   f'\n\n{L1_MENU}\n\n'
                   f'## 待判断的 {len(chunk)} 条\n\n{body}\n\n## 输出\n\n{L1_RULES}')
print(f'\n一级：{len(prompts)} 批')
lvl1 = vote(todo, prompts, 'section', 'section')

secs = set(taxonomy.SECTIONS)
by_sec = collections.defaultdict(list)
meta = {}
for j, cid in enumerate(todo):
    if j not in lvl1:
        continue
    s, n, of, conf, sr = lvl1[j]
    meta[cid] = dict(section=s if s in secs else None, source_real=sr, l1_votes=f'{n}/{of}')
    if s in secs:
        by_sec[s].append(cid)
bad = len(meta) - sum(len(v) for v in by_sec.values())
print(f'\n一级结果：落进分组 {sum(len(v) for v in by_sec.values())} 条'
      + (f'，⚠ 返回了非法分组名 {bad} 条' if bad else ''))
for s, v in sorted(by_sec.items(), key=lambda kv: -len(kv[1]))[:10]:
    print(f'  {len(v):4d}  {s}')

# ───────────────────────── 二级：分组内定品类 ─────────────────────────

out = {}
for cid, m in meta.items():
    out[cid] = dict(slug=None, section=m['section'], source_real=m['source_real'],
                    l1_votes=m['l1_votes'], l2_votes=None, confidence=None)

for sec in sorted(by_sec, key=lambda s: -len(by_sec[s])):
    ids = by_sec[sec]
    menu = taxonomy.menu_text(sec)
    rules = f"""每条给两个判断：

- `slug`：**逐字取自上面 {len(taxonomy.LEVEL2[sec])} 项之一，或者填 null。**
  上一轮把这条任务归到了「{sec}」，但上一轮是在看不到品类清单的情况下选的分组，
  所以它未必对。现在你看到了完整清单，**以清单为准**。
  多个都说得通时选最具体的。
  只有这两种情况填 null：清单里确实没有一项对得上这份数据的出处；或者上一轮把
  这条任务放错了分组、它根本不属于「{sec}」。
  前一种在这批数据里不算少见 —— 有些数据来自没有商业软件品类的系统：实验台自研
  采集脚本、研究组内部处理流水线、某台专用仪器的原始导出。那就是 null。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"slug":"..."|null,"confidence":0.0}}, ...]"""
    prompts = []
    for b, chunk in enumerate(llm.batched(ids, BAT)):
        body = '\n\n'.join(brief(b*BAT+j, byid[c]) for j, c in enumerate(chunk))
        prompts.append(f'{GOAL}\n\n这批任务已判定属于「{sec}」。\n\n'
                       f'## 该分组下的品类（{len(taxonomy.LEVEL2[sec])} 项）\n\n{menu}\n\n'
                       f'## 待判断的 {len(chunk)} 条\n\n{body}\n\n## 输出\n\n{rules}')
    step = 'category/' + re.sub(r'[^a-z0-9]+', '-', sec.lower()).strip('-')
    print(f'\n二级 · {sec}：{len(ids)} 条 / {len(prompts)} 批 / 菜单 {len(taxonomy.LEVEL2[sec])} 项')
    res = vote(ids, prompts, step, 'slug')
    legal = set(taxonomy.LEVEL2[sec])
    for j, cid in enumerate(ids):
        if j not in res:
            continue
        s, n, of, conf, _ = res[j]
        out[cid].update(slug=s if s in legal else None, l2_votes=f'{n}/{of}', confidence=conf)

json.dump(out, open('categories.json', 'w'), ensure_ascii=False, indent=0)

hit = {k: v for k, v in out.items() if v['slug']}
sz = collections.Counter(v['slug'] for v in hit.values())
print(f'\n═══ 分类 {len(out)} 条 → categories.json ═══')
print(f'  定到品类  {len(hit)} 条（{len(hit)*100//max(len(out),1)}%），{len(sz)} 个品类，'
      f'单例 {sum(1 for _, n in sz.items() if n == 1)} 个')
print(f'  只到分组  {sum(1 for v in out.values() if v["section"] and not v["slug"])} 条')
print(f'  一级就排除 {sum(1 for v in out.values() if not v["section"])} 条')
print('  source_real:', dict(collections.Counter(v['source_real'] for v in out.values())))
print('\n最大的品类:')
for s, n in sz.most_common(15):
    print(f'  {n:4d}  {s} | {taxonomy.NAME[s]}')

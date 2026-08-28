"""原文没写来源的任务，按品类菜单分类。

菜单用的是 G2 首页导航里那份精简分类（`g2_slim.json`，23 个分组 / 289 个品类），
不是完整的 2238 项。它是给买软件的人做导航用的，留下的基本都是通用商业软件，
垂直行业和工程科研那一片被 G2 自己砍掉了。

这正好当筛子用：**落得进这 289 项的就是要处理的，落不进的填 null，直接排除。**
所以 prompt 明确允许"没有合适的"，不要求硬挑一个。

跑法是 A/B 两轮 + 定向第三轮 —— 只有 A、B 不一致或缺失的批次才跑 C。

产出 categories.json
"""
import json, re, collections
import llm

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
named = json.load(open('named_sources.json'))
cats = json.load(open('g2_categories.json'))
slim = json.load(open('g2_slim.json'))

MENU = '\n\n'.join(
    f'### {sec}\n' + '\n'.join(f'{s} | {cats[s]}' for s in slugs)
    for sec, slugs in slim.items())
N = sum(len(v) for v in slim.values())

todo = [r['custom_id'] for r in rows if r['custom_id'] not in named]
print(f'待分类 {len(todo)} 条（find_sources.py 已钉死 {len(named)} 条），菜单 {N} 项')

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

RULES = """每条给三个判断：

- `slug`：**必须逐字取自菜单，或者填 null。**
  这份菜单只覆盖通用商业软件，科研仪器、工程仿真、实验室、地球物理这些不在里面。
  **菜单里没有贴近的就填 null，不要硬挑一个凑。** 硬凑的答案比 null 更糟 ——
  null 我们能识别并排除，硬凑的会混进结果里看不出来。
  勉强沾边也算没有：只有当你认为"这份数据确实是从这类软件里导出来的"才填 slug。
  多个都说得通时选最具体的。

- `source_real`：**只看数据本身有没有真实出身，不要看你能不能认出是哪个产品。**
  - `"yes"` —— 数据带领域特征：专业字段名、物理单位、专有格式、可信的记录规模、
    真实地名/机构名/型号。**认不出具体产品也照样填 yes** ——现实里绝大多数数据
    来自没有名气的内部系统，认不出是常态，不是"没有来源"的证据。
  - `"no"` —— 只在数据明显是为出题现编时才用：字段全是 id/rule/case/mode 这类
    无领域含义的通用名，没有任何单位或专有格式，体量只有几百字节到几 KB。
  - `"unsure"` —— 两边特征都有。

- `confidence`：0-1，对 `slug` 的把握。填 null 时也给一个——表示你有多确信菜单里
  确实没有合适的。

只输出 JSON 数组：[{"id":<编号>,"slug":"..."|null,"source_real":"yes|no|unsure","confidence":0.0}, ...]"""

prompts = []
for b, chunk in enumerate(llm.batched(todo, 12)):
    body = []
    for j, cid in enumerate(chunk):
        r = byid[cid]
        body.append(f"### 任务 {b*12+j}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\n"
                    f"files: {', '.join(r['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:600]}")
    prompts.append(f'{GOAL}\n\n## 品类菜单（{N} 项，按分组排列）\n\n{MENU}\n\n'
                   f'## 再说一遍\n\n{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n' +
                   '\n\n'.join(body) + f'\n\n## 输出\n\n{RULES}')

A = llm.by_id(llm.ask('classify', 'A', prompts))
B = llm.by_id(llm.ask('classify', 'B', prompts))

disagree = [j for j in set(A) & set(B) if A[j].get('slug') != B[j].get('slug')]
missing = [j for j in range(len(todo)) if j not in A or j not in B]
third = sorted({j // 12 for j in disagree + missing})
print(f'\nA/B 不一致 {len(disagree)} 条，缺失 {len(missing)} 条 '
      f'→ 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('classify', 'C', prompts, only=set(third))) if third else {}

out, legal = {}, {s for v in slim.values() for s in v}
bogus = collections.Counter()
for j, cid in enumerate(todo):
    vs = [r[j] for r in (A, B, C) if j in r]
    if not vs:
        continue
    picks = []
    for v in vs:
        s = v.get('slug')
        if s is not None and s not in legal:
            bogus[s] += 1
            s = None
        picks.append(s)
    slug, n = collections.Counter(picks).most_common(1)[0]
    out[cid] = dict(slug=slug, votes=n, of=len(vs),
                    source_real=collections.Counter(v.get('source_real') for v in vs).most_common(1)[0][0],
                    confidence=round(sum(v.get('confidence') or 0 for v in vs) / len(vs), 2))
json.dump(out, open('categories.json', 'w'), ensure_ascii=False, indent=0)

hit = {k: v for k, v in out.items() if v['slug']}
sz = collections.Counter(v['slug'] for v in hit.values())
print(f'\n分类 {len(out)} 条 → categories.json')
print(f'  落进菜单  {len(hit)} 条（{len(hit)*100//max(len(out),1)}%），{len(sz)} 个品类，'
      f'单例 {sum(1 for _, n in sz.items() if n == 1)} 个')
print(f'  菜单里没有  {len(out)-len(hit)} 条')
print('  投票一致度:', dict(collections.Counter(f"{v['votes']}/{v['of']}" for v in out.values())))
print('  source_real:', dict(collections.Counter(v['source_real'] for v in out.values())))
if bogus:
    print(f'  ⚠ 模型编了菜单外的 slug {sum(bogus.values())} 次: {bogus.most_common(5)}')
print('\n最大的品类:')
for s, n in sz.most_common(15):
    print(f'  {n:4d}  {s} | {cats[s]}')

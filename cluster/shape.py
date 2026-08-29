"""把筛选通过的任务按**数据形态**归族 —— 这才是决定能不能共用一套骨架的东西。

screen.py 给每条通过的任务留了 `records`（界面上那批记录是什么）和 `ops`（要做哪些
操作）。`records` 是自由文本，散得厉害，所以先让模型看着**全部**记录类型归纳出一组
形态族，再逐条分派。

上一轮"让模型归纳站点家族"失败过（配对通过率 41.7%，对照 20%），原因是它按**学科语义**
归并 —— "SVG 制图"和"试井曲线诊断"进了同一族。这次喂给它的是形态描述而不是任务原文，
并且在 prompt 里把那个反例点名写出来当警告。

产出 shape.json
"""
import json, collections
import llm

sc = json.load(open('screen.json'))
rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
ids = [c for c, v in sc.items() if v['web'] == 'yes']
print(f'筛选通过 {len(ids)} 条')

lines = []
for i, c in enumerate(ids):
    v = sc[c]
    lines.append(f"{i}. {v['records']}　[{'+'.join(v['ops'])}]　{v['why'] or ''}")
LIST = '\n'.join(lines)

# ───────────────────────── 一、归纳形态族 ─────────────────────────

INDUCE = f"""下面 {len(ids)} 行，每行是一条任务的**输入数据形态**：
界面上那批记录是什么、拿到它需要哪些操作、以及一句判断依据。

请把它们归纳成一组**形态族**。分族的依据只有一个：

> **这两条的数据能不能装进同一套界面骨架** —— 同样的导航、同样的列表/详情形态、
> 同样几个筛选维度、同样的导出方式，换掉数据就能服务另一条。

**不要按行业或学科分族。** 上一次就栽在这里：把"SVG 制图"和"试井曲线诊断"归进同一族
（都算"工程"），但界面骨架完全不同。反过来，招聘岗位表和商品目录虽然行业无关，
但都是"带多个筛选维度的记录列表 + 详情页"，应该同族。

真正该看的是：**有几种实体、实体之间有没有父子/关联关系、每条记录有哪些可筛的维度、
要不要看时序或地理、详情页里摆什么。**

族的数量自己定，但要求：每族至少 5 条，族与族之间的界面差异要说得出来。
剩下实在归不进去的放 `其他`。

## 全部 {len(ids)} 行

{LIST}

## 输出

只输出 JSON 数组，每个族一个对象：
[{{"family":"<短名>","ui":"<一句话说这套骨架长什么样：几个页面、列表摆什么、筛什么、详情摆什么>","n":<你估计的条数>}}, ...]"""

families = []
for f in (llm.ask('shape', 'induce', [INDUCE])[0] or []):
    if isinstance(f, dict) and f.get('family'):
        families.append(f)
print(f'\n归纳出 {len(families)} 个形态族：')
for f in families:
    print(f"  {f['family']}  —— {f.get('ui','')[:70]}")

MENU = '\n'.join(f"{f['family']} | {f.get('ui','')}" for f in families)

# ───────────────────────── 二、逐条分派 ─────────────────────────

RULES = f"""每条任务输出一个对象：

{{"id": <编号>, "family": "<逐字取自上面的族名>"|null, "confidence": 0.0}}

- 只看数据形态，不看行业。
- 实在没有合适的族才填 null。

只输出 JSON 数组，无其他文字。"""

BAT = 20
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = []
    for j, c in enumerate(chunk):
        v = sc[c]
        body.append(f"### {b*BAT+j}\n任务名：{byid[c]['task_name'][:60]}\n"
                    f"记录：{v['records']}\n操作：{'+'.join(v['ops'])}\n依据：{v['why'] or ''}")
    prompts.append(f"把每条任务分派到一个形态族。分族依据是**数据能不能共用一套界面骨架**，"
                   f"不是行业。\n\n## 形态族（{len(families)} 个）\n\n{MENU}\n\n"
                   f"## 待分派的 {len(chunk)} 条\n\n" + '\n\n'.join(body) +
                   f"\n\n## 输出\n\n{RULES}")

A = llm.by_id(llm.ask('shape', 'A', prompts))
B = llm.by_id(llm.ask('shape', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('family') != B[j].get('family')]
miss = [j for j in range(len(ids)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'\nA/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('shape', 'C', prompts, only=set(third))) if third else {}

legal = {f['family'] for f in families}
out = {}
for j, c in enumerate(ids):
    vs = [x[j].get('family') for x in (A, B, C) if j in x]
    if not vs:
        continue
    vs = [f if f in legal else None for f in vs]
    f, n = collections.Counter(vs).most_common(1)[0]
    out[c] = dict(family=f, votes=f'{n}/{len(vs)}',
                  records=sc[c]['records'], ops=sc[c]['ops'])
json.dump(dict(families=families, assign=out), open('shape.json', 'w'),
          ensure_ascii=False, indent=1)

sz = collections.Counter(v['family'] for v in out.values() if v['family'])
print(f'\n═══ {len(out)} 条分派完毕，{len(sz)} 个族有成员 ═══')
for f, n in sz.most_common():
    ui = next((x.get('ui', '') for x in families if x['family'] == f), '')
    print(f'  {n:4d}  {f}')
    print(f'        {ui[:88]}')
print(f'  {sum(1 for v in out.values() if not v["family"])} 条没有归属')
print('  投票一致度:', dict(collections.Counter(v['votes'] for v in out.values())))

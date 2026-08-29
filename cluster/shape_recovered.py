"""把复核回收的 162 条也归进 shape.py 那 12 个形态族，让候选集完整。

族是现成的（shape.json 的 families），只做分派，不重新归纳 —— 重新归纳会让
327 条那批的族定义漂掉，两批就对不齐了。
"""
import json, re, collections
import llm

shp = json.load(open('shape.json'))
a = json.load(open('audit.json'))
sc = json.load(open('screen.json'))
rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
ids = [c for c, v in a.items() if v['verdict'] == 'web']
print(f'回收 {len(ids)} 条，分派到现有 {len(shp["families"])} 个族')

MENU = '\n'.join(f"{f['family']} | {f.get('ui','')}" for f in shp['families'])
RULES = """每条任务输出一个对象：

{"id": <编号>, "family": "<逐字取自上面的族名>"|null, "confidence": 0.0}

- 只看数据形态，不看行业。
- 实在没有合适的族才填 null。

只输出 JSON 数组，无其他文字。"""

BAT = 20
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = []
    for j, c in enumerate(chunk):
        v = a[c]
        body.append(f"### {b*BAT+j}\n任务名：{byid[c]['task_name'][:60]}\n"
                    f"来源：{v['source']}（{v['category']}）\n依据：{v['why']}\n"
                    f"描述：{re.sub(r'\s+',' ', byid[c]['desc'])[:400]}")
    prompts.append(f"把每条任务分派到一个形态族。分族依据是**数据能不能共用一套界面骨架**，"
                   f"不是行业。\n\n## 形态族（{len(shp['families'])} 个）\n\n{MENU}\n\n"
                   f"## 待分派的 {len(chunk)} 条\n\n" + '\n\n'.join(body) +
                   f"\n\n## 输出\n\n{RULES}")

A = llm.by_id(llm.ask('shape-rec', 'A', prompts))
B = llm.by_id(llm.ask('shape-rec', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('family') != B[j].get('family')]
miss = [j for j in range(len(ids)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)}，缺失 {len(miss)} → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('shape-rec', 'C', prompts, only=set(third))) if third else {}

legal = {f['family'] for f in shp['families']}
for j, c in enumerate(ids):
    vs = [x[j].get('family') for x in (A, B, C) if j in x]
    if not vs:
        continue
    vs = [f if f in legal else None for f in vs]
    f, n = collections.Counter(vs).most_common(1)[0]
    shp['assign'][c] = dict(family=f, votes=f'{n}/{len(vs)}',
                            records=a[c]['source'], ops=[], recovered=True)
json.dump(shp, open('shape.json', 'w'), ensure_ascii=False, indent=1)

sz = collections.Counter(v['family'] for v in shp['assign'].values() if v['family'])
print(f'\n═══ 候选集 {len(shp["assign"])} 条（327 筛选通过 + {len(ids)} 复核回收）═══')
for f, n in sz.most_common():
    rec = sum(1 for v in shp['assign'].values() if v['family'] == f and v.get('recovered'))
    print(f'  {n:4d}  {f}' + (f'   （其中回收 {rec}）' if rec else ''))

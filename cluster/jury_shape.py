"""同一套陪审，改成按**形态族**分桶（shape.py 的划分）。

跟 jury.py / jury_product.py 的陪审 prompt 与随机对照**逐字相同**（对照直接沿用），
所以三者的 lift 可比：
    按 G2 品类   0.39（点名）／0.52（分类）
    按产品名     0.30
    按形态族     ← 这一轮

品类标签只是代理，真正要回答的是建站问题。所以直接问：随机抽两条同桶的任务，
它们的数据能不能装进同一套界面（同样的导航、列表/详情形态、筛选器、导出方式）。

三条纪律来自上一轮踩的坑，缺一不可：
  · 必须带**随机对照** —— 随机任务对陪审也会给 15–32% 的"能"，不减掉这个底噪，
    任何大桶都显得很好。跨轮的原始通过率不可比，只能比 lift。
  · 配对抽样必须**按桶内配对数加权** —— 均匀抽桶会让 4 条的小桶和 126 条的大桶等权，
    而大桶装着绝大多数任务，低估会变成高估。
  · n 至少 150 —— 单轮 80 对的波动能到 ±15 个百分点。

打乱后盲评，陪审看不出哪一对来自哪一组。

产出 jury.json
"""
import json, random, collections
import llm

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
cat = json.load(open('categories.json'))
sm = json.load(open('source_map.json'))
named = json.load(open('named_sources.json'))

# 桶 = 形态族。跟 jury.py 的唯一区别就在这里。
shp = json.load(open('shape.json'))
bucket, how = {}, {}
for cid, v in shp['assign'].items():
    if v['family'] and v['family'] != '其他':
        bucket[cid] = v['family']
        how[cid] = '点名' if cid in named else '分类'

members = collections.defaultdict(list)
for cid, s in bucket.items():
    members[s].append(cid)
sized = {s: v for s, v in members.items() if len(v) >= 2}
print(f'{len(bucket)} 条有品类，{len(sized)} 个桶 ≥2 条')

N = 150
rnd = random.Random(20260828)

# 按桶内配对数加权抽样，等价于在全部同桶配对上均匀抽
weights = [len(v) * (len(v) - 1) / 2 for v in sized.values()]
slugs = list(sized)
pairs = []
seen = set()
while len(pairs) < N:
    s = rnd.choices(slugs, weights=weights)[0]
    a, b = rnd.sample(sized[s], 2)
    k = tuple(sorted((a, b)))
    if k in seen:
        continue
    seen.add(k)
    pairs.append(dict(a=a, b=b, arm='bucket', slug=s,
                      how='+'.join(sorted({how[a], how[b]}))))

allids = list(bucket)
while False:
    a, b = rnd.sample(allids, 2)
    k = tuple(sorted((a, b)))
    if k in seen or bucket[a] == bucket[b]:
        continue
    seen.add(k)
    pairs.append(dict(a=a, b=b, arm='CTRL', slug=None, how=None))

rnd.shuffle(pairs)
json.dump(pairs, open('jury_shape_pairs.json', 'w'), ensure_ascii=False)
print(f'{len(pairs)} 对：同桶 {sum(1 for p in pairs if p["arm"]=="bucket")}，'
      f'随机对照 {sum(1 for p in pairs if p["arm"]=="CTRL")}')

GOAL = """判断每一对任务：**它们的输入数据能不能装进同一套界面骨架里。**

同一套骨架的意思是：同样的导航结构、同样的列表/详情形态、同样几个筛选维度、
同样的导出方式 —— 换掉里面的数据就能服务另一条任务，不需要加页面、不需要改字段槽。

判断的是**数据的形态**，不是任务的学科或行业。两条任务都属于"地球科学"不代表能共用界面；
一个是台站波形检索、一个是钻井曲线诊断，界面完全不同。反过来，一个招聘岗位表和一个
商品目录，虽然行业无关，但都是"带多个筛选维度的记录列表 + 详情页"，就能共用。

判断依据：数据里有哪些实体、每个实体有哪些字段、记录规模、要不要看时间序列或几何图形、
一个人要拿到它会做哪些操作（搜索、筛选、翻页、展开、导出）。"""

RULES = """每一对输出一个对象：

{"id": <编号>, "same": true|false, "confidence": 0.0, "why": "<10 字以内的理由>"}

- `same` —— 能共用一套骨架填 true，不能填 false。
- 拿不准时看**哪一边改动更小**：需要为第二条任务新增页面或新增字段槽，就填 false。

只输出 JSON 数组，无其他文字。"""


def card(r):
    import re
    return (f"任务名：{r['task_name']}\n行业：{r['industry_domain']}\n"
            f"文件：{', '.join(r['files'][:5])}\n"
            f"描述：{re.sub(r'\s+', ' ', r['desc'])[:520]}")


BAT = 10
prompts = []
for b, chunk in enumerate(llm.batched(pairs, BAT)):
    body = []
    for j, p in enumerate(chunk):
        body.append(f"### 第 {b*BAT+j} 对\n\n**A**\n{card(byid[p['a']])}\n\n"
                    f"**B**\n{card(byid[p['b']])}")
    prompts.append(f'{GOAL}\n\n## 待判断的 {len(chunk)} 对\n\n' + '\n\n---\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')

V = llm.by_id(llm.ask('jury-shape', 'A', prompts))

for j, p in enumerate(pairs):
    p['same'] = V[j].get('same') if j in V else None
    p['why'] = (V.get(j) or {}).get('why')
json.dump(pairs, open('jury_shape.json', 'w'), ensure_ascii=False, indent=0)

got = [p for p in pairs if p['same'] is not None]
def rate(sel):
    s = [p for p in got if sel(p)]
    return (sum(1 for p in s if p['same']), len(s))

ok, n = rate(lambda p: p['arm'] == 'bucket')
prev = json.load(open('jury.json'))
c = [x for x in prev if x['arm'] == 'CTRL' and x['same'] is not None]
c_ok, c_n = sum(1 for x in c if x['same']), len(c)   # 沿用同一份随机对照，prompt 逐字相同
p0 = c_ok / c_n if c_n else 0
p1 = ok / n if n else 0
lift = (p1 - p0) / (1 - p0) if p0 < 1 else 0
print(f'\n═══ 陪审 {len(got)}/{len(pairs)} 对有结果 ═══')
print(f'  随机对照  {c_ok}/{c_n} = {p0:.1%}   ← 底噪')
print(f'  同桶      {ok}/{n} = {p1:.1%}')
print(f'  lift = (p − p0) / (1 − p0) = {lift:.2f}')
for h in ('分类', '点名', '分类+点名'):
    o, m = rate(lambda p: p['arm'] == 'bucket' and p['how'] == h)
    if m:
        print(f'    其中 {h:5s} {o}/{m} = {o/m:.1%}')
big = {s for s, v in members.items() if len(v) >= 10}
o, m = rate(lambda p: p['arm'] == 'bucket' and p['slug'] in big)
if m:
    print(f'    ≥10 条的桶 {o}/{m} = {o/m:.1%}')
print('\n判 false 最多的桶:')
bad = collections.Counter(p['slug'] for p in got if p['arm'] == 'bucket' and not p['same'])
for s, c in bad.most_common(8):
    tot = sum(1 for p in got if p['slug'] == s and p['arm'] == 'bucket')
    print(f'  {c}/{tot}  {s}')

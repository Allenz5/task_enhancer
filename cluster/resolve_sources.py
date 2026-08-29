"""把 find_sources.py 抽出来的来源名收拾成能当桶用的东西。

抽取要求逐字照抄原文，接地性有了，规范化没了 —— OpenSim / OpenSim 4.5 / OSIM /
OpenSim 4.3 是四个字符串、一个东西。而且这批"来源"里大部分根本不是软件：MNIST、
Adult Census Income、CWRU Bearing Dataset 是公开数据集，NOAA / BLS / eCFR 是政府
数据门户，它们各自的界面形态是同一套，不该一个名字一个桶。

所以只对**不同的名字**跑一轮（几百个，不带任务正文，很便宜），问三件事：
规范名、这是什么东西、以及它的界面长什么样。名字按字母序排，同族的变体会落在同一批里，
模型能看着彼此给出一致的规范名。

最后把每个规范来源映射到 **G2 品类** —— 必须跟 classify.py 用同一套词表，否则两半
分出来的桶合不到一起。映射的是 218 个名字而不是 403 条任务，所以可以一次性把全部
1969 项菜单摆出来，不用像 classify.py 那样分两级。

产出 source_map.json：原始名 → {canonical, kind, ui, slug}
"""
import json, collections
import llm, taxonomy

named = json.load(open('named_sources.json'))
first = {}
for cid, v in named.items():
    first.setdefault(v['source'].strip(), v.get('context') or '')
names = sorted(first, key=str.lower)
count = collections.Counter(v['source'].strip() for v in named.values())
print(f'{len(named)} 条任务，{len(names)} 个不同的来源名')

GOAL = """下面每一行是从一批 benchmark 任务的原文里抽出来的**数据来源名**——那份输入数据
就是从它导出/下载/快照来的。名字是逐字照抄原文的，所以同一个东西会有多种写法
（`OpenSim` / `OpenSim 4.5` / `OSIM` 是一个东西），也可能是缩写或不完整。

对每一个名字判断三件事。"""

RULES = """- `canonical`：**这个东西的规范名字。**
  去掉版本号，展开缩写，统一大小写和拼写 —— `OpenSim 4.5`、`OSIM` 都归成 `OpenSim`，
  `BLS` 归成 `Bureau of Labor Statistics`。
  **同一个东西必须给完全相同的 canonical**，这批名字是按字母序排的，同族的变体大多
  挨在一起，请照着彼此给一致的答案。
  实在认不出是什么就把原名清理一下照抄。

- `kind`：这个来源是**什么类型的东西**，从下面五个里逐字选一个：
  - `软件产品`     一个真实存在的软件/系统，有自己的界面。OpenSim、VASP、Nacos、AutoCAD
  - `公开数据集`   一份具名的公开数据集，通常挂在某个仓库上。MNIST、Adult Census
                   Income、CWRU Bearing Dataset、NASA C-MAPSS
  - `数据门户`     政府或机构的公共数据查询/下载站点。NOAA、BLS、EPA、eCFR、SEC
  - `代码仓库`     GitHub 上的项目或开源组织的代码托管。LogPAI/loghub、Apache 系项目
  - `其他`         都不像

- `ui`：**一句话说这个来源的界面长什么样** —— 一个人要从它那里拿到数据，会看到什么、
  做哪些操作。例："台站/事件检索表单 + 结果列表 + 波形预览 + 打包下载"、
  "数据集详情页：说明、变量表、许可、单文件下载"。认不出具体产品时，按它这一类
  东西通常的样子写。这一句会被用来决定给它建什么样的界面，写具体一点。

只输出 JSON 数组：
[{"id":<编号>,"canonical":"...","kind":"...","ui":"..."}, ...]"""

BAT = 20
prompts = []
for b, chunk in enumerate(llm.batched(names, BAT)):
    body = []
    for j, nm in enumerate(chunk):
        ctx = ' '.join(first[nm].split())[:200]
        body.append(f'### {b*BAT+j}  「{nm}」  （原文出现 {count[nm]} 次）\n上下文：…{ctx}…')
    prompts.append(f'{GOAL}\n\n## 待判断的 {len(chunk)} 个名字\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')

# 并发压到 2：classify 还在跑，总并发别超过 5
A = llm.by_id(llm.ask('resolve', 'A', prompts, workers=2))
B = llm.by_id(llm.ask('resolve', 'B', prompts, workers=2))

out, dis = {}, collections.Counter()
for j, nm in enumerate(names):
    a, b_ = A.get(j), B.get(j)
    if not a:
        continue
    if b_ and (a.get('canonical') or '').lower() != (b_.get('canonical') or '').lower():
        dis['canonical'] += 1
    if b_ and a.get('kind') != b_.get('kind'):
        dis['kind'] += 1
    out[nm] = dict(canonical=(a.get('canonical') or nm).strip(),
                   kind=a.get('kind') or '其他', ui=a.get('ui') or '', n=count[nm])
print(f'\n两轮分歧：{dict(dis)} / {len(out)}')
canon = collections.Counter()
kinds = collections.Counter()
for nm, v in out.items():
    canon[v['canonical']] += v['n']
    kinds[v['kind']] += v['n']
print(f'\n{len(names)} 个名字 → {len(canon)} 个规范名')
print('按类型（任务条数）:', dict(kinds.most_common()))
print(f'\n规范化后 ≥3 条的:')
for k, n in canon.most_common():
    if n < 3:
        break
    kind = next(v['kind'] for v in out.values() if v['canonical'] == k)
    print(f'  {n:4d}  [{kind}] {k}')
print(f'\n剩下 {sum(1 for v in canon.values() if v < 3)} 个规范名各 <3 条，'
      f'共 {sum(v for v in canon.values() if v < 3)} 条')


# ─────────────────── 映射到 G2 品类：跟 classify.py 同一套词表 ───────────────────

canon = {}
for nm, v in out.items():
    c = canon.setdefault(v['canonical'], dict(kind=v['kind'], ui=v['ui'], n=0, raw=[]))
    c['n'] += v['n']
    c['raw'].append(nm)
uniq = sorted(canon, key=str.lower)
print(f'\n{len(names)} 个名字 → {len(uniq)} 个规范来源，开始映射到 G2 品类')

MENU = '\n\n'.join(f'### {sec}\n' + taxonomy.menu_text(sec) for sec in taxonomy.SECTIONS)
NMENU = sum(len(v) for v in taxonomy.LEVEL2.values())

MAP_GOAL = """下面每一行是一个**数据来源** —— 某批任务的输入数据就是从它导出/下载/快照来的。
你要判断：如果照着它建一个界面，最贴近下面菜单里的哪一个品类。

判断的是**这个来源本身是哪一类软件/网站**，不是它服务于哪个行业。
`kind` 和 `界面` 两栏是上一轮对它的描述，可以参考。"""

MAP_RULES = f"""- `slug`：**逐字取自菜单，或者填 null。**
  多个都说得通时选最具体的。
  只有当菜单里确实没有一项对得上时才填 null —— 有些来源没有对应的商业软件品类
  （某台专用仪器的原始导出、研究组内部流水线），那就是 null。
  注意菜单里是有 Simulation & CAE、Laboratory、Geology and Seismic、GIS、
  Data Science and Machine Learning Platforms 这些的，别因为来源"听起来很科研"就退回 null。

- `confidence`：0-1。

只输出 JSON 数组：[{{"id":<编号>,"slug":"..."|null,"confidence":0.0}}, ...]"""

BAT2 = 20
prompts = []
for b, chunk in enumerate(llm.batched(uniq, BAT2)):
    body = []
    for j, c in enumerate(chunk):
        v = canon[c]
        body.append(f"### {b*BAT2+j}  「{c}」  （{v['n']} 条任务）\n"
                    f"kind: {v['kind']}\n界面: {v['ui']}")
    prompts.append(f'{MAP_GOAL}\n\n## 品类菜单（{NMENU} 项，按分组排列）\n\n{MENU}\n\n'
                   f'## 待判断的 {len(chunk)} 个来源\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{MAP_RULES}')

MA = llm.by_id(llm.ask('resolve', 'map-A', prompts, workers=2))
MB = llm.by_id(llm.ask('resolve', 'map-B', prompts, workers=2))
mdis = sorted({j // BAT2 for j in set(MA) & set(MB) if MA[j].get('slug') != MB[j].get('slug')}
              | {j // BAT2 for j in range(len(uniq)) if j not in MA or j not in MB})
print(f'  map A/B 不一致或缺失 → 第三轮 {len(mdis)}/{len(prompts)} 批')
MC = llm.by_id(llm.ask('resolve', 'map-C', prompts, only=set(mdis), workers=2)) if mdis else {}

legal = {s for v in taxonomy.LEVEL2.values() for s in v}
slug_of = {}
for j, c in enumerate(uniq):
    vs = [r[j].get('slug') for r in (MA, MB, MC) if j in r]
    vs = [s if s in legal else None for s in vs]
    if vs:
        slug_of[c] = collections.Counter(vs).most_common(1)[0][0]

for nm, v in out.items():
    v['slug'] = slug_of.get(v['canonical'])
json.dump(out, open('source_map.json', 'w'), ensure_ascii=False, indent=0)

hit = {c: s for c, s in slug_of.items() if s}
covered = sum(canon[c]['n'] for c in hit)
byslug = collections.Counter()
for c, s in hit.items():
    byslug[s] += canon[c]['n']
print(f'\n映射到品类的来源 {len(hit)}/{len(uniq)} 个，覆盖 {covered}/{len(named)} 条任务，'
      f'落在 {len(byslug)} 个品类上')
print(f'没有对应品类的 {len(uniq)-len(hit)} 个来源，{len(named)-covered} 条任务')
print('\n最大的品类:')
for s, n in byslug.most_common(15):
    srcs = sorted((c for c in hit if hit[c] == s), key=lambda c: -canon[c]['n'])[:4]
    print(f'  {n:4d}  {s} | {taxonomy.NAME[s]}')
    print(f'        ← {", ".join(srcs)}')

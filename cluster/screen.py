"""筛：这条任务的输入数据，是不是从一个「多记录的 Web 界面」里查出来的。

这是整条流水线的第一道闸，也是唯一真正决定范围的一步。目标是把能复刻成网站的任务
挑出来 —— 招聘站、LIMS、工单系统、备案库、统计门户这类 —— 而不是给 1299 条全体找桶。

之前的教训：花了很大力气去分 simulation-cae（126 条 OpenSim/VASP）和
geology-and-seismic（46 条），陪审通过率 37% 和 6%。但它们根本不该进来 ——
OpenSim 是桌面建模工具，VASP 是 HPC 命令行，没有值得复刻的 Web 界面。
先筛再分，被筛掉的就不用管它分得准不准。

判据只看**数据是不是一组可浏览的记录**，不需要认出是什么软件 —— 这比"属于哪个品类"
好答得多，也正好对应已经建好的两个骨架（job-search、lims）的形态。

产出 screen.json
"""
import json, re, collections
import llm

rows = json.load(open('tasks.json'))
named = json.load(open('named_sources.json'))
sm = json.load(open('source_map.json'))
print(f'{len(rows)} 条，其中 {len(named)} 条已知来源')

GOAL = """判断每条任务的**输入数据**：它在现实里是不是从一个**多记录的 Web 界面**里
查出来 / 筛出来 / 导出来的？

具体地说：一个人要拿到这份数据，会不会经历「搜索 → 筛选 → 翻页 → 点开详情 → 导出」
这一串操作？界面上是不是摆着**一批同构的记录**，每条记录有若干字段，可以按字段筛？

**是**（`web`: yes）——
- 招聘网站的岗位列表（岗位、公司、薪资、城市）
- 实验室 LIMS 的批次与结果（批次、上机批、结果行、质控状态）
- 工单 / 缺陷跟踪系统的工单列表
- 商品目录、订单列表、申报备案库、法规条文库
- 政府或机构的统计数据门户（可按地区/年份/指标查询下载）
- 代码托管站的仓库、PR、issue 列表
- 监控/历史库的位号列表与趋势查询

**否**（`web`: no）——
- 桌面工程软件的工程文件：CAD 图纸、PCB 网表、有限元模型、生物力学模型定义（.osim）
- HPC / 命令行程序的输入输出：第一性原理计算、分子动力学、气象模式
- 一个公开数据集的下载包（就是几个文件，没有可浏览的记录界面）
- 单台仪器/传感器的原始采集流、示波器波形、单次试验的多通道时序
- 纯粹是为出题现编的抽象材料，没有任何真实系统作为出处

**拿不准**（`web`: unsure）—— 两边特征都有，或者信息不足以判断。

注意：**不要看任务要你做什么，只看输入数据本身长什么样。** 一条任务要求你写 Python
分析岗位数据，输入仍然是一张岗位记录表，答 yes；一条任务要求你搭个 Web 服务，但输入
是一个有限元模型文件，答 no。"""

RULES = """每条任务输出一个对象：

{"id": <编号>, "web": "yes"|"no"|"unsure", "records": "...", "ops": ["...", ...], "why": "..."}

- `records` —— 界面上那批记录是什么（"岗位"、"实验批次"、"申报记录"）。`web` 不是 yes 就填 null。
- `ops` —— 拿到这份数据需要的操作，从这些里选：`搜索` `筛选` `翻页` `详情展开` `排序` `导出` `跨表关联`。`web` 不是 yes 就填空数组。
- `why` —— 20 字以内，说清判断依据是数据里的什么。

只输出 JSON 数组，无其他文字。"""

BAT = 12
prompts = []
for b, chunk in enumerate(llm.batched(rows, BAT)):
    body = []
    for j, r in enumerate(chunk):
        src = ''
        v = named.get(r['custom_id'])
        if v:
            c = sm.get(v['source'].strip(), {})
            src = f"\n已知数据来源：{c.get('canonical') or v['source']}（{c.get('kind','')}）"
        body.append(f"### 任务 {b*BAT+j}{src}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\n"
                    f"files: {', '.join(r['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:500]}")
    prompts.append(f'{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')
print(f'{len(prompts)} 批 × 每批约 {len(prompts[0]):,} 字符')

A = llm.by_id(llm.ask('screen', 'A', prompts))
B = llm.by_id(llm.ask('screen', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('web') != B[j].get('web')]
miss = [j for j in range(len(rows)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('screen', 'C', prompts, only=set(third))) if third else {}

out = {}
for j, r in enumerate(rows):
    vs = [x[j] for x in (A, B, C) if j in x]
    if not vs:
        continue
    web, n = collections.Counter(x.get('web') for x in vs).most_common(1)[0]
    pick = next((x for x in vs if x.get('web') == web), vs[0])
    out[r['custom_id']] = dict(web=web, votes=f'{n}/{len(vs)}',
                               records=pick.get('records'), ops=pick.get('ops') or [],
                               why=pick.get('why'))
json.dump(out, open('screen.json', 'w'), ensure_ascii=False, indent=0)

c = collections.Counter(v['web'] for v in out.values())
print(f'\n═══ {len(out)} 条 → screen.json ═══')
print(' ', dict(c))
print('  投票一致度:', dict(collections.Counter(v['votes'] for v in out.values())))
yes = {k: v for k, v in out.items() if v['web'] == 'yes'}
print(f'\n通过筛选 {len(yes)} 条。记录类型 top:')
for r, n in collections.Counter(v['records'] for v in yes.values()).most_common(20):
    print(f'  {n:4d}  {r}')
print('\n操作组合 top:')
for o, n in collections.Counter('+'.join(sorted(v['ops'])) for v in yes.values()).most_common(8):
    print(f'  {n:4d}  {o}')

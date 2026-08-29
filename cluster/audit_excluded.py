"""复核被排除的 972 条：排除的理由是不是"这个来源我们根本模拟不了"。

第一道筛（screen.py）问的是"数据是不是来自可浏览的 Web 界面"，那是个代理指标。
真正的判据是**能不能给这个来源做一个可信的网页复刻**。两者大部分重合，但有系统性
差异：UCI / Zenodo / NCBI GEO / Materials Project / IRIS-FDSN / MLflow 全都是网站，
第一道筛却按"就是几个文件的下载包"把它们排掉了 —— 旧版给这些打过标签的有 171 条。

所以这一轮换成**正向词表**：先给出确定模拟不了的 10 类（每类点具体仪器/软件），
再给出确定可以模拟的网站类。判不进"模拟不了"的，就得说出它的来源系统是什么。

已知来源的任务（named_sources）把来源名、类型、界面描述一并喂进去 —— 那是最硬的线索，
不用白不用。

产出 audit.json
"""
import json, re, collections
import llm

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
sc = json.load(open('screen.json'))
named = json.load(open('named_sources.json'))
sm = json.load(open('source_map.json'))
ids = [c for c, v in sc.items() if v['web'] != 'yes']
known = sum(1 for c in ids if c in named)
print(f'被排除 {len(ids)} 条，其中 {known} 条原文点名了来源')

BLOCKED = [
 ("台架与产线采集", "试验台/产线的多通道采集与回放，单台设备调试跑出的阶跃时序。"
                    "NI DIAdem、NI LabVIEW、Dewesoft X、HBM catman"),
 ("实验室仪器原始导出", "一台仪器一次实验吐出来的原始读数。酶标仪吸光度、色谱逐针、"
                        "质谱、光谱、NMR 谱图、示波器波形、全站仪观测点、EDI 测点"),
 ("工程仿真与科学计算", "CFD 流体仿真、FEA 有限元、电磁仿真、第一性原理 DFT、分子动力学。"
                        "ANSYS、COMSOL、Abaqus、VASP、LAMMPS、GROMACS、Quantum ESPRESSO、WRF"),
 ("生物力学建模", "动捕与肌骨建模的模型定义与派生产物：.osim 模型、逆运动学/逆动力学结果、"
                  "地面反力。OpenSim、Vicon Nexus、Qualisys QTM、Pose2Sim"),
 ("地球物理处理与反演", "道集处理解释工作站的工程数据、波场快照、测深反演、井震标定。"
                        "Petrel、OpendTect、SeisSpace、Kingdom；MT/AMT、VTI 波场"),
 ("CAD/EDA 桌面工程文件", "图纸与模型文件：dxf/dwg 图纸、三维装配、PCB 网表、BIM 模型、"
                          "材料 CIF 结构文件。AutoCAD、SolidWorks、Altium、Revit"),
 ("源码仓库", "待修复或待分析的源码树、固件工程、构建脚本。给的是一个代码压缩包"),
 ("图像与媒体素材", "像素级标注图、影像序列、视频、音频、游戏窗口画面、扫描图册"),
 ("合成夹具", "为出题现编的抽象材料：fixtures + rules + output_contract 三件套，"
              "字段全是 id/rule/case/mode 这类无领域含义的通用名，或明确声明 synthetic"),
 ("HPC 算例输出", "集群作业跑出来的数值结果文件与日志，没有可查询的界面"),
]
WEBBY = [
 ("公开数据集仓库", "UCI ML Repository、Zenodo、figshare、Kaggle Datasets —— 数据集列表、"
                    "变量表、许可、下载页"),
 ("组学数据仓库", "NCBI GEO、ENA、Ensembl、TCGA —— 样本与实验检索"),
 ("材料性质数据库", "Materials Project、AFLOW、OQMD、NOMAD —— 结构与性质检索"),
 ("台站波形数据中心", "IRIS/FDSN、SeisComP —— 台站/事件检索表单 + 结果列表 + 打包下载"),
 ("政府统计与开放数据门户", "EPA、BLS、Eurostat、USGS、NOAA、国家统计局 —— 按地区/年份/指标查询下载"),
 ("备案与合规检索库", "ECHA、FDA Orange Book、eCFR、SEC、住建部/药监局备案平台"),
 ("ML 实验跟踪", "MLflow、Weights & Biases、Neptune —— 逐 run 指标对比与模型版本"),
 ("游戏运营后台", "游戏数值/活动配置后台、排行榜与账本查询"),
 ("HPC 作业门户", "OpenOnDemand、Slurm 的 Web 队列 —— 作业列表与算例日志"),
]

GOAL = f"""判断每条任务的**输入数据来自什么系统**，目的是决定我们能不能给那个系统
做一个可信的**网页复刻**。

我们要复刻的是网站：有检索框、筛选器、结果列表、详情页、导出按钮的那种。
装不进网页的东西一律排除 —— 桌面工程软件的工程文件、仪器吐出来的原始读数、
集群算出来的数值结果、一个代码仓库。

## 确定模拟不了的 {len(BLOCKED)} 类

""" + '\n'.join(f'{i+1}. **{k}** —— {v}' for i, (k, v) in enumerate(BLOCKED)) + f"""

## 确定可以模拟的网站类（举例，不限于此）

""" + '\n'.join(f'- **{k}** —— {v}' for k, v in WEBBY) + """

**判断依据是输入数据本身，不是任务要你做什么。** 一条任务要求你写 Python 分析
UCI 上下载的数据集，输入仍然来自一个数据集仓库网站，可以模拟；一条任务要求你搭个
Web 服务，但输入是有限元模型文件，模拟不了。

**注意"公开数据集"这一类容易判错。** 数据集本身是几个文件，但它挂在 UCI / Kaggle /
Zenodo 这样的**仓库网站**上，那个网站有数据集列表、变量说明、许可、版本、下载页 ——
完全可以复刻。只有当原文没有任何仓库线索、就是一包裸文件时，才算模拟不了。"""

RULES = f"""每条任务输出一个对象：

{{"id": <编号>, "verdict": "blocked"|"web", "category": "...", "source": "...", "why": "..."}}

- `verdict` —— `blocked` 表示模拟不了，`web` 表示其实可以模拟。
- `category` —— `blocked` 时逐字取自上面 {len(BLOCKED)} 类之一；`web` 时逐字取自网站类
  之一，或者自己写一个短名（不在举例里也没关系，只要它确实是个有列表/详情/导出的网站）。
- `source` —— `web` 时说出那个来源系统是什么（能认出具体产品就写产品名，认不出就写
  这类系统的通称）。`blocked` 时填 null。
- `why` —— 20 字以内，说清依据是数据里的什么。

只输出 JSON 数组，无其他文字。"""


def brief(i, c):
    r, s = byid[c], sc[c]
    hint = ''
    v = named.get(c)
    if v:
        m = sm.get(v['source'].strip(), {})
        hint = (f"\n**原文点名的数据来源：{m.get('canonical') or v['source']}**"
                f"（类型：{m.get('kind','?')}；界面：{(m.get('ui') or '')[:70]}）")
    return (f"### 任务 {i}{hint}\ntask_name: {r['task_name']}\n"
            f"industry_domain: {r['industry_domain']}\n"
            f"files: {', '.join(r['files'][:6])}\n"
            f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:850]}\n"
            f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:450]}")


BAT = 15
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = '\n\n'.join(brief(b*BAT+j, c) for j, c in enumerate(chunk))
    prompts.append(f'{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n{body}\n\n## 输出\n\n{RULES}')
print(f'{len(prompts)} 批 × 每批约 {len(prompts[0]):,} 字符')

A = llm.by_id(llm.ask('audit', 'A', prompts))
B = llm.by_id(llm.ask('audit', 'B', prompts))
dis = [j for j in set(A) & set(B) if A[j].get('verdict') != B[j].get('verdict')]
miss = [j for j in range(len(ids)) if j not in A or j not in B]
third = sorted({j // BAT for j in dis + miss})
print(f'A/B 不一致 {len(dis)} 条，缺失 {len(miss)} 条 → 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('audit', 'C', prompts, only=set(third))) if third else {}

BK = {k for k, _ in BLOCKED}
out = {}
for j, c in enumerate(ids):
    vs = [x[j] for x in (A, B, C) if j in x]
    if not vs:
        continue
    v, n = collections.Counter(x.get('verdict') for x in vs).most_common(1)[0]
    pick = next((x for x in vs if x.get('verdict') == v), vs[0])
    cat = pick.get('category')
    if v == 'blocked' and cat not in BK:
        cat = '其他'
    out[c] = dict(verdict=v, category=cat, source=pick.get('source'),
                  why=pick.get('why'), votes=f'{n}/{len(vs)}',
                  screen_why=sc[c]['why'], had_source=c in named)
json.dump(out, open('audit.json', 'w'), ensure_ascii=False, indent=0)

vc = collections.Counter(v['verdict'] for v in out.values())
print(f'\n═══ {len(out)} 条 → audit.json ═══')
print(' ', dict(vc))
print('  一致度:', dict(collections.Counter(v['votes'] for v in out.values())))
print('\n模拟不了的，按类别:')
for k, n in collections.Counter(v['category'] for v in out.values()
                                if v['verdict'] == 'blocked').most_common():
    print(f'  {n:4d}  {k}')
web = {k: v for k, v in out.items() if v['verdict'] == 'web'}
print(f'\n★ 判为其实可以模拟的 {len(web)} 条，按来源类别:')
for k, n in collections.Counter(v['category'] for v in web.values()).most_common(20):
    print(f'  {n:4d}  {k}')
print(f'\n  其中原文点名了来源的 {sum(1 for v in web.values() if v["had_source"])} 条')

"""第二大步：原文没写来源的任务，按品类菜单分类。

菜单是剪枝后的 G2 品类 + 手写补充项，喂给模型前去掉产品举例，免得它照抄名字。
每条问两件事：最贴近哪个品类，以及这份数据在现实里到底有没有真实出处
（有些任务的材料是为出题现编的，没有界面可照着建）。

跑法是 A/B 两轮 + 定向第三轮 —— 只有 A、B 不一致或缺失的批次才跑 C，
不是全量三倍成本。

产出 categories.json
"""
import json, re, collections
import llm
from menu import SUPPLEMENT

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
named = json.load(open('named_sources.json'))
poison = json.load(open('poison_names.json'))
g2 = json.load(open('g2_categories.json'))
keep = json.load(open('menu_keep.json'))


def strip_ex(d):
    """去掉品类描述里的产品举例，只留品类本身。"""
    return re.sub(r'\s*[（(].*', '', d.split('——')[0]).strip() or d[:60]


MENU = '\n'.join([f'{s} | {g2[s]}' for s in keep] +
                 [f'{s} | {strip_ex(d)}' for s, d in SUPPLEMENT.items()])

todo = [r['custom_id'] for r in rows if r['custom_id'] not in named]
print(f'待分类 {len(todo)} 条（find_sources.py 已钉死 {len(named)} 条），'
      f'其中带毒名的 {len([c for c in todo if c in poison])} 条')

GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题（Python/Excel 之类一律不算）。问的是：这份数据原本躺在谁的界面里？
一个人要拿到它，会去哪个系统里翻页、筛选、点开详情、导出？

**出处优先于场景。** 如果原文写了数据的来路（"数据来自…"、"从…下载"、"公开 benchmark"、
"CC-BY / CC0 许可"、"可自由再分发"），那个来路就是答案——**不要因为任务描述里的岗位场景
（"你是设备状态监测工程师，工厂有一套试验台…"）就改判成那个场景里的系统。**
公开数据集套一个虚构岗位，出处仍然是数据集仓库。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。
industry_domain 只能弱参考——它说的是"谁在用"，不是"数据出自哪个系统"。"""

RULES = """每条给两个独立判断：

- `slug`：必须逐字取自菜单，任何情况都要给一个；多个都说得通时选最具体的
  （`mechanical-computer-aided-design-mcad` 优先于 `cad`）。

- `source_real`：**只看数据本身有没有真实出身，不要看你能不能认出是哪个产品。**
  - `"yes"` —— 数据带领域特征：专业字段名、物理单位、专有格式、可信的记录规模、
    真实地名/机构名/型号。**认不出具体产品也照样填 yes** ——现实里绝大多数数据
    来自没有名气的内部系统，认不出是常态，不是"没有来源"的证据。
  - `"no"` —— 只在数据明显是为出题现编时才用：字段全是 id/rule/case/mode 这类
    无领域含义的通用名，没有任何单位或专有格式，体量只有几百字节到几 KB。
  - `"unsure"` —— 两边特征都有。

- `confidence`：0-1，对 `slug` 的把握。

只输出 JSON 数组：[{"id":<编号>,"slug":"...","source_real":"yes|no|unsure","confidence":0.0}, ...]"""

prompts = []
for b, chunk in enumerate(llm.batched(todo, 12)):
    body = []
    for j, cid in enumerate(chunk):
        r = byid[cid]
        warn = ''
        if cid in poison:
            v = poison[cid]
            nm = '、'.join(f'「{x}」' for x in v['names'])
            warn = (f"\n⚠ 本任务提到的 {nm} 已判定为**{v['role']}**，"
                    f"不是数据来源，不要据此判断。")
        fn = ', '.join(r['files'][:6])
        body.append(f"### 任务 {b*12+j}{warn}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\nfiles: {fn}\n"
                    f"task_description: {re.sub(r'\s+',' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+',' ', r['reqs'])[:600]}")
    prompts.append(f"{GOAL}\n\n## 品类菜单（{len(MENU.splitlines())} 项）\n\n{MENU}\n\n"
                   f"## 再说一遍\n\n{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n" +
                   '\n\n'.join(body) + f"\n\n## 输出\n\n{RULES}")

A = llm.by_id(llm.ask('classify', 'A', prompts))
B = llm.by_id(llm.ask('classify', 'B', prompts))

# 只补跑分歧和缺失的批次
disagree = [j for j in set(A) & set(B) if A[j].get('slug') != B[j].get('slug')]
missing = [j for j in range(len(todo)) if j not in A or j not in B]
third = sorted({j // 12 for j in disagree + missing})
print(f'\nA/B 不一致 {len(disagree)} 条，缺失 {len(missing)} 条 '
      f'→ 第三轮 {len(third)}/{len(prompts)} 批')
C = llm.by_id(llm.ask('classify', 'C', prompts, only=set(third))) if third else {}

out = {}
for j, cid in enumerate(todo):
    vs = [r[j] for r in (A, B, C) if j in r]
    if not vs:
        continue
    slug, n = collections.Counter(v.get('slug') for v in vs).most_common(1)[0]
    out[cid] = dict(slug=slug, votes=n, of=len(vs),
                    source_real=collections.Counter(v.get('source_real') for v in vs).most_common(1)[0][0],
                    confidence=round(sum(v.get('confidence') or 0 for v in vs) / len(vs), 2))
json.dump(out, open('categories.json', 'w'), ensure_ascii=False, indent=0)

print(f'\n分类 {len(out)} 条 → categories.json')
print('投票一致度:', dict(collections.Counter(f"{v['votes']}/{v['of']}" for v in out.values())))
print('source_real:', dict(collections.Counter(v['source_real'] for v in out.values())))

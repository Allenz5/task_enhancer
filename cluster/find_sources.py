"""找出原文已经写明数据来源的任务。

这些任务不需要猜 —— 出处就写在题面里。剩下的才交给 classify.py 按品类菜单分类。

内部跑两轮模型，两轮都必要：
  一轮  通读原文，把可能跟数据出身有关的名字列出来（高召回，宁可多给）
  二轮  判断每个名字扮演什么角色 —— 出现 ≠ 是来源，同一个名字可能是解题工具、
        产出物、或数据内容里的一个字段值

两轮之间做落地校验：名字和引用都必须能在原文里字符串匹配上，否则丢弃。这是模型抽取
唯一比不上正则的地方 —— 正则命中一定真实存在 —— 所以要显式补回来。

产出
  named_sources.json  原文点明来源的任务 → {来源名, 置信度, 上下文}
  poison_names.json   原文提了名字但不是来源的任务 → {名字, 角色}
                      classify.py 会把这些名字标成陷阱注进 prompt，免得分类器被带偏
"""
import json, re, collections
import llm

rows = json.load(open('tasks.json'))
ids = [r['custom_id'] for r in rows]
byid = {r['custom_id']: r for r in rows}

# 通用工具链：从来不是数据来源。这份名单同时喂进 prompt 和落地校验，只此一处。
TOOLCHAIN = ['Python', 'Excel', 'Microsoft Excel', 'MATLAB', 'Docker', 'Kubernetes',
             'Git', 'VS Code', 'NumPy', 'pandas', 'Jupyter', 'PyTorch', 'TensorFlow',
             'scikit-learn', 'PostgreSQL', 'MySQL', 'SQLite', 'nginx', 'Linux',
             'Ubuntu', 'Django', 'Flask', 'FastAPI', 'Node.js']
_toolchain = {t.lower() for t in TOOLCHAIN}


def flat(r):
    """一条任务的全部可搜文本，压成一行。分隔符防止跨字段拼出假匹配。"""
    return re.sub(r'\s+', ' ', ' ⏐ '.join(
        [r['task_name'], r['desc'], r['reqs'], r['verify'], ' '.join(r['files'])]))


def brief(i, r):
    return (f"### 任务 {i}\n"
            f"task_name: {r['task_name']}\n"
            f"industry_domain: {r['industry_domain']}\n"
            f"files: {', '.join(r['files'][:8]) or '(无)'}\n"
            f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
            f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:700]}\n"
            f"verification_method: {re.sub(r'\s+', ' ', r['verify'])[:300]}")


# ─────────────────────────── 一轮：把名字找出来 ───────────────────────────

FIND_GOAL = f"""判断每条任务的原文里，有没有**直接写出输入数据的来源** —— 那份数据是从哪个
软件、网站、数据库、公开仓库里导出/下载/快照来的，名字有没有被明写出来。

这一步只负责**把名字找出来**，不要判断它到底是不是来源 —— 下一步会单独判。
所以**宁可多给，不要漏**：只要一个名字有可能跟这份数据的出身有关，就列出来。
包括你拿不准是解题工具还是数据来源的那些（"不得重跑 LAMMPS"里的 LAMMPS 也要列）。

只有一类不要列 —— 通用工具链，它们从来不是数据来源：
{'、'.join(TOOLCHAIN)}"""

FIND_RULES = """每条任务输出一个对象：

{"id": <编号>, "names": [{"name": "...", "quote": "..."}, ...]}

- `name` —— 名字本身，**逐字照抄原文**，不要翻译、不要补全、不要改大小写。
  网址和域名也算名字（写成 `uci.edu`、`https://...` 这样）。
- `quote` —— 这个名字所在的那一小段原文，**逐字照抄，20–60 字**，必须包含 `name`。
  我们会拿这段回原文里做字符串匹配，对不上的会被丢弃，所以不要改写、不要拼接
  两处不相邻的文字。
- 一个名字在原文里出现多次时只列一次；有几个列几个，不设上限。
- 原文没有点名任何来源时，`names` 填空数组 `[]`。

只输出一个 JSON 数组，无其他文字。"""

prompts = []
for b, chunk in enumerate(llm.batched(rows, 10)):
    body = '\n\n'.join(brief(b*10+j, r) for j, r in enumerate(chunk))
    prompts.append(f'{FIND_GOAL}\n\n## 待判断的 {len(chunk)} 条任务\n\n{body}'
                   f'\n\n## 输出\n\n{FIND_RULES}')
found = llm.by_id(llm.ask('find_sources', 'names', prompts))

# ─────────────────── 落地校验：名字必须真的在原文里 ───────────────────

cands, drop, lost = {}, collections.Counter(), []
for j, cid in enumerate(ids):
    if j not in found:
        lost.append(cid)
        continue
    text = flat(byid[cid])
    seen = {}
    for it in (found[j].get('names') or []):
        if not isinstance(it, dict):
            drop['返回格式不对'] += 1
            continue
        name = (it.get('name') or '').strip()
        quote = re.sub(r'\s+', ' ', it.get('quote') or '').strip()
        if not name or name.lower() in seen:
            continue
        if name.lower() in _toolchain:
            drop['通用工具链'] += 1
        elif name.lower() not in text.lower():
            drop['名字不在原文'] += 1
        elif quote and quote.lower() not in text.lower():
            drop['引用对不上'] += 1
        else:
            at = text.lower().find(name.lower())
            seen[name.lower()] = (name, text[max(0, at-110):at+len(name)+110])
    if seen:
        cands[cid] = {name: ctx for name, ctx in seen.values()}

print(f'\n候选 {len(cands)}/{len(ids)} 条任务，{sum(len(v) for v in cands.values())} 个名字')
print(f'  原文确实没提任何来源  {len(ids)-len(cands)-len(lost)} 条')
print(f'  丢弃的候选  {dict(drop) or "无"}')
if lost:
    print(f'  ⚠ 模型没返回结果  {len(lost)} 条')

# ─────────────────── 二轮：这个名字扮演什么角色 ───────────────────

ROLE_GOAL = """判断任务描述里提到的那个名字，**到底是不是这份数据的出处**。

一个名字出现在文里，可能是五种角色之一：

- `出处`       这份输入数据就是从它导出/下载/快照来的。
               例："数据来自 UCI…"、"使用冻结的 eCFR XML 快照"、"附件为从 BLS 导出"、
               "文件格式：OpenSim XML"、"上游 OpenSim 缩放和 IK 的产出"
- `产出物`     它是这道题要生成的东西，不是输入。
               例："生成 Neuroglancer 状态文件"、"构建可供 M3GNet 风格模型使用的图"
- `数据里的值` 名字是数据内容中的一个字段值，不是数据的来源。
               例：数据是招聘岗位表，文中的 RenderDoc 是某个岗位要求里列的技能
- `解题工具`   拿它来算/来跑，或明确说不用跑它。
               例："不得重跑 LAMMPS"、"若无 VASP 则跳过"、"受 Seedance 单次时长限制"
- `无关`       任务自造的项目名，或纯属提及

注意否定句是陷阱：「不需要运行 VASP 能量计算」里的 VASP 是解题工具且明确不用，不是出处。"""

ROLE_RULES = """每条任务输出一个对象：

{"id": <编号>, "source": "<确认为出处的那个名字>"|null, "role": "出处"|"产出物"|"数据里的值"|"解题工具"|"无关", "confidence": 0.0}

- 一条任务给了多个候选时，只要**其中任何一个**是出处，就把那个名字填进 `source`，
  `role` 填 `出处`。
- 都不是出处时 `source` 填 null，`role` 填最贴切的那一种。
- 名字要**逐字**照抄候选，不要改写不要补全。

只输出 JSON 数组，无其他文字。"""

cand_ids = list(cands)
prompts = []
for b, chunk in enumerate(llm.batched(cand_ids, 12)):
    body = []
    for j, cid in enumerate(chunk):
        lines = '\n'.join(f'  - 候选「{n}」上下文：…{c}…' for n, c in cands[cid].items())
        body.append(f"### 任务 {b*12+j}\n任务名：{byid[cid]['task_name']}\n{lines}")
    prompts.append(f'{ROLE_GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{ROLE_RULES}')
roles = llm.by_id(llm.ask('find_sources', 'roles', prompts))

# ─────────────────────────── 分成两路 ───────────────────────────

named, poison, odd = {}, {}, collections.Counter()
for j, cid in enumerate(cand_ids):
    v = roles.get(j)
    if not v:
        odd['模型没返回'] += 1
        continue
    if v.get('role') == '出处' and v.get('source'):
        name = v['source'].strip()
        # 模型可能改了大小写，按小写找回原始候选
        ctx = next((c for n, c in cands[cid].items() if n.lower() == name.lower()), None)
        if ctx is None:
            odd['出处名不在候选里'] += 1
            continue
        named[cid] = dict(source=name, confidence=v.get('confidence'), context=ctx)
    else:
        poison[cid] = dict(names=list(cands[cid]), role=v.get('role'))

json.dump(named, open('named_sources.json', 'w'), ensure_ascii=False, indent=0)
json.dump(poison, open('poison_names.json', 'w'), ensure_ascii=False, indent=0)

seen_roles = collections.Counter(roles[j].get('role') for j in range(len(cand_ids)) if j in roles)
print(f'\n角色判定 {sum(seen_roles.values())}/{len(cand_ids)} 条：{dict(seen_roles)}')
if odd:
    print(f'  ⚠ {dict(odd)}')
print(f'\n原文点名来源  {len(named)} 条 → named_sources.json')
print(f'提了名字但不是来源  {len(poison)} 条 → poison_names.json')
print(f'待 classify.py 分类  {len(ids)-len(named)} 条')
print('\n最常见来源:')
for s, n in collections.Counter(v['source'].lower() for v in named.values()).most_common(10):
    print(f'  {n:4d}  {s}')

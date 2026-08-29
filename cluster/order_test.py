"""长菜单会不会造成位置偏差：把菜单打乱，看同一批任务的答案变不变。

直接量"选中项在菜单里的位置分布"是有混淆的 —— 菜单按 G2 树序排，语义相近的品类
本来就挨在一起，而任务本身集中在几个领域，扎堆是意料之中。

所以要对照着看两个数：
  A vs B      同一份菜单、同一个 prompt，纯采样噪声   ← 基准
  A vs SHUF   菜单打乱，其余逐字不变                 ← 想测的
如果 A-SHUF 的分歧明显高于 A-B，说明顺序在起作用；差不多，就说明没有。

复用 recover 那一轮的任务与 prompt，只把菜单行的顺序打乱（分组标题也一起打散）。
"""
import json, re, random, collections
import llm, taxonomy

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
cat = json.load(open('categories.before_recover.json'))
todo = [c for c, v in cat.items() if v['section'] and not v['slug']]

BAT = 16
NBATCH = 4                       # 只测前 4 批 = 64 条
src = open('recover.py').read()
GOAL = src.split('GOAL = """')[1].split('""" % N')[0] % sum(len(v) for v in taxonomy.LEVEL2.values())
RULES = src.split('RULES = f"""')[1].split('"""')[0]
N = sum(len(v) for v in taxonomy.LEVEL2.values())
RULES = RULES.replace('{N}', str(N)).replace('{{', '{').replace('}}', '}')

flat = [f'{s} | {taxonomy.NAME[s]}' for sec in taxonomy.SECTIONS for s in taxonomy.LEVEL2[sec]]
random.Random(7).shuffle(flat)
SHUF = '\n'.join(flat)           # 打乱：不再分组，纯粹一份乱序清单

prompts = []
for b, chunk in enumerate(llm.batched(todo, BAT)[:NBATCH]):
    body = []
    for j, cid in enumerate(chunk):
        r = byid[cid]
        body.append(f"### 任务 {b*BAT+j}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\n"
                    f"files: {', '.join(r['files'][:6])}\n"
                    f"task_description: {re.sub(r'\s+', ' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\s+', ' ', r['reqs'])[:600]}")
    prompts.append(f'{GOAL}\n\n## 品类菜单（{N} 项）\n\n{SHUF}\n\n'
                   f'## 待判断的 {len(chunk)} 条\n\n' + '\n\n'.join(body) +
                   f'\n\n## 输出\n\n{RULES}')

S = llm.by_id(llm.ask('order', 'SHUF', prompts, workers=2))


def load(tag):
    import glob
    o = {}
    for f in sorted(glob.glob(f'runs/recover/{tag}/*.json'))[:NBATCH]:
        m = re.search(r'\[.*\]', open(f).read(), re.S)
        if not m:
            continue
        try:
            arr = json.loads(m.group(0))
        except Exception:
            continue
        for r in arr:
            if isinstance(r, dict) and 'id' in r:
                o[int(r['id'])] = r
    return o


A, B = load('A'), load('B')
idx = range(NBATCH * BAT)


def cmp(X, Y, label):
    both = [j for j in idx if j in X and j in Y]
    if not both:
        print(f'{label}: 无重叠')
        return
    same = sum(1 for j in both if X[j].get('slug') == Y[j].get('slug'))
    nullflip = sum(1 for j in both
                   if (X[j].get('slug') is None) != (Y[j].get('slug') is None))
    print(f'  {label:16s} 一致 {same}/{len(both)} = {same/len(both):5.1%}    '
          f'其中一方 null 另一方不是：{nullflip}')


print(f'\n═══ {NBATCH*BAT} 条任务，菜单 {N} 项 ═══')
cmp(A, B, 'A vs B（基准）')
cmp(A, S, 'A vs 打乱')
cmp(B, S, 'B vs 打乱')
for tag, X in (('A', A), ('B', B), ('SHUF', S)):
    n = sum(1 for j in idx if j in X and X[j].get('slug'))
    m = sum(1 for j in idx if j in X)
    print(f'  {tag:5s} 给出品类 {n}/{m}')

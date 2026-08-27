import json, os, random, numpy as np, collections
rows = json.load(open('tasks.json'))
L = {}
L.update(dict(np.load('labels_text.npz')))
L.update(dict(np.load('labels_llm.npz')))
L.update(dict(np.load('labels_m11.npz')))
METHODS = ['B0_industry_domain','M1_lexicon','M4_lsa_kmeans','M9_llm_fuzzy','M10_hybrid','M11_llm_taxonomy']
rnd = random.Random(7)
NP = 50
pairs = []   # (method, i, j)
for m in METHODS:
    lab = L[m]
    groups = collections.defaultdict(list)
    for i, v in enumerate(lab): groups[int(v)].append(i)
    pool = [g for g in groups.values() if len(g) >= 2]
    got = set()
    while len(got) < NP:
        g = rnd.choice(pool); i, j = rnd.sample(g, 2)
        got.add((min(i,j), max(i,j)))
    for i, j in got: pairs.append((m, i, j))
# negative control: random pairs
ctrl = set()
while len(ctrl) < NP:
    i, j = rnd.sample(range(len(rows)), 2); ctrl.add((min(i,j), max(i,j)))
for i, j in ctrl: pairs.append(('CTRL_random', i, j))

rnd.shuffle(pairs)
json.dump(pairs, open('eval_pairs.json','w'))
print('pairs', len(pairs))

def dig(i):
    r = rows[i]
    return (f"name: {r['task_name']}\ndomain: {r['industry_domain']}\n"
            f"files: {', '.join((f['name'] or '') for f in r['files'][:6])}\n"
            f"desc: {r['desc'][:420]}\nreqs: {r['reqs'][:300]}")

HEAD = """你在评估一个任务聚类结果。下面是若干**任务对**。

对每一对判断：**能不能用同一个 Web 应用（同一套界面骨架：同样的导航、列表/详情形态、筛选器、导出方式）来承载这两个任务的输入数据**？只换数据内容、不改界面结构，算可以。
学科相同但界面形态不同（比如一个是仓库diff、一个是工单看板），算不可以。

对每对输出：{"pid": 编号, "same_site": true/false, "why": "不超过20字"}
只输出 JSON 数组，无解释，无 markdown 围栏。

"""
os.makedirs('ev', exist_ok=True)
B = 8
for s in range(0, len(pairs), B):
    body = []
    for k, (m, i, j) in enumerate(pairs[s:s+B]):
        body.append(f"### PAIR {s+k}\n--- A ---\n{dig(i)}\n--- B ---\n{dig(j)}\n")
    open(f'ev/e{s:05d}.txt','w').write(HEAD + '\n'.join(body))
print('eval batches', len(os.listdir('ev')))

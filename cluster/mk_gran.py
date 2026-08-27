# 粒度检验：站内任务对 vs 相邻站间任务对，问判官"能否共用一套界面骨架"
# 若某两站的站间同源率 ≈ 站内同源率，说明这两站该合并（粒度偏细）
import json,random,collections,os,itertools
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
F=json.load(open('FINAL.json')); tasks=json.load(open('tasks.json'))
ds={int(k):v for k,v in F.items() if v['kind']=='data-source'}
by=collections.defaultdict(list)
for k,v in ds.items(): by[v['site']].append(k)
sk={v['site']:v['sk'] for v in ds.values()}
sites=[s for s in by if len(by[s])>=4]
# 用骨架描述找"相邻"站对（最容易混淆的，也就是最该检验的）
V=TfidfVectorizer(token_pattern=r'[A-Za-z0-9一-鿿]{1,}',ngram_range=(1,2),sublinear_tf=True)
M=normalize(V.fit_transform([sites[i]+' '+sk[sites[i]] for i in range(len(sites))]))
Sim=(M@M.T).toarray(); np.fill_diagonal(Sim,-1)
pairs=[]
for i in range(len(sites)):
    j=int(np.argmax(Sim[i]))
    a,b=sorted((i,j))
    if (a,b) not in [(x[0],x[1]) for x in pairs]: pairs.append((a,b,float(Sim[i][j])))
pairs=sorted(pairs,key=lambda x:-x[2])[:22]
rnd=random.Random(7)
def eb(i):
    t=tasks[i]
    return (f"任务: {t['task_name']}\n文件: {', '.join((f['name'] or '') for f in t['files'][:4])}\n"
            f"描述: {(t['desc'] or '')[:300]}")
HEAD="""下面两个任务，各自都要把自己的输入数据放进一个网页界面里操作。

请判断：**能否用同一套界面骨架**（同样的导航、同样的列表/详情形态、同样的筛选器、同样的导出方式）同时承载这两份数据？

只看界面形态，不看学科领域。只输出 YES 或 NO，不要解释。

"""
os.makedirs('gran',exist_ok=True); meta=[]
K=8   # 每种情形抽 8 对
for a,b,s in pairs:
    A,B=sites[a],sites[b]
    for kind,src in (('within',(A,A)),('within',(B,B)),('between',(A,B))):
        for _ in range(K):
            xa=rnd.choice(by[src[0]]); xb=rnd.choice(by[src[1]])
            if xa==xb: continue
            meta.append({'kind':kind,'A':A,'B':B,'pairsite':f"{A} || {B}",
                         'prompt':HEAD+f"任务一:\n{eb(xa)}\n\n任务二:\n{eb(xb)}\n"})
for j,m in enumerate(meta): open(f'gran/q{j:04d}.txt','w').write(m['prompt'])
json.dump(meta,open('gran/_meta.json','w'),ensure_ascii=False)
print(f"{len(pairs)} 组相邻站对 -> {len(meta)} 道题")
for a,b,s in pairs[:8]: print(f"  sim={s:.2f}  {sites[a][:34]}  ||  {sites[b][:34]}")

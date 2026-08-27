# 硬负例 + 同题 AB/BA 配对
import json,random,sys,os,collections,numpy as np,scipy.sparse as sp
from sklearn.preprocessing import normalize
MODE=sys.argv[1]; OUT=sys.argv[2]; SEED=int(sys.argv[3]); NP=int(sys.argv[4])
F=json.load(open('FINAL.json')); tasks=json.load(open('tasks.json'))
ds={int(k):v['site'] for k,v in F.items() if v['kind']=='data-source'}
by=collections.defaultdict(list)
for k,v in ds.items(): by[v].append(k)
sites=[s for s in by if len(by[s])>=6]
X=normalize(sp.load_npz('tfidf.npz'))
C=normalize(np.vstack([np.asarray(X[by[s]].mean(axis=0)).ravel() for s in sites]))
S=C@C.T; np.fill_diagonal(S,-1)
near={sites[i]: sites[int(np.argmax(S[i]))] for i in range(len(sites))}
rnd=random.Random(SEED)
def eb(i):
    t=tasks[i]
    return (f"任务: {t['task_name']}\n领域: {t['industry_domain']}\n"
            f"文件: {', '.join((f['name'] or '') for f in t['files'][:5])}\n"
            f"描述: {(t['desc'] or '')[:420]}")
HEAD="""判断下面这个任务的**输入数据**更可能来自哪一个网站/软件。判据是界面骨架：哪个站的导航、列表/详情形态、筛选器和导出方式，能直接承载这份数据。

只输出 A 或 B，不要解释。

"""
pool=[k for k in ds if ds[k] in sites]
picks=rnd.sample(pool,min(NP,len(pool)))
items=[]
for i in picks:
    true=ds[i]
    neg = near[true] if MODE=='hard' else rnd.choice([s for s in sites if s!=true])
    if neg==true: continue
    for swap in (False,True):                      # 同一题正反各问一次
        a,b=(true,neg) if not swap else (neg,true)
        items.append({'i':i,'true':true,'neg':neg,'swap':swap,'ans':'B' if swap else 'A',
                      'prompt':HEAD+f"{eb(i)}\n\nA. {a}\nB. {b}\n"})
os.makedirs(OUT,exist_ok=True)
for j,it in enumerate(items): open(f'{OUT}/q{j:04d}.txt','w').write(it['prompt'])
json.dump(items,open(f'{OUT}/_meta.json','w'),ensure_ascii=False)
print(f"{OUT}: {len(picks)} 题 x 正反 = {len(items)} 次提问  ({MODE} 负例)")

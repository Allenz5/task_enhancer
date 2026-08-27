import json, numpy as np, sys, collections
rows = json.load(open('tasks.json'))
L = dict(np.load('labels_text.npz'))
key = sys.argv[1]; lab = L[key]
order = [c for c,_ in collections.Counter(lab.tolist()).most_common(int(sys.argv[2]) if len(sys.argv)>2 else 10)]
for c in order:
    idx = [i for i,v in enumerate(lab) if v==c]
    doms = collections.Counter(rows[i]['industry_domain'] for i in idx).most_common(3)
    print(f'\n=== cluster {c}  n={len(idx)}  domains={doms}')
    for i in idx[:6]: print('   ', (rows[i]['task_name'] or '')[:70])

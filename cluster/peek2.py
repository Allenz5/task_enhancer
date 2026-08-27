import json, numpy as np, sys, collections
rows = json.load(open('tasks.json')); prov = {int(k):v for k,v in json.load(open('prov.json')).items()}
L = dict(np.load('labels_llm.npz')); L.update(dict(np.load('labels_text.npz')))
lab = L[sys.argv[1]]
for c,n in collections.Counter(lab.tolist()).most_common(int(sys.argv[2])):
    idx = [i for i,v in enumerate(lab) if v==c]
    prods = collections.Counter(prov[i].get('product','?') for i in idx).most_common(4)
    print(f'\n=== n={n}  products={prods}')
    for i in idx[:4]: print('    ', (rows[i]['task_name'] or '')[:64], '|', prov[i].get('category'))

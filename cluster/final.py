import json, numpy as np, collections
rows = json.load(open('tasks.json')); prov = {int(k):v for k,v in json.load(open('prov.json')).items()}
fam = json.load(open('families.json')); famname = {f['family']: f for f in fam}
famlab = np.load('labels_m11.npz')['M11_llm_taxonomy']
famnames = json.load(open('_m11_names.json')); famnames = {int(k):v for k,v in famnames.items()}
lab = np.load('labels_text.npz')['M4_lsa_kmeans']
out = []
for c in sorted(set(lab.tolist())):
    idx = [i for i,v in enumerate(lab) if v==c]
    prods = collections.Counter(prov[i].get('product','?') for i in idx)
    fams  = collections.Counter(famnames[int(famlab[i])] for i in idx)
    out.append({
        'cluster': int(c), 'n': len(idx),
        'top_products': prods.most_common(5),
        'top_families': fams.most_common(3),
        'ui_skeleton': famname.get(fams.most_common(1)[0][0], {}).get('ui_skeleton',''),
        'sample_tasks': [rows[i]['task_name'] for i in idx[:5]],
        'members': [rows[i]['custom_id'] for i in idx],
    })
out.sort(key=lambda x:-x['n'])
json.dump(out, open('clusters_final.json','w'), ensure_ascii=False, indent=1)
print(f'{len(out)} clusters, {sum(x["n"] for x in out)} tasks\n')
for x in out[:18]:
    print(f"[{x['n']:3d}] {x['top_families'][0][0]:34s} | {', '.join(p for p,_ in x['top_products'][:3])[:70]}")

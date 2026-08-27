import json, numpy as np, collections, csv
rows=json.load(open('tasks.json')); prov={int(k):v for k,v in json.load(open('prov.json')).items()}
famdef={f['family']:f for f in json.load(open('families.json'))}
famlab=np.load('labels_m11.npz')['M11_llm_taxonomy']
fn={int(k):v for k,v in json.load(open('_m11_names.json')).items()}
L=dict(np.load('labels_lowk.npz'))
k30, k80 = L['k30'], L['k80']
out=[]
for c in sorted(set(k30.tolist())):
    idx=[i for i,v in enumerate(k30) if v==c]
    prods=collections.Counter(prov[i].get('product','?') for i in idx)
    fams=collections.Counter(fn[int(famlab[i])] for i in idx)
    out.append({'cluster':int(c),'n':len(idx),
        'top_products':prods.most_common(5),'top_families':fams.most_common(3),
        'ui_skeleton':famdef.get(fams.most_common(1)[0][0],{}).get('ui_skeleton',''),
        'k80_subclusters':sorted(set(int(k80[i]) for i in idx)),
        'sample_tasks':[rows[i]['task_name'] for i in idx[:5]],
        'members':[rows[i]['custom_id'] for i in idx]})
out.sort(key=lambda x:-x['n'])
json.dump(out,open('clusters_k30.json','w'),ensure_ascii=False,indent=1)
with open('assignment.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['custom_id','task_name','cluster_k30','cluster_k80','site_family','llm_product','llm_category','confidence'])
    for i,r in enumerate(rows):
        p=prov[i]
        w.writerow([r['custom_id'],r['task_name'],int(k30[i]),int(k80[i]),fn[int(famlab[i])],
                    p.get('product'),p.get('category'),p.get('confidence')])
print(f'{len(out)} clusters (k=30), {sum(x["n"] for x in out)} tasks\n')
for x in out:
    print(f"[{x['n']:3d}] {x['top_families'][0][0]:32s} | {', '.join(p for p,_ in x['top_products'][:2])[:56]}")

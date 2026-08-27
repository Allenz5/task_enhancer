import json, numpy as np, collections, re
rows=json.load(open('tasks.json')); prov={int(k):v for k,v in json.load(open('prov.json')).items()}
lab=np.load('labels_lowk.npz')['k30']; XY=np.load('xy.npy')
famlab=np.load('labels_m11.npz')['M11_llm_taxonomy']
fn={int(k):v for k,v in json.load(open('_m11_names.json')).items()}
t=open('names.json').read(); t=re.sub(r'^```(json)?|```$','',t.strip(),flags=re.M)
names={o['cluster']:o for o in json.loads(t[t.find('['):t.rfind(']')+1])}
print('labels', len(names))
clus=[]
for c in sorted(set(lab.tolist())):
    idx=np.where(lab==c)[0]
    prods=collections.Counter(prov[i].get('product','?') for i in idx).most_common(3)
    fams=collections.Counter(fn[int(famlab[i])] for i in idx).most_common(1)
    pts=XY[idx]
    # medoid-ish centre: median is robust to the tsne tail
    clus.append({'id':int(c),'n':int(len(idx)),
        'label':names[c]['label'],'en':names[c]['en'],
        'family':fams[0][0],
        'products':[[p,int(k)] for p,k in prods],
        'cx':float(np.median(pts[:,0])),'cy':float(np.median(pts[:,1])),
        'samples':[rows[i]['task_name'][:46] for i in idx[:4]]})
clus.sort(key=lambda x:-x['n'])
pts=[{'x':round(float(XY[i,0]),2),'y':round(float(XY[i,1]),2),'c':int(lab[i])} for i in range(len(rows))]
json.dump({'points':pts,'clusters':clus}, open('plot.json','w'), ensure_ascii=False)
print(f'{len(pts)} points, {len(clus)} clusters')
for c in clus: print(f"  [{c['n']:3d}] {c['label']:8s} {c['family']}")

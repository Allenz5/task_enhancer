import json, numpy as np, collections, itertools, random
rows=json.load(open('tasks.json')); prov={int(k):v for k,v in json.load(open('prov.json')).items()}
fam=np.load('labels_m11.npz')['M11_llm_taxonomy']
prod=np.array([hash(prov[i].get('product','?')) for i in range(len(rows))])
L=dict(np.load('labels_lowk.npz'))
rnd=random.Random(3)
# free proxy: over ALL within-cluster pairs, fraction sharing the LLM site_family
# baseline = same fraction over all random pairs
def rate(lab, ref):
    num=den=0
    for c in set(lab.tolist()):
        idx=np.where(lab==c)[0]
        if len(idx)<2: continue
        r=ref[idx]; cnt=collections.Counter(r.tolist())
        n=len(idx); den+=n*(n-1)//2
        num+=sum(v*(v-1)//2 for v in cnt.values())
    return num/den
allc=collections.Counter(fam.tolist()); n=len(rows)
base_fam=sum(v*(v-1)//2 for v in allc.values())/(n*(n-1)//2)
allp=collections.Counter(prod.tolist())
base_prod=sum(v*(v-1)//2 for v in allp.values())/(n*(n-1)//2)
print(f'random baseline: same-family {base_fam:.3f}   same-product {base_prod:.3f}\n')
print(f'{"k":>4s} {"same-family":>12s} {"lift":>6s} {"same-product":>13s} {"lift":>6s}')
for key in sorted(L, key=lambda s:int(s[1:])):
    lab=L[key]
    f=rate(lab,fam); p=rate(lab,prod)
    print(f'{key[1:]:>4s} {f:12.3f} {(f-base_fam)/(1-base_fam):6.2f} {p:13.3f} {(p-base_prod)/(1-base_prod):6.2f}')

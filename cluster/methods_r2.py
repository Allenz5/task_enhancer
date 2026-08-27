import json, numpy as np, scipy.sparse as sp, collections
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
rows = json.load(open('tasks.json'))
X = normalize(sp.load_npz('tfidf.npz'))
Z = normalize(TruncatedSVD(n_components=100, random_state=0).fit_transform(X))
out = {}
for k in (40, 60, 120, 200):
    out[f'M4k{k}'] = KMeans(n_clusters=k, n_init=8, random_state=0).fit(Z).labels_
# M12: subdivide each LLM family by text similarity (skeleton = family, data = subcluster)
fam = np.load('labels_m11.npz')['M11_llm_taxonomy']
sub = np.zeros(len(rows), dtype=int); nxt = 0
for f in sorted(set(fam.tolist())):
    idx = np.where(fam == f)[0]
    kk = max(1, min(len(idx), round(len(idx)/12)))
    if kk == 1 or len(idx) < 4:
        sub[idx] = nxt; nxt += 1; continue
    lb = KMeans(n_clusters=kk, n_init=6, random_state=0).fit(Z[idx]).labels_
    for c in range(kk): sub[idx[lb == c]] = nxt + c
    nxt += kk
out['M12_family_subcluster'] = sub
np.savez('labels_r2.npz', **out)
for k, v in out.items():
    sz = np.bincount(v); print(f'{k:24s} k={len(set(v.tolist())):4d} mean={len(rows)/len(set(v.tolist())):5.1f} max={sz.max()} singles={(sz==1).sum()}')

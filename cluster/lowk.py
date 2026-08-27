import json, numpy as np, scipy.sparse as sp
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
from sklearn.metrics import silhouette_score
rows = json.load(open('tasks.json'))
X = normalize(sp.load_npz('tfidf.npz'))
Z = normalize(TruncatedSVD(n_components=100, random_state=0).fit_transform(X))
Dt = np.clip(1-(X@X.T).toarray(),0,2); np.fill_diagonal(Dt,0)
out = {}
print(f'{"k":>4s} {"inertia":>9s} {"drop%":>6s} {"sil":>7s} {"max":>5s} {"min":>4s} {"med":>5s}')
prev = None
for k in (5,8,10,12,15,20,25,30,40,50,60,80):
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(Z)
    out[f'k{k}'] = km.labels_
    sz = np.bincount(km.labels_)
    sil = silhouette_score(Dt, km.labels_, metric='precomputed')
    drop = '' if prev is None else f'{(prev-km.inertia_)/prev*100:5.1f}%'
    print(f'{k:4d} {km.inertia_:9.1f} {drop:>6s} {sil:7.3f} {sz.max():5d} {sz.min():4d} {int(np.median(sz)):5d}')
    prev = km.inertia_
np.savez('labels_lowk.npz', **out)

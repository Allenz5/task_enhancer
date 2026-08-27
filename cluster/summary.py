import json, numpy as np, collections
from sklearn.metrics import silhouette_score, adjusted_rand_score as ari, homogeneity_score
import scipy.sparse as sp
from sklearn.preprocessing import normalize

rows = json.load(open('tasks.json'))
prov = {int(k):v for k,v in json.load(open('prov.json')).items()}
L = {}
for f in ('labels_text.npz','labels_llm.npz','labels_m11.npz'): L.update(dict(np.load(f)))
X = normalize(sp.load_npz('tfidf.npz'))
Dt = np.clip(1-(X@X.T).toarray(),0,2); np.fill_diagonal(Dt,0)

# weak reference labels
prodlab = {}
ref = np.array([prodlab.setdefault(prov[i].get('product','?'), len(prodlab)) for i in range(len(rows))])

N = len(rows)
print(f'{"method":22s} {"k":>5s} {"reuse":>7s} {"cov>=2":>7s} {"max":>5s} {"med":>5s} {"sil_txt":>8s} {"homog":>7s}')
order = ['B0_industry_domain','M1_lexicon','M2_kmeans','M3_agglom','M4_lsa_kmeans','M5_dbscan','M6_nearcc','M7_llm_category','M8_llm_product','M9_llm_fuzzy','M10_hybrid','M11_llm_taxonomy']
for m in order:
    lab = L[m]; sz = np.bincount(lab[lab>=0]); k = len(set(lab.tolist()))
    cov = sz[sz>=2].sum()/N
    sil = silhouette_score(Dt, lab, metric='precomputed') if 1 < k < N else float('nan')
    hom = homogeneity_score(ref, lab)
    print(f'{m:22s} {k:5d} {N/k:6.1f}x {cov:6.1%} {sz.max():5d} {int(np.median(sz)):5d} {sil:8.3f} {hom:7.3f}')

print('\nARI vs M11 (LLM taxonomy):')
for m in order:
    print(f'  {m:22s} {ari(L[m], L["M11_llm_taxonomy"]):.3f}')

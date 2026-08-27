import json, numpy as np, scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import normalize
from scipy.sparse.csgraph import connected_components
import lexicon, corpus

rows = json.load(open('tasks.json')); docs = json.load(open('docs.json'))
X = normalize(sp.load_npz('tfidf.npz'))
D = 1.0 - (X @ X.T).toarray()          # cosine distance
np.clip(D, 0, 2, out=D); np.fill_diagonal(D, 0)
labels = {}

# --- B0 naive baseline: group by normalized industry_domain string
def norm(s): return ' '.join((s or '?').split()).lower()
doms = sorted({norm(r['industry_domain']) for r in rows})
labels['B0_industry_domain'] = np.array([doms.index(norm(r['industry_domain'])) for r in rows])

# --- M1 keyword lexicon
cats = {}
l1 = []
for r, d in zip(rows, docs):
    c = lexicon.label(d)
    l1.append(cats.setdefault(c, len(cats)))
labels['M1_lexicon'] = np.array(l1)
json.dump({v: k for k, v in cats.items()}, open('_m1_names.json','w'))

# --- M2 TF-IDF + KMeans, sweep k
best = None
for k in (12, 20, 30, 40, 60, 80, 120):
    km = KMeans(n_clusters=k, n_init=6, random_state=0).fit(X)
    s = silhouette_score(D, km.labels_, metric='precomputed')
    print(f'  kmeans k={k:4d} silhouette={s:.4f}')
    if best is None or s > best[0]: best = (s, k, km.labels_)
print(f'M2 best k={best[1]} sil={best[0]:.4f}')
labels['M2_kmeans'] = best[2]

# --- M3 Agglomerative average-linkage on cosine, sweep threshold
best = None
for t in (0.75, 0.80, 0.85, 0.88, 0.90, 0.92):
    ac = AgglomerativeClustering(n_clusters=None, distance_threshold=t,
                                 metric='precomputed', linkage='average').fit(D)
    k = ac.labels_.max() + 1
    if k < 2 or k >= len(rows): continue
    s = silhouette_score(D, ac.labels_, metric='precomputed')
    print(f'  agglom t={t} k={k:4d} silhouette={s:.4f}')
    if best is None or s > best[0]: best = (s, t, ac.labels_)
print(f'M3 best t={best[1]} k={best[2].max()+1} sil={best[0]:.4f}')
labels['M3_agglom'] = best[2]

# --- M4 LSA(SVD) + KMeans
Z = normalize(TruncatedSVD(n_components=100, random_state=0).fit_transform(X))
best = None
for k in (20, 30, 40, 60, 80):
    km = KMeans(n_clusters=k, n_init=6, random_state=0).fit(Z)
    s = silhouette_score(D, km.labels_, metric='precomputed')
    print(f'  lsa+km k={k:4d} silhouette={s:.4f}')
    if best is None or s > best[0]: best = (s, k, km.labels_)
print(f'M4 best k={best[1]} sil={best[0]:.4f}')
labels['M4_lsa_kmeans'] = best[2]

# --- M5 DBSCAN on cosine distance (noise-aware)
best = None
for eps in (0.55, 0.65, 0.75, 0.82):
    db = DBSCAN(eps=eps, min_samples=3, metric='precomputed').fit(D)
    k = len(set(db.labels_)) - (1 if -1 in db.labels_ else 0)
    noise = (db.labels_ == -1).sum()
    print(f'  dbscan eps={eps} k={k:4d} noise={noise}')
    if k >= 2 and (best is None or k > best[1]): best = (eps, k, db.labels_, noise)
labels['M5_dbscan'] = best[2]
print(f'M5 eps={best[0]} k={best[1]} noise={best[3]}')

# --- M6 connected components of the near-duplicate graph
A = sp.csr_matrix((1 - D) >= 0.55)
n, cc = connected_components(A, directed=False)
labels['M6_nearcc'] = cc
print(f'M6 components={n}')

np.savez('labels_text.npz', **labels)
for k, v in labels.items():
    sz = np.bincount(v[v >= 0]) if v.min() >= 0 else np.bincount(v[v >= 0])
    print(f'{k:22s} k={len(set(v)):4d}  largest={sz.max():4d}  singletons={(sz==1).sum():4d}')

import json, re, numpy as np, collections
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize

rows = json.load(open('tasks.json'))
prov = {int(k): v for k, v in json.load(open('prov.json')).items()}
N = len(rows)

def get(i, f, d=''):
    p = prov.get(i) or {}
    v = p.get(f)
    return v if isinstance(v, str) and v.strip() else d

def canon(s):
    s = s.lower().strip()
    s = re.sub(r'\(.*?\)|（.*?）', ' ', s)          # drop parentheticals
    s = re.sub(r'[^a-z0-9一-鿿]+', ' ', s)
    return ' '.join(s.split())

labels = {}

# --- M7 exact grouping on the LLM category slug
cats = {}
labels['M7_llm_category'] = np.array([cats.setdefault(canon(get(i,'category','unknown')) or 'unknown', len(cats)) for i in range(N)])

# --- M8 exact grouping on the canonicalized product name
prods = {}
labels['M8_llm_product'] = np.array([prods.setdefault(canon(get(i,'product','unknown')) or 'unknown', len(prods)) for i in range(N)])

# --- M9 fuzzy merge: agglomerative over char-ngram TF-IDF of "product + category + surface"
txt = [f"{get(i,'product')} {get(i,'category')} {get(i,'category')} {get(i,'surface')}" for i in range(N)]
V = TfidfVectorizer(analyzer='char_wb', ngram_range=(2,5), min_df=1, sublinear_tf=True)
Y = normalize(V.fit_transform(txt))
D = np.clip(1 - (Y @ Y.T).toarray(), 0, 2); np.fill_diagonal(D, 0)
from sklearn.metrics import silhouette_score
best = None
for t in (0.35, 0.45, 0.55, 0.62, 0.70, 0.78):
    ac = AgglomerativeClustering(n_clusters=None, distance_threshold=t,
                                 metric='precomputed', linkage='average').fit(D)
    k = ac.labels_.max()+1
    if k < 2 or k >= N: continue
    s = silhouette_score(D, ac.labels_, metric='precomputed')
    sz = np.bincount(ac.labels_)
    print(f'  M9 t={t} k={k:4d} sil={s:.3f} largest={sz.max()} singles={(sz==1).sum()}')
    if best is None or s > best[0]: best = (s, t, ac.labels_)
labels['M9_llm_fuzzy'] = best[2]
print(f'M9 best t={best[1]} k={best[2].max()+1} sil={best[0]:.3f}')

# --- M10 hybrid: LLM provenance text  +  raw task text (concatenated feature spaces)
import scipy.sparse as sp
Xt = normalize(sp.load_npz('tfidf.npz'))
H = sp.hstack([Y * 0.7, Xt * 0.3]).tocsr()
H = normalize(H)
Dh = np.clip(1 - (H @ H.T).toarray(), 0, 2); np.fill_diagonal(Dh, 0)
best = None
for t in (0.55, 0.65, 0.72, 0.80, 0.86):
    ac = AgglomerativeClustering(n_clusters=None, distance_threshold=t,
                                 metric='precomputed', linkage='average').fit(Dh)
    k = ac.labels_.max()+1
    if k < 2 or k >= N: continue
    s = silhouette_score(Dh, ac.labels_, metric='precomputed')
    sz = np.bincount(ac.labels_)
    print(f'  M10 t={t} k={k:4d} sil={s:.3f} largest={sz.max()} singles={(sz==1).sum()}')
    if best is None or s > best[0]: best = (s, t, ac.labels_)
labels['M10_hybrid'] = best[2]
print(f'M10 best t={best[1]} k={best[2].max()+1} sil={best[0]:.3f}')

np.savez('labels_llm.npz', **labels)
np.save('D_llm.npy', D.astype(np.float32)); np.save('D_hybrid.npy', Dh.astype(np.float32))
for k, v in labels.items():
    sz = np.bincount(v)
    print(f'{k:18s} k={len(set(v)):4d} largest={sz.max():4d} singletons={(sz==1).sum():4d}')

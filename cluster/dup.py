import json, numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from scipy.sparse.csgraph import connected_components
from scipy.sparse import csr_matrix

rows = json.load(open('tasks.json')); docs = json.load(open('docs.json'))
V = TfidfVectorizer(analyzer='char_wb', ngram_range=(2,4), min_df=3, max_features=200000, sublinear_tf=True)
X = V.fit_transform(docs)
print('tfidf', X.shape)
np.save('_tfidf_shape.npy', np.array(X.shape))
import scipy.sparse as sp
sp.save_npz('tfidf.npz', X)

S = (X @ X.T).toarray()
np.fill_diagonal(S, 0)
for t in (0.9, 0.8, 0.7, 0.6, 0.5):
    A = csr_matrix(S >= t)
    n, lab = connected_components(A, directed=False)
    sizes = np.bincount(lab)
    print(f'thr={t}  components={n}  singletons={(sizes==1).sum()}  largest={sizes.max()}  '
          f'covered_by_top20={sorted(sizes)[-20:] and sum(sorted(sizes)[-20:])}')
np.save('sim.npy', S.astype(np.float32))

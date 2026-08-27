import json, numpy as np, scipy.sparse as sp
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize
from sklearn.manifold import TSNE
X = normalize(sp.load_npz('tfidf.npz'))
Z = normalize(TruncatedSVD(n_components=100, random_state=0).fit_transform(X))
P = TSNE(n_components=2, metric='cosine', init='pca', perplexity=30,
         random_state=0, max_iter=1500).fit_transform(Z)
np.save('xy.npy', P.astype(np.float32))
print('tsne done', P.shape, P.min(0), P.max(0))

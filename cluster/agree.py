import json, numpy as np, itertools
from sklearn.metrics import adjusted_rand_score as ari, adjusted_mutual_info_score as ami
L = dict(np.load('labels_text.npz'))
ks = list(L)
print('pairwise ARI / AMI')
print('%-22s' % '', ' '.join(f'{k[:10]:>10s}' for k in ks))
for a in ks:
    print('%-22s' % a, ' '.join(f'{ari(L[a],L[b]):10.3f}' for b in ks))
print()
print('%-22s' % 'AMI', ' '.join(f'{k[:10]:>10s}' for k in ks))
for a in ks:
    print('%-22s' % a, ' '.join(f'{ami(L[a],L[b]):10.3f}' for b in ks))

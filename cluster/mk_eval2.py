import json, os, random, numpy as np, collections
rows = json.load(open('tasks.json'))
L = dict(np.load('labels_r2.npz'))
METHODS = ['M4k40','M4k60','M4k120','M4k200','M12_family_subcluster']
rnd = random.Random(19); NP = 50
pairs = []
for m in METHODS:
    lab = L[m]; g = collections.defaultdict(list)
    for i,v in enumerate(lab): g[int(v)].append(i)
    pool = [x for x in g.values() if len(x) >= 2]; got = set()
    while len(got) < NP:
        c = rnd.choice(pool); i,j = rnd.sample(c,2); got.add((min(i,j),max(i,j)))
    pairs += [(m,i,j) for i,j in got]
ctrl = set()
while len(ctrl) < 40:
    i,j = rnd.sample(range(len(rows)),2); ctrl.add((min(i,j),max(i,j)))
pairs += [('CTRL_random',i,j) for i,j in ctrl]
rnd.shuffle(pairs)
json.dump(pairs, open('eval_pairs2.json','w')); print('pairs', len(pairs))
def dig(i):
    r = rows[i]
    return (f"name: {r['task_name']}\ndomain: {r['industry_domain']}\n"
            f"files: {', '.join((f['name'] or '') for f in r['files'][:6])}\n"
            f"desc: {r['desc'][:420]}\nreqs: {r['reqs'][:300]}")
HEAD = open('ev/e00000.txt').read().split('### PAIR')[0]
os.makedirs('ev2', exist_ok=True)
B = 8
for s in range(0, len(pairs), B):
    body = [f"### PAIR {s+k}\n--- A ---\n{dig(i)}\n--- B ---\n{dig(j)}\n" for k,(m,i,j) in enumerate(pairs[s:s+B])]
    open(f'ev2/e{s:05d}.txt','w').write(HEAD + '\n'.join(body))
print('batches', len([x for x in os.listdir('ev2') if x.endswith('.txt')]))

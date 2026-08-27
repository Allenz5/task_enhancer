import json, os, random, numpy as np, collections
rows = json.load(open('tasks.json'))
L = {}
for f in ('labels_text.npz','labels_m11.npz','labels_r2.npz'): L.update(dict(np.load(f)))
PLAN = [('M4k40',100), ('M4_lsa_kmeans',100), ('M4k120',60), ('M11_llm_taxonomy',60)]
rnd = random.Random(101); pairs = []
for m, np_ in PLAN:
    lab = L[m]; g = collections.defaultdict(list)
    for i,v in enumerate(lab): g[int(v)].append(i)
    pool = [x for x in g.values() if len(x) >= 2]; got = set()
    while len(got) < np_:
        c = rnd.choice(pool); i,j = rnd.sample(c,2); got.add((min(i,j),max(i,j)))
    pairs += [(m,i,j) for i,j in got]
ctrl = set()
while len(ctrl) < 60:
    i,j = rnd.sample(range(len(rows)),2); ctrl.add((min(i,j),max(i,j)))
pairs += [('CTRL_random',i,j) for i,j in ctrl]
rnd.shuffle(pairs); json.dump(pairs, open('eval_pairs3.json','w')); print('pairs', len(pairs))
def dig(i):
    r = rows[i]
    return (f"name: {r['task_name']}\ndomain: {r['industry_domain']}\n"
            f"files: {', '.join((f['name'] or '') for f in r['files'][:6])}\n"
            f"desc: {r['desc'][:420]}\nreqs: {r['reqs'][:300]}")
HEAD = open('ev/e00000.txt').read().split('### PAIR')[0]
os.makedirs('ev3', exist_ok=True)
for s in range(0, len(pairs), 8):
    body = [f"### PAIR {s+k}\n--- A ---\n{dig(i)}\n--- B ---\n{dig(j)}\n" for k,(m,i,j) in enumerate(pairs[s:s+8])]
    open(f'ev3/e{s:05d}.txt','w').write(HEAD + '\n'.join(body))
print('batches', len([x for x in os.listdir('ev3') if x.endswith('.txt')]))

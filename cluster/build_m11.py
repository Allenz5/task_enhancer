import json, glob, collections, numpy as np
rows = json.load(open('tasks.json'))
prov = {int(k):v for k,v in json.load(open('prov.json')).items()}
lines = json.load(open('vocab_lines.json'))
fam = json.load(open('families.json'))
valid = {f['family'] for f in fam} | {'other'}

def objects(t):
    dec = json.JSONDecoder(); i = 0
    while True:
        i = t.find('{', i)
        if i < 0: return
        try: o, j = dec.raw_decode(t, i)
        except ValueError: i += 1; continue
        yield o; i = j

asg = {}
for f in sorted(glob.glob('asg/a*.json')):
    for o in objects(open(f).read()):
        if isinstance(o, dict) and isinstance(o.get('i'), int) and o.get('family') in valid:
            asg[o['i']] = o['family']
print('assigned', len(asg), '/', len(lines))
miss = [i for i in range(len(lines)) if i not in asg]
print('unassigned rows', len(miss))

# vocab row index -> (product, category)
key2fam = {}
for i, l in enumerate(lines):
    if '\t' not in l: continue
    _, prod, cat = l.split('\t')
    key2fam[(prod, cat)] = asg.get(i, 'other')

names, l11 = {}, []
unmapped = 0
for i in range(len(rows)):
    p = prov[i]
    f = key2fam.get((p.get('product','?'), p.get('category','?')))
    if f is None: f = 'other'; unmapped += 1
    l11.append(names.setdefault(f, len(names)))
print('tasks with no family', unmapped)
lab = np.array(l11)
np.savez('labels_m11.npz', M11_llm_taxonomy=lab)
json.dump({v:k for k,v in names.items()}, open('_m11_names.json','w'))

cnt = collections.Counter(key2fam.get((prov[i].get('product','?'), prov[i].get('category','?')), 'other') for i in range(len(rows)))
print(f'\n=== M11: {len(cnt)} site families over {len(rows)} tasks')
cum = 0
for k, v in cnt.most_common():
    cum += v
    print(f'{v:5d}  {cum*100/len(rows):5.1f}%  {k}')

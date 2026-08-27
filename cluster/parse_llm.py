import json, glob, re, collections

rows = json.load(open('tasks.json'))

def objects(t):
    """Scan out every balanced {...} and json-decode it. Robust to fences,
    concatenated arrays, and trailing prose."""
    dec = json.JSONDecoder()
    i = 0
    while True:
        i = t.find('{', i)
        if i < 0: return
        try:
            o, j = dec.raw_decode(t, i)
        except ValueError:
            i += 1; continue
        yield o; i = j

prov, bad = {}, []
for f in sorted(glob.glob('out/b*.json')):
    t = open(f).read()
    got = 0
    for o in objects(t):
        if isinstance(o, dict) and isinstance(o.get('id'), int) and 'product' in o:
            prov[o['id']] = o; got += 1
    if not got: bad.append(f)

missing = [i for i in range(len(rows)) if i not in prov]
print('parsed', len(prov), '/', len(rows), '| unparseable files', len(bad), bad[:6])
print('missing ids', len(missing), missing[:20])
json.dump(prov, open('prov.json','w'), ensure_ascii=False)
json.dump(missing, open('missing.json','w'))

print('\n--- top categories (%d distinct)' % len({p.get('category') for p in prov.values()}))
for k,v in collections.Counter(p.get('category','?') for p in prov.values()).most_common(30): print(f'{v:5d}  {k}')
print('\n--- top products (%d distinct)' % len({p.get('product') for p in prov.values()}))
for k,v in collections.Counter(p.get('product','?') for p in prov.values()).most_common(20): print(f'{v:5d}  {k}')
print('\n--- confidence', collections.Counter(round(float(p.get('confidence',0) or 0),1) for p in prov.values()).most_common())
